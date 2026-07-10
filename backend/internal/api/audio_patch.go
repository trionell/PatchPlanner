package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"strings"

	"github.com/go-chi/chi/v5"
	dbstore "github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

type AudioPatchHandler struct {
	DB *sql.DB
}

type audioPatchResponse struct {
	Stageboxes    []domain.Stagebox         `json:"stageboxes"`
	StageMultis   []domain.StageMulti       `json:"stage_multis"`
	Groups        []domain.MixerGroup       `json:"groups"`
	DCAs          []domain.MixerDCA         `json:"dcas"`
	Inputs        []domain.AudioPatchInput  `json:"inputs"`
	Outputs       []domain.AudioPatchOutput `json:"outputs"`
	OutputDevices []domain.OutputDevice     `json:"output_devices"`
	OutputCables  []domain.OutputCable      `json:"output_cables"`
	// OutputMixerPositionY is the mixer node's canvas Y position in the
	// output signal-flow graph's Sources/Channels rail (X is fixed).
	OutputMixerPositionY float64 `json:"output_mixer_position_y"`
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
	// Output devices (shared, per event)
	r.Post("/events/{eventID}/output-devices", h.createOutputDevice)
	r.Patch("/events/{eventID}/output-devices/{deviceID}", h.updateOutputDevice)
	r.Delete("/events/{eventID}/output-devices/{deviceID}", h.deleteOutputDevice)
	// Output cables (the signal-flow graph's edges)
	r.Post("/events/{eventID}/output-cables", h.createOutputCable)
	r.Patch("/events/{eventID}/output-cables/{cableID}", h.updateOutputCable)
	r.Delete("/events/{eventID}/output-cables/{cableID}", h.deleteOutputCable)
	// Mixer node position (a single implicit node per event, Sources rail)
	r.Patch("/events/{eventID}/output-mixer-position", h.updateOutputMixerPosition)
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
	outputDevices, err := dbstore.ListOutputDevices(h.DB, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	outputCables, err := dbstore.ListOutputCables(h.DB, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	mixerPositionY, err := dbstore.OutputMixerPositionY(h.DB, eventID)
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
	if outputDevices == nil {
		outputDevices = []domain.OutputDevice{}
	}
	if outputCables == nil {
		outputCables = []domain.OutputCable{}
	}
	writeJSON(w, http.StatusOK, audioPatchResponse{
		Stageboxes: stageboxes, StageMultis: stageMultis, Groups: groups, DCAs: dcas, Inputs: inputs, Outputs: outputs,
		OutputDevices: outputDevices, OutputCables: outputCables, OutputMixerPositionY: mixerPositionY,
	})
}

// updateOutputMixerPosition sets the mixer node's canvas Y position — a
// single implicit node per event, always pinned to the Sources/Channels
// rail (X is fixed, so only Y is ever sent).
func (h AudioPatchHandler) updateOutputMixerPosition(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok || !h.requireEvent(w, eventID) {
		return
	}
	var payload struct {
		PositionY float64 `json:"position_y"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if err := dbstore.UpdateOutputMixerPositionY(h.DB, eventID, payload.PositionY); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
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

// defaultInputWidthFields fills empty Width/MixerBehavior/SourceCabling
// (an omitted JSON field decodes to "") with their spec-mandated defaults,
// mirroring the existing ConnectionType/ConnectorType defaulting on
// stageboxes/stage multis below. Validation runs after this, so a caller
// that never mentions these fields never sees a spurious 400.
func defaultInputWidthFields(payload *domain.AudioPatchInput) {
	if payload.Width == "" {
		payload.Width = "mono"
	}
	if payload.MixerBehavior == "" {
		payload.MixerBehavior = "stereo_channel"
	}
	if payload.SourceCabling == "" {
		payload.SourceCabling = "two_cables"
	}
}

// validWidth writes a 400 and returns false when value is not a recognized
// AudioPatchInput/AudioPatchOutput width.
func (h AudioPatchHandler) validWidth(w http.ResponseWriter, value string) bool {
	if !slices.Contains(domain.ValidWidths, value) {
		writeError(w, http.StatusBadRequest, "width must be one of: mono, stereo")
		return false
	}
	return true
}

// validStereoEnums writes a 400 and returns false when the input's width,
// mixer behavior, or source cabling is not a recognized value. Checked
// unconditionally regardless of whether the field is currently meaningful
// (e.g. mixer_behavior on a mono row) — see research.md R7.
func (h AudioPatchHandler) validStereoEnums(w http.ResponseWriter, input domain.AudioPatchInput) bool {
	if !h.validWidth(w, input.Width) {
		return false
	}
	if !slices.Contains(domain.ValidMixerBehaviors, input.MixerBehavior) {
		writeError(w, http.StatusBadRequest, "mixer_behavior must be one of: stereo_channel, linked_channels")
		return false
	}
	if !slices.Contains(domain.ValidSourceCablings, input.SourceCabling) {
		writeError(w, http.StatusBadRequest, "source_cabling must be one of: two_cables, splitter")
		return false
	}
	return true
}

// validSideBRefs writes a 400/500 response and returns false when a side-B
// stagebox or stage-multi id does not belong to the event. Unlike the
// pre-existing side-A stagebox_id/stage_multi_id fields (never
// event-scoped, an existing gap this slice does not retroactively fix),
// side B is a field this slice introduces and validates from the start —
// the same treatment slice 8 gave group_ids/dca_ids.
func (h AudioPatchHandler) validSideBRefs(w http.ResponseWriter, eventID int64, stageboxIDB, stageMultiIDB *int64) bool {
	if stageboxIDB != nil && !h.itemBelongsToEvent("stageboxes", eventID, *stageboxIDB) {
		writeError(w, http.StatusBadRequest, "stagebox_id_b references a stagebox of another event")
		return false
	}
	if stageMultiIDB != nil && !h.itemBelongsToEvent("stage_multis", eventID, *stageMultiIDB) {
		writeError(w, http.StatusBadRequest, "stage_multi_id_b references a stage multi of another event")
		return false
	}
	return true
}

// itemBelongsToEvent reports whether the given row of the table (stageboxes
// or stage_multis) belongs to eventID. Errors are treated as "does not
// belong" — the caller already resolved existence via Get*, so this only
// ever narrows an already-successful lookup by event ownership.
func (h AudioPatchHandler) itemBelongsToEvent(table string, eventID, id int64) bool {
	var count int
	err := h.DB.QueryRow(`SELECT COUNT(*) FROM `+table+` WHERE id = ? AND event_id = ?`, id, eventID).Scan(&count)
	return err == nil && count == 1
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
	defaultInputWidthFields(&payload)
	if !h.validItemRef(w, "mic_item_id", payload.MicItemID) ||
		!h.validItemRef(w, "cable_item_id", payload.CableItemID) ||
		!h.validItemRef(w, "stand_item_id", payload.StandItemID) ||
		!h.validItemRef(w, "source_cable_item_id", payload.SourceCableItemID) ||
		!h.validBusRefs(w, eventID, payload) ||
		!h.validStereoEnums(w, payload) ||
		!h.validSideBRefs(w, eventID, payload.StageboxIDB, payload.StageMultiIDB) {
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
	defaultInputWidthFields(&payload)
	if !h.validItemRef(w, "mic_item_id", payload.MicItemID) ||
		!h.validItemRef(w, "cable_item_id", payload.CableItemID) ||
		!h.validItemRef(w, "stand_item_id", payload.StandItemID) ||
		!h.validItemRef(w, "source_cable_item_id", payload.SourceCableItemID) ||
		!h.validBusRefs(w, eventID, payload) ||
		!h.validStereoEnums(w, payload) ||
		!h.validSideBRefs(w, eventID, payload.StageboxIDB, payload.StageMultiIDB) {
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
	if payload.Width == "" {
		payload.Width = "mono"
	}
	if !h.validWidth(w, payload.Width) {
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
	if payload.Width == "" {
		payload.Width = "mono"
	}
	if !h.validWidth(w, payload.Width) {
		return
	}
	updated, err := dbstore.UpdateAudioPatchOutput(h.DB, outputID, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// validOwnedItemRef writes a 400/500 response and returns false when a
// non-nil owned-gear reference does not resolve to a catalog row. Owned
// items are a global catalog (Slice 3), not event-scoped, same as
// inventory items.
func (h AudioPatchHandler) validOwnedItemRef(w http.ResponseWriter, itemID *int64) bool {
	if itemID == nil {
		return true
	}
	if _, err := dbstore.GetOwnedItem(h.DB, *itemID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusBadRequest, "owned_item_id references an unknown owned item")
			return false
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return false
	}
	return true
}

func (h AudioPatchHandler) createOutputDevice(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	var payload domain.OutputDevice
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	payload.EventID = eventID
	payload.Name = strings.TrimSpace(payload.Name)
	if payload.Name == "" {
		writeError(w, http.StatusBadRequest, "name must not be empty")
		return
	}
	if !h.validOutputDeviceItemRefs(w, payload) || !h.validOutputDevicePorts(w, eventID, nil, payload) {
		return
	}
	created, err := dbstore.CreateOutputDevice(h.DB, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h AudioPatchHandler) updateOutputDevice(w http.ResponseWriter, r *http.Request) {
	deviceID, ok := parseID(w, chi.URLParam(r, "deviceID"))
	if !ok {
		return
	}
	existing, err := dbstore.GetOutputDevice(h.DB, deviceID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "output device not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var payload domain.OutputDevice
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	payload.Name = strings.TrimSpace(payload.Name)
	if payload.Name == "" {
		writeError(w, http.StatusBadRequest, "name must not be empty")
		return
	}
	if !h.validOutputDeviceItemRefs(w, payload) || !h.validOutputDevicePorts(w, existing.EventID, &deviceID, payload) {
		return
	}
	updated, err := dbstore.UpdateOutputDevice(h.DB, deviceID, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h AudioPatchHandler) deleteOutputDevice(w http.ResponseWriter, r *http.Request) {
	deviceID, ok := parseID(w, chi.URLParam(r, "deviceID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteOutputDevice(h.DB, deviceID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// validOutputDeviceItemRefs writes a 400 and returns false unless exactly
// one of InventoryItemID/OwnedItemID is set and it resolves to a real row.
func (h AudioPatchHandler) validOutputDeviceItemRefs(w http.ResponseWriter, device domain.OutputDevice) bool {
	set := 0
	if device.InventoryItemID != nil {
		set++
	}
	if device.OwnedItemID != nil {
		set++
	}
	if set != 1 {
		writeError(w, http.StatusBadRequest, "exactly one of inventory_item_id or owned_item_id must be set")
		return false
	}
	if !h.validItemRef(w, "inventory_item_id", device.InventoryItemID) {
		return false
	}
	return h.validOwnedItemRef(w, device.OwnedItemID)
}

// validOutputDevicePorts writes a 400/409/500 response and returns false
// when a device's port-count/connector-type fields are inconsistent
// (data-model.md: a side's connector type is required exactly when that
// side's port count is > 0, and at least one side must be > 0), or when
// an update (existingID != nil) would shrink a side below the number of
// cables currently attached to it — the caller must delete those cables
// first (FR-016).
func (h AudioPatchHandler) validOutputDevicePorts(w http.ResponseWriter, eventID int64, existingID *int64, device domain.OutputDevice) bool {
	if device.InputPortCount < 0 || device.OutputPortCount < 0 || device.LinkPortCount < 0 {
		writeError(w, http.StatusBadRequest, "input_port_count, output_port_count, and link_port_count must be >= 0")
		return false
	}
	if device.InputPortCount == 0 && device.OutputPortCount == 0 {
		writeError(w, http.StatusBadRequest, "a device must have at least one input or output port")
		return false
	}
	if (device.InputPortCount > 0) != (strings.TrimSpace(device.InputConnectorType) != "") {
		writeError(w, http.StatusBadRequest, "input_connector_type must be set exactly when input_port_count > 0")
		return false
	}
	if (device.OutputPortCount > 0) != (strings.TrimSpace(device.OutputConnectorType) != "") {
		writeError(w, http.StatusBadRequest, "output_connector_type must be set exactly when output_port_count > 0")
		return false
	}
	if (device.LinkPortCount > 0) != (strings.TrimSpace(device.LinkConnectorType) != "") {
		writeError(w, http.StatusBadRequest, "link_connector_type must be set exactly when link_port_count > 0")
		return false
	}
	if existingID == nil {
		return true
	}
	cables, err := dbstore.ListOutputCables(h.DB, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return false
	}
	var orphaned []domain.OutputCable
	for _, cable := range cables {
		if cable.FromKind == "device" && cable.FromID == *existingID && cable.FromPort >= device.OutputPortCount {
			orphaned = append(orphaned, cable)
		}
		if cable.FromKind == "device_link" && cable.FromID == *existingID && cable.FromPort >= device.LinkPortCount {
			orphaned = append(orphaned, cable)
		}
		if cable.ToKind == "device" && cable.ToID == *existingID && cable.ToPort >= device.InputPortCount {
			orphaned = append(orphaned, cable)
		}
	}
	if len(orphaned) > 0 {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error":  "reducing port count would orphan existing cables",
			"cables": orphaned,
		})
		return false
	}
	return true
}

// createOutputCable, updateOutputCable, and deleteOutputCable implement
// the output_cables CRUD surface (contracts/output-graph-api.md).
func (h AudioPatchHandler) createOutputCable(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok || !h.requireEvent(w, eventID) {
		return
	}
	var payload domain.OutputCable
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	payload.EventID = eventID
	if !h.validOutputCable(w, eventID, payload) {
		return
	}
	created, err := dbstore.CreateOutputCable(h.DB, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

// updateOutputCable only ever changes cable_item_id — moving a cable to
// different ports is delete + create (contracts/output-graph-api.md), so
// port/endpoint validation does not apply here.
func (h AudioPatchHandler) updateOutputCable(w http.ResponseWriter, r *http.Request) {
	cableID, ok := parseID(w, chi.URLParam(r, "cableID"))
	if !ok {
		return
	}
	existing, err := dbstore.GetOutputCable(h.DB, cableID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "output cable not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var payload struct {
		CableItemID *int64 `json:"cable_item_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if isCablelessToKind(existing.ToKind) && payload.CableItemID != nil {
		writeError(w, http.StatusBadRequest, "cable_item_id must be null for a cable into a stage multi or stagebox (FR-013)")
		return
	}
	if !h.validItemRef(w, "cable_item_id", payload.CableItemID) {
		return
	}
	updated, err := dbstore.UpdateOutputCable(h.DB, cableID, payload.CableItemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h AudioPatchHandler) deleteOutputCable(w http.ResponseWriter, r *http.Request) {
	cableID, ok := parseID(w, chi.URLParam(r, "cableID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteOutputCable(h.DB, cableID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// validOutputCable writes a 400/409/500 response and returns false unless
// the cable's endpoints, ports, and cable pick are all valid
// (data-model.md's OutputCable validation rules, research.md R2/R7).
func (h AudioPatchHandler) validOutputCable(w http.ResponseWriter, eventID int64, cable domain.OutputCable) bool {
	if !slices.Contains(domain.ValidPortFromKinds, cable.FromKind) {
		writeError(w, http.StatusBadRequest, "from_kind must be one of: mixer, stagebox, stage_multi, device, device_link")
		return false
	}
	if !slices.Contains(domain.ValidPortToKinds, cable.ToKind) {
		writeError(w, http.StatusBadRequest, "to_kind must be one of: stagebox, stage_multi, device")
		return false
	}
	fromCount, ok := h.nodeOutputPortCount(w, eventID, cable.FromKind, cable.FromID)
	if !ok {
		return false
	}
	if cable.FromPort < 0 || cable.FromPort >= fromCount {
		writeError(w, http.StatusBadRequest, "from_port is out of bounds for the resolved node")
		return false
	}
	toCount, ok := h.nodeInputPortCount(w, eventID, cable.ToKind, cable.ToID)
	if !ok {
		return false
	}
	if cable.ToPort < 0 || cable.ToPort >= toCount {
		writeError(w, http.StatusBadRequest, "to_port is out of bounds for the resolved node")
		return false
	}
	if isCablelessToKind(cable.ToKind) && cable.CableItemID != nil {
		writeError(w, http.StatusBadRequest, "cable_item_id must be null for a cable into a stage multi or stagebox (FR-013)")
		return false
	}
	if !h.validItemRef(w, "cable_item_id", cable.CableItemID) {
		return false
	}
	existingCables, err := dbstore.ListOutputCables(h.DB, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return false
	}
	for _, existing := range existingCables {
		// A mixer port is a logical channel, not a physical jack — it can
		// fan out to more than one destination at once (its own local-out
		// AND one or more stagebox jacks), so it's exempt from the
		// one-cable-per-port rule every other from_kind still has
		// (research.md follow-up: real consoles route one channel to
		// several output jacks simultaneously).
		if cable.FromKind != "mixer" && existing.FromKind == cable.FromKind && existing.FromID == cable.FromID && existing.FromPort == cable.FromPort {
			writeError(w, http.StatusConflict, "from port is already in use by another cable")
			return false
		}
		if existing.ToKind == cable.ToKind && existing.ToID == cable.ToID && existing.ToPort == cable.ToPort {
			writeError(w, http.StatusConflict, "to port is already in use by another cable")
			return false
		}
	}
	return true
}

// isCablelessToKind reports whether a to_kind's input side is pure
// console/network routing rather than a real physical run — a stage
// multi's built-in wiring and a stagebox's mixer link are both never a
// separately rentable cable (FR-013).
func isCablelessToKind(toKind string) bool {
	return toKind == "stage_multi" || toKind == "stagebox"
}

// nodeOutputPortCount resolves from_kind/from_id to that node's live
// output-side port count, writing a 400/500 response and returning false
// when the reference is invalid (research.md R2/R7 — no DB FK/CHECK can
// enforce a polymorphic port index).
func (h AudioPatchHandler) nodeOutputPortCount(w http.ResponseWriter, eventID int64, kind string, id int64) (int, bool) {
	switch kind {
	case "mixer":
		if !h.itemBelongsToEvent("audio_patch_outputs", eventID, id) {
			writeError(w, http.StatusBadRequest, "from_id references an output channel of another event")
			return 0, false
		}
		width, err := dbstore.MixerOutputWidth(h.DB, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return 0, false
		}
		return dbstore.MixerPortCount(width), true
	case "stagebox":
		if !h.itemBelongsToEvent("stageboxes", eventID, id) {
			writeError(w, http.StatusBadRequest, "from_id references a stagebox of another event")
			return 0, false
		}
		count, err := dbstore.StageboxOutputPortCount(h.DB, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return 0, false
		}
		return count, true
	case "stage_multi":
		if !h.itemBelongsToEvent("stage_multis", eventID, id) {
			writeError(w, http.StatusBadRequest, "from_id references a stage multi of another event")
			return 0, false
		}
		count, err := dbstore.StageMultiChannelCount(h.DB, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return 0, false
		}
		return count, true
	case "device":
		if !h.itemBelongsToEvent("output_devices", eventID, id) {
			writeError(w, http.StatusBadRequest, "from_id references a device of another event")
			return 0, false
		}
		_, outputCount, err := dbstore.OutputDevicePortCounts(h.DB, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return 0, false
		}
		return outputCount, true
	case "device_link":
		if !h.itemBelongsToEvent("output_devices", eventID, id) {
			writeError(w, http.StatusBadRequest, "from_id references a device of another event")
			return 0, false
		}
		count, err := dbstore.OutputDeviceLinkPortCount(h.DB, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return 0, false
		}
		return count, true
	}
	writeError(w, http.StatusBadRequest, "unknown from_kind")
	return 0, false
}

// nodeInputPortCount is nodeOutputPortCount's counterpart for to_kind/
// to_id, resolving against whichever node's live input-side port count.
func (h AudioPatchHandler) nodeInputPortCount(w http.ResponseWriter, eventID int64, kind string, id int64) (int, bool) {
	switch kind {
	case "stage_multi":
		if !h.itemBelongsToEvent("stage_multis", eventID, id) {
			writeError(w, http.StatusBadRequest, "to_id references a stage multi of another event")
			return 0, false
		}
		count, err := dbstore.StageMultiChannelCount(h.DB, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return 0, false
		}
		return count, true
	case "stagebox":
		if !h.itemBelongsToEvent("stageboxes", eventID, id) {
			writeError(w, http.StatusBadRequest, "to_id references a stagebox of another event")
			return 0, false
		}
		count, err := dbstore.StageboxOutputPortCount(h.DB, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return 0, false
		}
		return count, true
	case "device":
		if !h.itemBelongsToEvent("output_devices", eventID, id) {
			writeError(w, http.StatusBadRequest, "to_id references a device of another event")
			return 0, false
		}
		inputCount, _, err := dbstore.OutputDevicePortCounts(h.DB, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return 0, false
		}
		return inputCount, true
	}
	writeError(w, http.StatusBadRequest, "unknown to_kind")
	return 0, false
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
