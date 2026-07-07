package api

import (
	"database/sql"
	"net/http"

	"github.com/go-chi/chi/v5"
	dbstore "github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

type RentalHandler struct {
	DB *sql.DB
}

func (h RentalHandler) Register(r chi.Router) {
	r.Get("/events/{eventID}/rentals", h.getSummary)
}

func (h RentalHandler) getSummary(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	summary, err := dbstore.GetRentalSummary(h.DB, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if summary.Items == nil {
		summary.Items = []domain.EventRental{}
	}
	writeJSON(w, http.StatusOK, summary)
}
