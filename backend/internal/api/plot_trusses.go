package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	dbstore "github.com/trionell/patchplanner/internal/db"
)

// Plot truss routes (event-scoped, Slice 13 US5). Registered from
// StagePlotsHandler.Register.

func (h StagePlotsHandler) registerTrussRoutes(r chi.Router) {
	r.Route("/events/{eventID}/plot-trusses", func(r chi.Router) {
		r.Get("/", h.listTrusses)
		r.Post("/", h.createTruss)
		r.Route("/{trussID}", func(r chi.Router) {
			r.Patch("/", h.updateTruss)
			r.Delete("/", h.deleteTruss)
			r.Post("/pieces", h.createTrussPiece)
			r.Patch("/pieces/{pieceID}", h.updateTrussPiece)
			r.Delete("/pieces/{pieceID}", h.deleteTrussPiece)
			r.Put("/fixtures/{fixtureID}", h.attachTrussFixture)
			r.Delete("/fixtures/{fixtureID}", h.detachTrussFixture)
		})
	})
}

func (h StagePlotsHandler) eventAndTruss(w http.ResponseWriter, r *http.Request) (int64, int64, bool) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return 0, 0, false
	}
	trussID, ok := parseID(w, chi.URLParam(r, "trussID"))
	if !ok {
		return 0, 0, false
	}
	belongs, err := dbstore.StagePlotTrussBelongsToEvent(h.DB, eventID, trussID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return 0, 0, false
	}
	if !belongs {
		writeError(w, http.StatusNotFound, "truss not found")
		return 0, 0, false
	}
	return eventID, trussID, true
}

func (h StagePlotsHandler) respondTruss(w http.ResponseWriter, status int, eventID, trussID int64) {
	truss, err := dbstore.GetPlotTruss(h.DB, eventID, trussID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, status, truss)
}

func (h StagePlotsHandler) listTrusses(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	trusses, err := dbstore.ListPlotTrusses(h.DB, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, trusses)
}

func (h StagePlotsHandler) createTruss(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	if _, err := dbstore.GetEvent(h.DB, eventID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "event not found")
		} else {
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	var req struct {
		Name     string  `json:"name"`
		HeightCm float64 `json:"height_cm"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.HeightCm < 0 {
		writeError(w, http.StatusBadRequest, "height_cm cannot be negative")
		return
	}
	truss, err := dbstore.CreatePlotTruss(h.DB, eventID, strings.TrimSpace(req.Name), req.HeightCm)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, truss)
}

func (h StagePlotsHandler) updateTruss(w http.ResponseWriter, r *http.Request) {
	eventID, trussID, ok := h.eventAndTruss(w, r)
	if !ok {
		return
	}
	truss, err := dbstore.GetPlotTruss(h.DB, eventID, trussID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var patch struct {
		Name     *string  `json:"name"`
		HeightCm *float64 `json:"height_cm"`
	}
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	name := truss.Name
	height := truss.HeightCm
	if patch.Name != nil {
		if strings.TrimSpace(*patch.Name) == "" {
			writeError(w, http.StatusBadRequest, "name cannot be empty")
			return
		}
		name = strings.TrimSpace(*patch.Name)
	}
	if patch.HeightCm != nil {
		if *patch.HeightCm < 0 {
			writeError(w, http.StatusBadRequest, "height_cm cannot be negative")
			return
		}
		height = *patch.HeightCm
	}
	if err := dbstore.UpdatePlotTruss(h.DB, eventID, trussID, name, height); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.respondTruss(w, http.StatusOK, eventID, trussID)
}

func (h StagePlotsHandler) deleteTruss(w http.ResponseWriter, r *http.Request) {
	eventID, trussID, ok := h.eventAndTruss(w, r)
	if !ok {
		return
	}
	if err := dbstore.DeletePlotTruss(h.DB, eventID, trussID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- Pieces ----

func (h StagePlotsHandler) createTrussPiece(w http.ResponseWriter, r *http.Request) {
	eventID, trussID, ok := h.eventAndTruss(w, r)
	if !ok {
		return
	}
	var req struct {
		InventoryItemID *int64  `json:"inventory_item_id"`
		Label           string  `json:"label"`
		LengthCm        float64 `json:"length_cm"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.LengthCm <= 0 {
		writeError(w, http.StatusBadRequest, "length_cm must be positive")
		return
	}
	if req.InventoryItemID != nil {
		if _, err := dbstore.GetInventoryItem(h.DB, *req.InventoryItemID); err != nil {
			writeError(w, http.StatusNotFound, "inventory item not found")
			return
		}
	}
	if _, err := dbstore.CreatePlotTrussPiece(h.DB, trussID, req.InventoryItemID, req.Label, req.LengthCm); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.respondTruss(w, http.StatusCreated, eventID, trussID)
}

func (h StagePlotsHandler) updateTrussPiece(w http.ResponseWriter, r *http.Request) {
	eventID, trussID, ok := h.eventAndTruss(w, r)
	if !ok {
		return
	}
	pieceID, ok := parseID(w, chi.URLParam(r, "pieceID"))
	if !ok {
		return
	}
	piece, err := dbstore.GetPlotTrussPiece(h.DB, trussID, pieceID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "truss piece not found")
		} else {
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	var patch struct {
		InventoryItemID *int64   `json:"inventory_item_id"`
		Label           *string  `json:"label"`
		LengthCm        *float64 `json:"length_cm"`
		SortOrder       *int     `json:"sort_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if patch.InventoryItemID != nil {
		if _, err := dbstore.GetInventoryItem(h.DB, *patch.InventoryItemID); err != nil {
			writeError(w, http.StatusNotFound, "inventory item not found")
			return
		}
		piece.InventoryItemID = patch.InventoryItemID
	}
	if patch.Label != nil {
		piece.Label = *patch.Label
	}
	if patch.LengthCm != nil {
		if *patch.LengthCm <= 0 {
			writeError(w, http.StatusBadRequest, "length_cm must be positive")
			return
		}
		piece.LengthCm = *patch.LengthCm
	}
	if patch.SortOrder != nil {
		piece.SortOrder = *patch.SortOrder
	}
	if err := dbstore.UpdatePlotTrussPiece(h.DB, piece); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.respondTruss(w, http.StatusOK, eventID, trussID)
}

func (h StagePlotsHandler) deleteTrussPiece(w http.ResponseWriter, r *http.Request) {
	eventID, trussID, ok := h.eventAndTruss(w, r)
	if !ok {
		return
	}
	pieceID, ok := parseID(w, chi.URLParam(r, "pieceID"))
	if !ok {
		return
	}
	if err := dbstore.DeletePlotTrussPiece(h.DB, trussID, pieceID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.respondTruss(w, http.StatusOK, eventID, trussID)
}

// ---- Fixture attachments ----

func (h StagePlotsHandler) attachTrussFixture(w http.ResponseWriter, r *http.Request) {
	eventID, trussID, ok := h.eventAndTruss(w, r)
	if !ok {
		return
	}
	fixtureID, ok := parseID(w, chi.URLParam(r, "fixtureID"))
	if !ok {
		return
	}
	belongs, err := dbstore.FixtureBelongsToEvent(h.DB, eventID, fixtureID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !belongs {
		writeError(w, http.StatusNotFound, "fixture not found on this event")
		return
	}
	var req struct {
		OffsetCm *float64 `json:"offset_cm"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.OffsetCm != nil && *req.OffsetCm < 0 {
		writeError(w, http.StatusBadRequest, "offset_cm cannot be negative")
		return
	}
	if err := dbstore.AttachPlotTrussFixture(h.DB, trussID, fixtureID, req.OffsetCm); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.respondTruss(w, http.StatusOK, eventID, trussID)
}

func (h StagePlotsHandler) detachTrussFixture(w http.ResponseWriter, r *http.Request) {
	eventID, trussID, ok := h.eventAndTruss(w, r)
	if !ok {
		return
	}
	fixtureID, ok := parseID(w, chi.URLParam(r, "fixtureID"))
	if !ok {
		return
	}
	if err := dbstore.DetachPlotTrussFixture(h.DB, trussID, fixtureID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.respondTruss(w, http.StatusOK, eventID, trussID)
}
