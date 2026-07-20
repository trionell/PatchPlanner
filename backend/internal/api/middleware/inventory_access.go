package middleware

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/trionell/patchplanner/internal/db"
)

// RequireInventoryOwner gates every /inventories/{inventoryID}/... route:
// unlike RequireEventAccess, there is no role gradient here — direct
// catalog management is owner-only for every method, including GET
// (research.md R3). A non-owner (or nonexistent inventory) 404s, the same
// "completely invisible" treatment RequireEventAccess gives a non-member.
func RequireInventoryOwner(database *sql.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, _ := UserFromContext(r.Context())

			inventoryID, err := strconv.ParseInt(chi.URLParam(r, "inventoryID"), 10, 64)
			if err != nil {
				writeInventoryNotFound(w)
				return
			}

			inventory, err := db.GetInventory(database, inventoryID)
			if err != nil {
				writeInventoryNotFound(w)
				return
			}
			if inventory.OwnerUserID != user.ID {
				writeInventoryNotFound(w)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func writeInventoryNotFound(w http.ResponseWriter) {
	writeEventError(w, http.StatusNotFound, "inventory not found")
}
