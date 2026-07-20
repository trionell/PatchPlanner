package api

import (
	"database/sql"
	"net/http"

	"github.com/go-chi/chi/v5"
	dbstore "github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

type UsersHandler struct {
	DB *sql.DB
}

// Register wires GET /users — not event-scoped, any signed-in user may
// list known users for the invite picker (research.md R6).
func (h UsersHandler) Register(r chi.Router) {
	r.Get("/users", h.list)
}

func (h UsersHandler) list(w http.ResponseWriter, r *http.Request) {
	users, err := dbstore.ListUsers(h.DB)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if users == nil {
		users = []domain.User{}
	}
	writeJSON(w, http.StatusOK, users)
}
