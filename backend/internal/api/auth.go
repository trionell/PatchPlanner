package api

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"net/http"
	"net/url"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/trionell/patchplanner/internal/api/middleware"
	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/service"
)

// AuthConfig holds the OAuth/session configuration built from environment
// variables in cmd/main.go.
type AuthConfig struct {
	Provider      service.IdentityProvider
	AllowedEmails []string
	FrontendURL   string
	SessionTTL    time.Duration
}

type AuthHandler struct {
	DB     *sql.DB
	Config AuthConfig
}

const oauthStateCookieName = "pp_oauth_state"

// Register wires the unauthenticated auth routes: signing in, completing
// the OAuth round trip, and signing out are all reachable without an
// existing session.
func (h AuthHandler) Register(r chi.Router) {
	r.Get("/auth/google/login", h.login)
	r.Get("/auth/google/callback", h.callback)
	r.Post("/auth/logout", h.logout)
}

// RegisterMe registers /auth/me inside the authenticated route group —
// RequireAuth's own 401 already means "not logged in," so the handler
// itself only ever runs once a user is resolved.
func (h AuthHandler) RegisterMe(r chi.Router) {
	r.Get("/auth/me", h.me)
}

func (h AuthHandler) login(w http.ResponseWriter, r *http.Request) {
	state, err := randomToken(16)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "generate state")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     oauthStateCookieName,
		Value:    state,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil,
		MaxAge:   600,
	})
	http.Redirect(w, r, h.Config.Provider.AuthCodeURL(state), http.StatusFound)
}

func (h AuthHandler) callback(w http.ResponseWriter, r *http.Request) {
	// The state cookie is single-use; clear it on the way out regardless
	// of outcome.
	http.SetCookie(w, &http.Cookie{Name: oauthStateCookieName, Value: "", Path: "/", MaxAge: -1})

	stateCookie, err := r.Cookie(oauthStateCookieName)
	if err != nil || stateCookie.Value == "" || r.URL.Query().Get("state") != stateCookie.Value {
		h.redirectToLogin(w, r, "state_mismatch", "")
		return
	}

	profile, err := h.Config.Provider.Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		h.redirectToLogin(w, r, "exchange_failed", "")
		return
	}

	// Allow-list check happens before any users write — a rejected
	// attempt must leave no trace (FR-003).
	if !service.IsAllowedEmail(profile.Email, h.Config.AllowedEmails) {
		h.redirectToLogin(w, r, "not_allowed", profile.Email)
		return
	}

	user, err := db.UpsertUserByGoogleSub(h.DB, profile.Sub, profile.Email, profile.Name, profile.PictureURL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create user")
		return
	}

	token, err := db.CreateSession(h.DB, user.ID, h.Config.SessionTTL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create session")
		return
	}

	// Claim any event that predates Slice 15 (owner_user_id still NULL).
	// The WHERE clause is the atomic guard (research.md R3): whoever logs
	// in first after this ships claims every such event, and this call is
	// a no-op for everyone after that — no separate "am I first" check.
	if _, err := db.ClaimOwnerlessEvents(h.DB, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "claim ownerless events")
		return
	}

	// Slice 16: guarantee the user owns at least one inventory — claims
	// the legacy bootstrap catalog if still unowned, else creates a fresh
	// empty one; a no-op if they already own one (research.md R4).
	if err := db.EnsureUserHasInventory(h.DB, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "ensure user inventory")
		return
	}
	// Idempotent copy-from-seed, not a claim — every user gets their own
	// personal vocabulary template (Slice 17 research.md R5).
	if err := db.EnsureUserHasReferenceTemplate(h.DB, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "ensure user reference template")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     middleware.SessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil,
		MaxAge:   int(h.Config.SessionTTL.Seconds()),
	})
	http.Redirect(w, r, h.Config.FrontendURL+"/", http.StatusFound)
}

func (h AuthHandler) me(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	writeJSON(w, http.StatusOK, user)
}

// logout is intentionally idempotent: a repeat call, or one with no
// session at all, is not an error.
func (h AuthHandler) logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(middleware.SessionCookieName); err == nil {
		_ = db.DeleteSession(h.DB, cookie.Value)
	}
	http.SetCookie(w, &http.Cookie{Name: middleware.SessionCookieName, Value: "", Path: "/", MaxAge: -1})
	w.WriteHeader(http.StatusNoContent)
}

func (h AuthHandler) redirectToLogin(w http.ResponseWriter, r *http.Request, errCode, email string) {
	target := h.Config.FrontendURL + "/login?error=" + url.QueryEscape(errCode)
	if email != "" {
		target += "&email=" + url.QueryEscape(email)
	}
	http.Redirect(w, r, target, http.StatusFound)
}

func randomToken(numBytes int) (string, error) {
	raw := make([]byte, numBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}
