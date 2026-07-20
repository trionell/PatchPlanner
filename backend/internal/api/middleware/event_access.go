package middleware

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/trionell/patchplanner/internal/db"
)

type eventRoleContextKey int

const eventRoleKey eventRoleContextKey = iota

var mutatingMethods = map[string]bool{
	http.MethodPost:   true,
	http.MethodPut:    true,
	http.MethodPatch:  true,
	http.MethodDelete: true,
}

// RequireEventAccess resolves the caller's role on the {eventID} in the
// URL and gates the request by HTTP method: GET needs at least viewer,
// mutating methods need owner or contributor. A caller with no role at
// all gets 404 — the event must be completely invisible to them (FR-008,
// research.md R2), not merely forbidden. Must run behind RequireAuth,
// which has already put the user in context.
func RequireEventAccess(database *sql.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, _ := UserFromContext(r.Context())

			eventID, err := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
			if err != nil {
				writeEventNotFound(w)
				return
			}

			role, found, err := db.GetEventRole(database, eventID, user.ID)
			if err != nil {
				writeEventError(w, http.StatusInternalServerError, "check event access")
				return
			}
			if !found {
				writeEventNotFound(w)
				return
			}
			if role == "viewer" && mutatingMethods[r.Method] {
				writeEventError(w, http.StatusForbidden, "viewers cannot make changes to this event")
				return
			}

			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), eventRoleKey, role)))
		})
	}
}

// EventRoleFromContext returns the caller's role on the current request's
// event, as resolved by RequireEventAccess.
func EventRoleFromContext(ctx context.Context) (string, bool) {
	role, ok := ctx.Value(eventRoleKey).(string)
	return role, ok
}

func writeEventNotFound(w http.ResponseWriter) {
	writeEventError(w, http.StatusNotFound, "event not found")
}

func writeEventError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
