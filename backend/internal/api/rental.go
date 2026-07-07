package api

import (
	"database/sql"
	"encoding/json"
	"errors"
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
	r.Put("/events/{eventID}/rentals/manual/{itemID}", h.putManualLine)
	r.Delete("/events/{eventID}/rentals/manual/{itemID}", h.deleteManualLine)
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

func (h RentalHandler) putManualLine(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	itemID, ok := parseID(w, chi.URLParam(r, "itemID"))
	if !ok {
		return
	}
	var payload domain.ManualRentalRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if payload.QuantityAudio < 0 || payload.QuantityLighting < 0 {
		writeError(w, http.StatusBadRequest, "quantities must not be negative")
		return
	}
	if !h.requireEventAndItem(w, eventID, itemID) {
		return
	}
	if err := dbstore.UpsertManualRental(h.DB, eventID, itemID, payload); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	line, err := dbstore.GetRentalLine(h.DB, eventID, itemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, line)
}

func (h RentalHandler) deleteManualLine(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	itemID, ok := parseID(w, chi.URLParam(r, "itemID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteManualRental(h.DB, eventID, itemID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h RentalHandler) requireEventAndItem(w http.ResponseWriter, eventID, itemID int64) bool {
	if _, err := dbstore.GetEvent(h.DB, eventID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "event not found")
			return false
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return false
	}
	if _, err := dbstore.GetInventoryItem(h.DB, itemID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "inventory item not found")
			return false
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return false
	}
	return true
}
