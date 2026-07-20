package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	dbstore "github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

var validVocabularies = func() map[string]bool {
	valid := make(map[string]bool, len(domain.Vocabularies))
	for _, vocabulary := range domain.Vocabularies {
		valid[vocabulary] = true
	}
	return valid
}()

type ReferenceHandler struct {
	DB *sql.DB
}

// Register wires the event-scoped reference-data routes inside the
// existing /events/{eventID} group, behind RequireEventAccess — no new
// middleware (any role reads, owner/contributor mutates, exactly like
// every other mutating event-scoped resource; Slice 17 research.md R3).
func (h ReferenceHandler) Register(r chi.Router) {
	r.Route("/reference-data", func(r chi.Router) {
		r.Get("/", h.getReferenceData)
		r.Post("/{vocabulary}/values", h.createValue)
		r.Patch("/{vocabulary}/values/{valueID}", h.updateValue)
		r.Delete("/{vocabulary}/values/{valueID}", h.deleteValue)
	})
}

// decodeModeRequest is shared with InventoriesHandler's fixture-modes
// routes (inventories.go), which superseded the old global
// /inventory/items/{itemID}/fixture-modes path this handler used to serve.
func decodeModeRequest(w http.ResponseWriter, r *http.Request) (domain.FixtureModeRequest, bool) {
	var payload domain.FixtureModeRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return domain.FixtureModeRequest{}, false
	}
	payload.Name = strings.TrimSpace(payload.Name)
	if payload.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return domain.FixtureModeRequest{}, false
	}
	if payload.ChannelCount < 1 {
		writeError(w, http.StatusBadRequest, "channel_count must be at least 1")
		return domain.FixtureModeRequest{}, false
	}
	return payload, true
}

// requireVocabulary validates the path segment against the fixed vocabulary
// list, writing a 404 and returning ok=false for unknown names.
func requireVocabulary(w http.ResponseWriter, r *http.Request) (string, bool) {
	vocabulary := chi.URLParam(r, "vocabulary")
	if !validVocabularies[vocabulary] {
		writeError(w, http.StatusNotFound, "unknown vocabulary")
		return "", false
	}
	return vocabulary, true
}

func (h ReferenceHandler) createValue(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	vocabulary, ok := requireVocabulary(w, r)
	if !ok {
		return
	}
	var payload domain.ReferenceValueRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	payload.Value = strings.TrimSpace(payload.Value)
	payload.Label = strings.TrimSpace(payload.Label)
	if payload.Value == "" || payload.Label == "" {
		writeError(w, http.StatusBadRequest, "value and label are required")
		return
	}
	created, err := dbstore.CreateReferenceValue(h.DB, eventID, vocabulary, payload)
	if err != nil {
		if errors.Is(err, dbstore.ErrDuplicate) {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h ReferenceHandler) updateValue(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	vocabulary, ok := requireVocabulary(w, r)
	if !ok {
		return
	}
	valueID, ok := parseID(w, chi.URLParam(r, "valueID"))
	if !ok {
		return
	}
	var payload domain.ReferenceValueRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	label := strings.TrimSpace(payload.Label)
	if label == "" {
		writeError(w, http.StatusBadRequest, "label is required")
		return
	}
	updated, err := dbstore.UpdateReferenceValueLabel(h.DB, eventID, vocabulary, valueID, label)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "reference value not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h ReferenceHandler) deleteValue(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	vocabulary, ok := requireVocabulary(w, r)
	if !ok {
		return
	}
	valueID, ok := parseID(w, chi.URLParam(r, "valueID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteReferenceValue(h.DB, eventID, vocabulary, valueID); err != nil {
		switch {
		case errors.Is(err, sql.ErrNoRows):
			writeError(w, http.StatusNotFound, "reference value not found")
		case errors.Is(err, dbstore.ErrInUse):
			writeError(w, http.StatusConflict, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h ReferenceHandler) getReferenceData(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	data, err := dbstore.ListReferenceData(h.DB, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}
