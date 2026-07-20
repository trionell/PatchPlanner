package middleware

import (
	"context"
	"database/sql"
	"encoding/json"
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
func RequireAuth(database *sql.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(SessionCookieName)
			if err != nil {
				writeUnauthorized(w)
				return
			}
			user, err := db.GetSessionUser(database, cookie.Value)
			if err != nil {
				writeUnauthorized(w)
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
