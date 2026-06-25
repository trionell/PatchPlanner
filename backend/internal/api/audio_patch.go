package api

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	dbstore "github.com/trionell/patcherplanner/internal/db"
	"github.com/trionell/patcherplanner/internal/domain"
)

type AudioPatchHandler struct {
	DB *sql.DB
}

type audioPatchResponse struct {
	Stageboxes  []domain.Stagebox         `json:"stageboxes"`
	StageMultis []domain.StageMulti       `json:"stage_multis"`
	Inputs      []domain.AudioPatchInput  `json:"inputs"`
	Outputs     []domain.AudioPatchOutput `json:"outputs"`
}

func (h AudioPatchHandler) Register(r chi.Router) {
	r.Get("/events/{eventID}/audio-patch", h.getAudioPatch)
	r.Post("/events/{eventID}/audio-inputs", h.createInput)
	r.Patch("/events/{eventID}/audio-inputs/{inputID}", h.updateInput)
	r.Delete("/events/{eventID}/audio-inputs/{inputID}", h.deleteInput)
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
	writeJSON(w, http.StatusOK, audioPatchResponse{Stageboxes: stageboxes, StageMultis: stageMultis, Inputs: inputs, Outputs: outputs})
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
	created, err := dbstore.CreateAudioPatchInput(h.DB, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h AudioPatchHandler) updateInput(w http.ResponseWriter, r *http.Request) {
	inputID, ok := parseID(w, chi.URLParam(r, "inputID"))
	if !ok {
		return
	}
	var payload domain.AudioPatchInput
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
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
	updated, err := dbstore.UpdateAudioPatchOutput(h.DB, outputID, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
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
