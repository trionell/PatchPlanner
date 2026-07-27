package middleware

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

// SessionCookieName is shared with internal/api's auth handler, which sets
// and clears the cookie this middleware reads.
const SessionCookieName = "pp_session"

type contextKey int

const userContextKey contextKey = iota

// RequireAuth resolves the session cookie to a user and injects it into the
// request context; requests without a valid, unexpired session are
// rejected with 401 before reaching next.
//
// **Only a missing row is a 401.** This used to answer 401 to every error
// GetSessionUser could return, which meant a transient database failure —
// SQLITE_BUSY while another request was committing — read to the browser as
// "your session expired". The client redirects to /login on any 401, /login
// bounces an authenticated user to the dashboard, and the user was thrown off
// the page they were working on with no error and nothing saved. Dragging a
// node in the audio graphs did it, because a position write and the refetch it
// invalidates collide by design.
//
// So a database that cannot answer is a 500 the client shows as an error, and
// the session is only ever revoked because it genuinely is not there.
func RequireAuth(database *sql.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(SessionCookieName)
			if err != nil {
				writeUnauthorized(w)
				return
			}
			user, err := db.GetSessionUser(database, cookie.Value)
			if errors.Is(err, sql.ErrNoRows) {
				writeUnauthorized(w)
				return
			}
			if err != nil {
				writeSessionLookupFailed(w)
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userContextKey, user)))
		})
	}
}

// UserFromContext returns the user injected by RequireAuth, if any.
func UserFromContext(ctx context.Context) (domain.User, bool) {
	user, ok := ctx.Value(userContextKey).(domain.User)
	return user, ok
}

func writeUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": "not authenticated"})
}

// writeSessionLookupFailed answers the case where the session may well be
// valid but the database could not say so. Deliberately not a 401: the client
// treats 401 as "sign in again", and doing that to a working session loses the
// user's place for a fault that has nothing to do with them.
func writeSessionLookupFailed(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusInternalServerError)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": "could not read the session"})
}
