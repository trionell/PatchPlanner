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
	Fixtures []domain.LightingFixture `json:"fixtures"`
}

func (h LightingHandler) Register(r chi.Router) {
	r.Get("/lighting-rigs", h.getLightingRig)
	r.Post("/lighting-rigs/{rigID}/fixtures", h.createFixture)
	r.Patch("/lighting-rigs/{rigID}/fixtures/{fixtureID}", h.updateFixture)
	r.Delete("/lighting-rigs/{rigID}/fixtures/{fixtureID}", h.deleteFixture)
	r.Post("/lighting-rigs/{rigID}/fixtures/bulk", h.bulkCreateFixtures)
	r.Patch("/lighting-rigs/{rigID}/fixtures/addresses", h.updateFixtureAddresses)
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
	fixtures, err := dbstore.ListLightingFixtures(h.DB, rig.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if fixtures == nil {
		fixtures = []domain.LightingFixture{}
	}
	writeJSON(w, http.StatusOK, lightingRigResponse{Rig: rig, Fixtures: fixtures})
}

// requireRigForEvent writes a 404 and returns false unless rigID belongs to
// eventID — without this, any event a caller has a role on could be used to
// reach another event's lighting rig by guessing its id.
func (h LightingHandler) requireRigForEvent(w http.ResponseWriter, eventID, rigID int64) bool {
	var count int
	if err := h.DB.QueryRow(`SELECT COUNT(*) FROM lighting_rigs WHERE id = ? AND event_id = ?`, rigID, eventID).Scan(&count); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return false
	}
	if count != 1 {
		writeError(w, http.StatusNotFound, "lighting rig not found")
		return false
	}
	return true
}

// requireFixtureForRig writes a 404 and returns false unless fixtureID
// belongs to rigID (mirrors requireRigForEvent, one level down).
func (h LightingHandler) requireFixtureForRig(w http.ResponseWriter, rigID, fixtureID int64) bool {
	var count int
	if err := h.DB.QueryRow(`SELECT COUNT(*) FROM lighting_fixtures WHERE id = ? AND rig_id = ?`, fixtureID, rigID).Scan(&count); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return false
	}
	if count != 1 {
		writeError(w, http.StatusNotFound, "fixture not found")
		return false
	}
	return true
}

func (h LightingHandler) createFixture(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	rigID, ok := parseID(w, chi.URLParam(r, "rigID"))
	if !ok {
		return
	}
	if !h.requireRigForEvent(w, eventID, rigID) {
		return
	}
	inventoryID, ok := inventoryIDForEvent(h.DB, w, eventID)
	if !ok {
		return
	}
	var payload domain.LightingFixture
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	payload.RigID = rigID
	if !validFixtureNumber(w, payload.FixtureNumber) {
		return
	}
	if !validInventoryItemRef(h.DB, w, "inventory_item_id", inventoryID, payload.InventoryItemID) {
		return
	}
	created, err := dbstore.CreateLightingFixture(h.DB, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h LightingHandler) updateFixture(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	rigID, ok := parseID(w, chi.URLParam(r, "rigID"))
	if !ok {
		return
	}
	fixtureID, ok := parseID(w, chi.URLParam(r, "fixtureID"))
	if !ok {
		return
	}
	if !h.requireRigForEvent(w, eventID, rigID) || !h.requireFixtureForRig(w, rigID, fixtureID) {
		return
	}
	inventoryID, ok := inventoryIDForEvent(h.DB, w, eventID)
	if !ok {
		return
	}
	var payload domain.LightingFixture
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if !validFixtureNumber(w, payload.FixtureNumber) {
		return
	}
	if !validInventoryItemRef(h.DB, w, "inventory_item_id", inventoryID, payload.InventoryItemID) {
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
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	rigID, ok := parseID(w, chi.URLParam(r, "rigID"))
	if !ok {
		return
	}
	fixtureID, ok := parseID(w, chi.URLParam(r, "fixtureID"))
	if !ok {
		return
	}
	if !h.requireRigForEvent(w, eventID, rigID) || !h.requireFixtureForRig(w, rigID, fixtureID) {
		return
	}
	if err := dbstore.DeleteLightingFixture(h.DB, fixtureID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// bulkCreateFixtures creates one batch of identical fixtures — see the
// slice 7 contract: shared settings, incrementing fixture numbers, positions
// and DMX addresses appended, all-or-nothing.
func (h LightingHandler) bulkCreateFixtures(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	rigID, ok := parseID(w, chi.URLParam(r, "rigID"))
	if !ok {
		return
	}
	if !h.requireRigForEvent(w, eventID, rigID) {
		return
	}
	inventoryID, ok := inventoryIDForEvent(h.DB, w, eventID)
	if !ok {
		return
	}
	var payload domain.BulkFixtureRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if payload.Quantity < 1 || payload.Quantity > 100 {
		writeError(w, http.StatusBadRequest, "quantity must be between 1 and 100")
		return
	}
	if payload.DMXChannelCount < 1 {
		writeError(w, http.StatusBadRequest, "dmx_channel_count must be at least 1")
		return
	}
	if !validFixtureNumber(w, payload.FixtureNumberStart) {
		return
	}
	if !validInventoryItemRef(h.DB, w, "inventory_item_id", inventoryID, payload.InventoryItemID) {
		return
	}
	if payload.DMXStartAddress != nil && (*payload.DMXStartAddress < 1 || *payload.DMXStartAddress > 512) {
		writeError(w, http.StatusBadRequest, "dmx_start_address must be between 1 and 512")
		return
	}
	fixtures, err := dbstore.BulkCreateLightingFixtures(h.DB, rigID, payload)
	if err != nil {
		switch {
		case errors.Is(err, sql.ErrNoRows):
			writeError(w, http.StatusNotFound, "lighting rig not found")
		case errors.Is(err, dbstore.ErrUniverseFull):
			writeError(w, http.StatusConflict, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	writeJSON(w, http.StatusOK, fixtures)
}

// validFixtureNumber writes a 400 and returns false for non-positive
// console fixture IDs (nil is fine — the number is optional).
func validFixtureNumber(w http.ResponseWriter, number *int) bool {
	if number != nil && *number <= 0 {
		writeError(w, http.StatusBadRequest, "fixture_number must be a positive integer")
		return false
	}
	return true
}

// updateFixtureAddresses applies one planned list of DMX address changes,
// whole or not at all (Slice 27 US4/US5).
//
// It replaces the auto-assign endpoint rather than joining it. Auto-assign,
// optimise and make room are all planned in the browser now, because the DMX
// map has to exist there anyway — for the sheet's marks, the status strip, the
// Universes drawer and the collision prompt, all of which must answer before a
// request is sent. Keeping the packing in Go as well would have put the ripple
// and grouping rules in two languages and let the prompt's preview disagree
// with what the server then did (specs/027 research.md R3).
//
// So this handler validates and guarantees; it has no opinion about whether a
// set of addresses is a good one. An overlap is legal to save (FR-060) — a rig
// legitimately passes through a broken state while it is being renumbered.
func (h LightingHandler) updateFixtureAddresses(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	rigID, ok := parseID(w, chi.URLParam(r, "rigID"))
	if !ok {
		return
	}
	if !h.requireRigForEvent(w, eventID, rigID) {
		return
	}
	var payload struct {
		Changes []domain.AddressChange `json:"changes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if len(payload.Changes) > dbstore.MaxAddressChanges {
		writeError(w, http.StatusBadRequest, "too many changes in one request")
		return
	}
	for _, change := range payload.Changes {
		if change.DMXUniverse < 1 {
			writeError(w, http.StatusBadRequest, "dmx_universe must be at least 1")
			return
		}
		if change.DMXStartAddress < 1 || change.DMXStartAddress > 512 {
			writeError(w, http.StatusBadRequest, "dmx_start_address must be between 1 and 512")
			return
		}
	}

	fixtures, err := dbstore.UpdateFixtureAddresses(h.DB, rigID, payload.Changes)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "fixture not found in this rig")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, fixtures)
}
