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

type AudioPatchHandler struct {
	DB *sql.DB
}

type audioPatchResponse struct {
	Stageboxes  []domain.Stagebox         `json:"stageboxes"`
	StageMultis []domain.StageMulti       `json:"stage_multis"`
	Groups      []domain.MixerGroup       `json:"groups"`
	DCAs        []domain.MixerDCA         `json:"dcas"`
	Inputs      []domain.AudioPatchInput  `json:"inputs"`
	Outputs     []domain.AudioPatchOutput `json:"outputs"`
}

// busRequest carries POST/PATCH bodies for groups and DCAs.
type busRequest struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

func (h AudioPatchHandler) Register(r chi.Router) {
	r.Get("/events/{eventID}/audio-patch", h.getAudioPatch)
	// Stageboxes
	r.Post("/events/{eventID}/stageboxes", h.createStagebox)
	r.Patch("/events/{eventID}/stageboxes/{sbID}", h.updateStagebox)
	r.Delete("/events/{eventID}/stageboxes/{sbID}", h.deleteStagebox)
	// Stage multis
	r.Post("/events/{eventID}/stage-multis", h.createStageMulti)
	r.Patch("/events/{eventID}/stage-multis/{smID}", h.updateStageMulti)
	r.Delete("/events/{eventID}/stage-multis/{smID}", h.deleteStageMulti)
	// Groups & DCAs
	r.Post("/events/{eventID}/groups", h.createGroup)
	r.Patch("/events/{eventID}/groups/{groupID}", h.updateGroup)
	r.Delete("/events/{eventID}/groups/{groupID}", h.deleteGroup)
	r.Post("/events/{eventID}/dcas", h.createDCA)
	r.Patch("/events/{eventID}/dcas/{dcaID}", h.updateDCA)
	r.Delete("/events/{eventID}/dcas/{dcaID}", h.deleteDCA)
	// Inputs
	r.Post("/events/{eventID}/audio-inputs", h.createInput)
	r.Patch("/events/{eventID}/audio-inputs/{inputID}", h.updateInput)
	r.Delete("/events/{eventID}/audio-inputs/{inputID}", h.deleteInput)
	// Outputs
	r.Post("/events/{eventID}/audio-outputs", h.createOutput)
	r.Patch("/events/{eventID}/audio-outputs/{outputID}", h.updateOutput)
	r.Delete("/events/{eventID}/audio-outputs/{outputID}", h.deleteOutput)
}

func (h AudioPatchHandler) getAudioPatch(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	stageboxes, err := dbstore.ListStageboxes(h.DB, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	stageMultis, err := dbstore.ListStageMultis(h.DB, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	groups, err := dbstore.ListMixerGroups(h.DB, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	dcas, err := dbstore.ListMixerDCAs(h.DB, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	inputs, err := dbstore.ListAudioPatchInputs(h.DB, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	outputs, err := dbstore.ListAudioPatchOutputs(h.DB, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if stageboxes == nil {
		stageboxes = []domain.Stagebox{}
	}
	if stageMultis == nil {
		stageMultis = []domain.StageMulti{}
	}
	if inputs == nil {
		inputs = []domain.AudioPatchInput{}
	}
	if outputs == nil {
		outputs = []domain.AudioPatchOutput{}
	}
	writeJSON(w, http.StatusOK, audioPatchResponse{Stageboxes: stageboxes, StageMultis: stageMultis, Groups: groups, DCAs: dcas, Inputs: inputs, Outputs: outputs})
}

// decodeBusRequest parses and trims a group/DCA payload, rejecting empty
// names with a 400.
func decodeBusRequest(w http.ResponseWriter, r *http.Request) (busRequest, bool) {
	var payload busRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return busRequest{}, false
	}
	payload.Name = strings.TrimSpace(payload.Name)
	if payload.Name == "" {
		writeError(w, http.StatusBadRequest, "name must not be empty")
		return busRequest{}, false
	}
	return payload, true
}

// writeBusError maps the bus db-layer error contract to HTTP statuses.
func writeBusError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, sql.ErrNoRows):
		writeError(w, http.StatusNotFound, "not found")
	case errors.Is(err, dbstore.ErrBuiltin):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, dbstore.ErrDuplicate):
		writeError(w, http.StatusConflict, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, err.Error())
	}
}

// requireEvent writes a 404/500 and returns false when the event id does not
// resolve.
func (h AudioPatchHandler) requireEvent(w http.ResponseWriter, eventID int64) bool {
	if _, err := dbstore.GetEvent(h.DB, eventID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "event not found")
			return false
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return false
	}
	return true
}

func (h AudioPatchHandler) createGroup(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok || !h.requireEvent(w, eventID) {
		return
	}
	payload, ok := decodeBusRequest(w, r)
	if !ok {
		return
	}
	created, err := dbstore.CreateMixerGroup(h.DB, eventID, payload.Name, payload.Color)
	if err != nil {
		writeBusError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h AudioPatchHandler) updateGroup(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	groupID, ok := parseID(w, chi.URLParam(r, "groupID"))
	if !ok {
		return
	}
	payload, ok := decodeBusRequest(w, r)
	if !ok {
		return
	}
	updated, err := dbstore.UpdateMixerGroup(h.DB, eventID, groupID, payload.Name, payload.Color)
	if err != nil {
		writeBusError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h AudioPatchHandler) deleteGroup(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	groupID, ok := parseID(w, chi.URLParam(r, "groupID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteMixerGroup(h.DB, eventID, groupID); err != nil {
		writeBusError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h AudioPatchHandler) createDCA(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok || !h.requireEvent(w, eventID) {
		return
	}
	payload, ok := decodeBusRequest(w, r)
	if !ok {
		return
	}
	created, err := dbstore.CreateMixerDCA(h.DB, eventID, payload.Name, payload.Color)
	if err != nil {
		writeBusError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h AudioPatchHandler) updateDCA(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	dcaID, ok := parseID(w, chi.URLParam(r, "dcaID"))
	if !ok {
		return
	}
	payload, ok := decodeBusRequest(w, r)
	if !ok {
		return
	}
	updated, err := dbstore.UpdateMixerDCA(h.DB, eventID, dcaID, payload.Name, payload.Color)
	if err != nil {
		writeBusError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h AudioPatchHandler) deleteDCA(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	dcaID, ok := parseID(w, chi.URLParam(r, "dcaID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteMixerDCA(h.DB, eventID, dcaID); err != nil {
		writeBusError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// validBusRefs writes a 400/500 response and returns false when any group or
// DCA id in the payload does not belong to the event.
func (h AudioPatchHandler) validBusRefs(w http.ResponseWriter, eventID int64, input domain.AudioPatchInput) bool {
	for _, check := range []struct {
		kind string
		ids  []int64
	}{{"group", input.GroupIDs}, {"dca", input.DCAIDs}} {
		ok, err := dbstore.BusesBelongToEvent(h.DB, eventID, check.kind, check.ids)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return false
		}
		if !ok {
			writeError(w, http.StatusBadRequest, check.kind+"_ids references a "+check.kind+" of another event")
			return false
		}
	}
	return true
}

func (h AudioPatchHandler) createStagebox(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	var payload domain.Stagebox
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	payload.EventID = eventID
	if payload.ConnectionType == "" {
		payload.ConnectionType = "analog"
	}
	created, err := dbstore.CreateStagebox(h.DB, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h AudioPatchHandler) updateStagebox(w http.ResponseWriter, r *http.Request) {
	sbID, ok := parseID(w, chi.URLParam(r, "sbID"))
	if !ok {
		return
	}
	var payload domain.Stagebox
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	updated, err := dbstore.UpdateStagebox(h.DB, sbID, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h AudioPatchHandler) deleteStagebox(w http.ResponseWriter, r *http.Request) {
	sbID, ok := parseID(w, chi.URLParam(r, "sbID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteStagebox(h.DB, sbID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h AudioPatchHandler) createStageMulti(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	var payload domain.StageMulti
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	payload.EventID = eventID
	if payload.ConnectorType == "" {
		payload.ConnectorType = "xlr"
	}
	if payload.Channels == 0 {
		payload.Channels = 24
	}
	created, err := dbstore.CreateStageMulti(h.DB, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h AudioPatchHandler) updateStageMulti(w http.ResponseWriter, r *http.Request) {
	smID, ok := parseID(w, chi.URLParam(r, "smID"))
	if !ok {
		return
	}
	var payload domain.StageMulti
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	updated, err := dbstore.UpdateStageMulti(h.DB, smID, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h AudioPatchHandler) deleteStageMulti(w http.ResponseWriter, r *http.Request) {
	smID, ok := parseID(w, chi.URLParam(r, "smID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteStageMulti(h.DB, smID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h AudioPatchHandler) createInput(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	var payload domain.AudioPatchInput
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	payload.EventID = eventID
	if !h.validItemRef(w, "mic_item_id", payload.MicItemID) ||
		!h.validItemRef(w, "cable_item_id", payload.CableItemID) ||
		!h.validItemRef(w, "stand_item_id", payload.StandItemID) ||
		!h.validBusRefs(w, eventID, payload) {
		return
	}
	created, err := dbstore.CreateAudioPatchInput(h.DB, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h AudioPatchHandler) updateInput(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	inputID, ok := parseID(w, chi.URLParam(r, "inputID"))
	if !ok {
		return
	}
	var payload domain.AudioPatchInput
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if !h.validItemRef(w, "mic_item_id", payload.MicItemID) ||
		!h.validItemRef(w, "cable_item_id", payload.CableItemID) ||
		!h.validItemRef(w, "stand_item_id", payload.StandItemID) ||
		!h.validBusRefs(w, eventID, payload) {
		return
	}
	updated, err := dbstore.UpdateAudioPatchInput(h.DB, inputID, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h AudioPatchHandler) deleteInput(w http.ResponseWriter, r *http.Request) {
	inputID, ok := parseID(w, chi.URLParam(r, "inputID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteAudioPatchInput(h.DB, inputID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h AudioPatchHandler) createOutput(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	var payload domain.AudioPatchOutput
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	payload.EventID = eventID
	if !h.validItemRef(w, "cable_item_id", payload.CableItemID) {
		return
	}
	created, err := dbstore.CreateAudioPatchOutput(h.DB, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h AudioPatchHandler) updateOutput(w http.ResponseWriter, r *http.Request) {
	outputID, ok := parseID(w, chi.URLParam(r, "outputID"))
	if !ok {
		return
	}
	var payload domain.AudioPatchOutput
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if !h.validItemRef(w, "cable_item_id", payload.CableItemID) {
		return
	}
	updated, err := dbstore.UpdateAudioPatchOutput(h.DB, outputID, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// validItemRef writes a 400/500 response and returns false when a non-nil
// inventory item reference does not resolve to a catalog item.
func (h AudioPatchHandler) validItemRef(w http.ResponseWriter, field string, itemID *int64) bool {
	if itemID == nil {
		return true
	}
	if _, err := dbstore.GetInventoryItem(h.DB, *itemID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusBadRequest, field+" references an unknown inventory item")
			return false
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return false
	}
	return true
}

func (h AudioPatchHandler) deleteOutput(w http.ResponseWriter, r *http.Request) {
	outputID, ok := parseID(w, chi.URLParam(r, "outputID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteAudioPatchOutput(h.DB, outputID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
