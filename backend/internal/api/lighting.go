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

type LightingHandler struct {
	DB *sql.DB
}

type lightingRigResponse struct {
	Rig      domain.LightingRig       `json:"rig"`
	Sections []domain.TrussSection    `json:"sections"`
	Fixtures []domain.LightingFixture `json:"fixtures"`
}

func (h LightingHandler) Register(r chi.Router) {
	r.Get("/events/{eventID}/lighting-rigs", h.getLightingRig)
	r.Post("/events/{eventID}/lighting-rigs/{rigID}/fixtures", h.createFixture)
	r.Patch("/events/{eventID}/lighting-rigs/{rigID}/fixtures/{fixtureID}", h.updateFixture)
	r.Delete("/events/{eventID}/lighting-rigs/{rigID}/fixtures/{fixtureID}", h.deleteFixture)
	r.Post("/events/{eventID}/lighting-rigs/{rigID}/fixtures/auto-assign-dmx", h.autoAssignDMX)
	r.Post("/events/{eventID}/lighting-rigs/{rigID}/truss-sections", h.createTrussSection)
	r.Patch("/events/{eventID}/lighting-rigs/{rigID}/truss-sections/{sectionID}", h.updateTrussSection)
	r.Delete("/events/{eventID}/lighting-rigs/{rigID}/truss-sections/{sectionID}", h.deleteTrussSection)
}

func (h LightingHandler) getLightingRig(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	rig, err := dbstore.GetOrCreateDefaultLightingRig(h.DB, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	sections, err := dbstore.ListTrussSections(h.DB, rig.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	fixtures, err := dbstore.ListLightingFixtures(h.DB, rig.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if sections == nil {
		sections = []domain.TrussSection{}
	}
	if fixtures == nil {
		fixtures = []domain.LightingFixture{}
	}
	writeJSON(w, http.StatusOK, lightingRigResponse{Rig: rig, Sections: sections, Fixtures: fixtures})
}

func (h LightingHandler) createFixture(w http.ResponseWriter, r *http.Request) {
	rigID, ok := parseID(w, chi.URLParam(r, "rigID"))
	if !ok {
		return
	}
	var payload domain.LightingFixture
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	payload.RigID = rigID
	created, err := dbstore.CreateLightingFixture(h.DB, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h LightingHandler) updateFixture(w http.ResponseWriter, r *http.Request) {
	fixtureID, ok := parseID(w, chi.URLParam(r, "fixtureID"))
	if !ok {
		return
	}
	var payload domain.LightingFixture
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	updated, err := dbstore.UpdateLightingFixture(h.DB, fixtureID, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h LightingHandler) deleteFixture(w http.ResponseWriter, r *http.Request) {
	fixtureID, ok := parseID(w, chi.URLParam(r, "fixtureID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteLightingFixture(h.DB, fixtureID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h LightingHandler) autoAssignDMX(w http.ResponseWriter, r *http.Request) {
	rigID, ok := parseID(w, chi.URLParam(r, "rigID"))
	if !ok {
		return
	}
	fixtures, err := dbstore.AutoAssignDMX(h.DB, rigID)
	if err != nil {
		if errors.Is(err, dbstore.ErrUniverseFull) {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if fixtures == nil {
		fixtures = []domain.LightingFixture{}
	}
	writeJSON(w, http.StatusOK, fixtures)
}

func (h LightingHandler) createTrussSection(w http.ResponseWriter, r *http.Request) {
	rigID, ok := parseID(w, chi.URLParam(r, "rigID"))
	if !ok {
		return
	}
	var payload domain.TrussSection
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if payload.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	payload.RigID = rigID
	if payload.TrussType == "" {
		payload.TrussType = "box"
	}
	created, err := dbstore.CreateTrussSection(h.DB, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h LightingHandler) updateTrussSection(w http.ResponseWriter, r *http.Request) {
	sectionID, ok := parseID(w, chi.URLParam(r, "sectionID"))
	if !ok {
		return
	}
	var payload domain.TrussSection
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if payload.TrussType == "" {
		payload.TrussType = "box"
	}
	updated, err := dbstore.UpdateTrussSection(h.DB, sectionID, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h LightingHandler) deleteTrussSection(w http.ResponseWriter, r *http.Request) {
	sectionID, ok := parseID(w, chi.URLParam(r, "sectionID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteTrussSection(h.DB, sectionID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
