package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/trionell/patchplanner/internal/api/middleware"
	dbstore "github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

// ReferenceTemplateHandler serves one user's personal vocabulary template
// (Slice 17). No path param for "which template" at all — always resolved
// from the authenticated request context via RequireAuth, since a
// template is singular per user, unlike inventories (research.md R3).
type ReferenceTemplateHandler struct {
	DB *sql.DB
}

func (h ReferenceTemplateHandler) Register(r chi.Router) {
	r.Route("/reference-templates", func(r chi.Router) {
		r.Get("/", h.getTemplate)
		r.Post("/{vocabulary}/values", h.createValue)
		r.Patch("/{vocabulary}/values/{valueID}", h.updateValue)
		r.Delete("/{vocabulary}/values/{valueID}", h.deleteValue)
	})
}

func (h ReferenceTemplateHandler) getTemplate(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.UserFromContext(r.Context())
	data, err := dbstore.ListReferenceTemplate(h.DB, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (h ReferenceTemplateHandler) createValue(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.UserFromContext(r.Context())
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
	created, err := dbstore.CreateReferenceTemplateValue(h.DB, user.ID, vocabulary, payload)
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

func (h ReferenceTemplateHandler) updateValue(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.UserFromContext(r.Context())
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
	updated, err := dbstore.UpdateReferenceTemplateValueLabel(h.DB, user.ID, vocabulary, valueID, label)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "reference template value not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h ReferenceTemplateHandler) deleteValue(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.UserFromContext(r.Context())
	vocabulary, ok := requireVocabulary(w, r)
	if !ok {
		return
	}
	valueID, ok := parseID(w, chi.URLParam(r, "valueID"))
	if !ok {
		return
	}
	// No in-use check at all — a template value is never referenced by
	// any planning row (spec.md FR-009, research.md R6).
	if err := dbstore.DeleteReferenceTemplateValue(h.DB, user.ID, vocabulary, valueID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "reference template value not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
