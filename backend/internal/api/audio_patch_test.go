package api

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// TestAudioPatchCableStandLifecycle covers the slice-6 field contract:
// picks round-trip, legacy values are served until a pick clears them for
// good, and clearing a pick never resurrects legacy values.
func TestAudioPatchCableStandLifecycle(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	cableID := seedRoleItem(t, database, "cable", "Mikrofonkabel", "4m", 6, 7)
	standID := seedRoleItem(t, database, "stand", "Mikrofonstativ Med bom", "", 16, 20)
	inputsURL := fmt.Sprintf("%s/events/%d/audio-inputs", server.URL, eventID)

	// New rows round-trip picks and carry no legacy values.
	status, raw := doJSON(t, http.MethodPost, inputsURL, map[string]any{
		"channel_number": 1, "signal_type": "mic", "cable_item_id": cableID, "stand_item_id": standID,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST input: status %d body %s", status, raw)
	}
	created := decodeJSON[domain.AudioPatchInput](t, raw)
	if created.CableItemID == nil || *created.CableItemID != cableID || created.StandItemID == nil || *created.StandItemID != standID {
		t.Errorf("created picks cable=%v stand=%v, want %d/%d", created.CableItemID, created.StandItemID, cableID, standID)
	}
	if created.CableType != "" || created.CableLengthM != 0 || created.MicStand != "" {
		t.Errorf("new row has legacy values: %+v", created)
	}

	// Dangling references are rejected up front.
	for _, field := range []string{"cable_item_id", "stand_item_id"} {
		if status, raw = doJSON(t, http.MethodPost, inputsURL, map[string]any{
			"channel_number": 9, "signal_type": "mic", field: 99999,
		}); status != http.StatusBadRequest {
			t.Errorf("dangling %s: status %d body %s, want 400", field, status, raw)
		}
	}

	// A legacy row (pre-019 shape) serves its old values...
	if _, err := database.Exec(`INSERT INTO audio_patch_inputs (event_id, channel_number, cable_type, cable_length_m, mic_stand) VALUES (?, 2, 'xlr', 10, 'boom')`, eventID); err != nil {
		t.Fatalf("seed legacy row: %v", err)
	}
	var legacyID int64
	if err := database.QueryRow(`SELECT id FROM audio_patch_inputs WHERE event_id = ? AND channel_number = 2`, eventID).Scan(&legacyID); err != nil {
		t.Fatalf("legacy row id: %v", err)
	}
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/audio-patch", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET patch: status %d body %s", status, raw)
	}
	patch := decodeJSON[struct {
		Inputs []domain.AudioPatchInput `json:"inputs"`
	}](t, raw)
	var legacy domain.AudioPatchInput
	for _, input := range patch.Inputs {
		if input.ID == legacyID {
			legacy = input
		}
	}
	if legacy.CableType != "xlr" || legacy.CableLengthM != 10 || legacy.MicStand != "boom" {
		t.Errorf("legacy row served %+v, want xlr/10/boom", legacy)
	}

	// ...until a pick clears the corresponding legacy pair for good.
	legacy.CableItemID = &cableID
	updateURL := fmt.Sprintf("%s/%d", inputsURL, legacyID)
	status, raw = doJSON(t, http.MethodPatch, updateURL, legacy)
	if status != http.StatusOK {
		t.Fatalf("PATCH pick cable: status %d body %s", status, raw)
	}
	updated := decodeJSON[domain.AudioPatchInput](t, raw)
	if updated.CableItemID == nil || updated.CableType != "" || updated.CableLengthM != 0 {
		t.Errorf("after cable pick: %+v, want cleared legacy cable fields", updated)
	}
	if updated.MicStand != "boom" {
		t.Errorf("stand legacy cleared by cable pick: %+v", updated)
	}

	// Clearing the pick leaves the row bare — legacy values stay gone.
	updated.CableItemID = nil
	status, raw = doJSON(t, http.MethodPatch, updateURL, updated)
	if status != http.StatusOK {
		t.Fatalf("PATCH clear cable: status %d body %s", status, raw)
	}
	cleared := decodeJSON[domain.AudioPatchInput](t, raw)
	if cleared.CableItemID != nil || cleared.CableType != "" {
		t.Errorf("after clearing pick: %+v, want no cable at all", cleared)
	}

	// Outputs follow the same lifecycle for their cable.
	outputsURL := fmt.Sprintf("%s/events/%d/audio-outputs", server.URL, eventID)
	if _, err := database.Exec(`INSERT INTO audio_patch_outputs (event_id, output_number, output_type, destination_type, cable_type, cable_length_m) VALUES (?, 1, 'foh', 'local', 'nl4', 20)`, eventID); err != nil {
		t.Fatalf("seed legacy output: %v", err)
	}
	var outputID int64
	if err := database.QueryRow(`SELECT id FROM audio_patch_outputs WHERE event_id = ?`, eventID).Scan(&outputID); err != nil {
		t.Fatalf("legacy output id: %v", err)
	}
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", outputsURL, outputID), map[string]any{
		"output_number": 1, "output_type": "foh", "destination_type": "local", "cable_item_id": cableID,
	})
	if status != http.StatusOK {
		t.Fatalf("PATCH output pick: status %d body %s", status, raw)
	}
	output := decodeJSON[domain.AudioPatchOutput](t, raw)
	if output.CableItemID == nil || *output.CableItemID != cableID || output.CableType != "" || output.CableLengthM != 0 {
		t.Errorf("output after pick: %+v, want cable item %d and cleared legacy", output, cableID)
	}
}
