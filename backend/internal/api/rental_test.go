package api

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// TestManualRentalLineEndpoints covers the contract for
// PUT/DELETE /events/{id}/rentals/manual/{itemID} and the summary merge.
func TestManualRentalLineEndpoints(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	micID := seedItem(t, database, "Shure SM58", 4, 150)
	manualURL := fmt.Sprintf("%s/events/%d/rentals/manual/%d", server.URL, eventID, micID)

	// Create.
	status, raw := doJSON(t, http.MethodPut, manualURL, domain.ManualRentalRequest{QuantityAudio: 2, Notes: "spares"})
	if status != http.StatusOK {
		t.Fatalf("PUT create: status %d body %s", status, raw)
	}
	line := decodeJSON[domain.EventRental](t, raw)
	if line.ManualQuantityAudio != 2 || line.QuantityAudio != 2 || line.ManualNotes != "spares" {
		t.Errorf("created line: %+v, want manual/total audio 2 with notes", line)
	}

	// Upsert updates in place.
	status, raw = doJSON(t, http.MethodPut, manualURL, domain.ManualRentalRequest{QuantityAudio: 3})
	if status != http.StatusOK {
		t.Fatalf("PUT update: status %d body %s", status, raw)
	}
	if line = decodeJSON[domain.EventRental](t, raw); line.QuantityAudio != 3 {
		t.Errorf("updated line quantity_audio=%d, want 3", line.QuantityAudio)
	}

	// Merge with a derived quantity: one input using the same mic.
	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/audio-inputs", server.URL, eventID), map[string]any{
		"channel_number": 1, "signal_type": "mic", "mic_item_id": micID,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST audio input: status %d body %s", status, raw)
	}
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/rentals", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET summary: status %d body %s", status, raw)
	}
	summary := decodeJSON[domain.RentalSummary](t, raw)
	if len(summary.Items) != 1 {
		t.Fatalf("summary has %d lines, want 1 merged line", len(summary.Items))
	}
	merged := summary.Items[0]
	if merged.QuantityAudio != 4 || merged.ManualQuantityAudio != 3 {
		t.Errorf("merged line audio=%d manual=%d, want 4/3", merged.QuantityAudio, merged.ManualQuantityAudio)
	}
	if merged.IsOverStock != false {
		t.Errorf("is_over_stock=true at 4 of 4 available")
	}

	// Validation and error contract.
	if status, raw = doJSON(t, http.MethodPut, manualURL, domain.ManualRentalRequest{QuantityAudio: -1}); status != http.StatusBadRequest {
		t.Errorf("negative quantity: status %d body %s, want 400", status, raw)
	}
	badItem := fmt.Sprintf("%s/events/%d/rentals/manual/99999", server.URL, eventID)
	if status, raw = doJSON(t, http.MethodPut, badItem, domain.ManualRentalRequest{QuantityAudio: 1}); status != http.StatusNotFound {
		t.Errorf("unknown item: status %d body %s, want 404", status, raw)
	}
	badEvent := fmt.Sprintf("%s/events/99999/rentals/manual/%d", server.URL, micID)
	if status, raw = doJSON(t, http.MethodPut, badEvent, domain.ManualRentalRequest{QuantityAudio: 1}); status != http.StatusNotFound {
		t.Errorf("unknown event: status %d body %s, want 404", status, raw)
	}

	// Zero-quantity PUT removes the manual share (derived remains).
	status, raw = doJSON(t, http.MethodPut, manualURL, domain.ManualRentalRequest{})
	if status != http.StatusOK {
		t.Fatalf("PUT zero: status %d body %s", status, raw)
	}
	if line = decodeJSON[domain.EventRental](t, raw); line.ManualQuantityAudio != 0 || line.QuantityAudio != 1 {
		t.Errorf("after zero PUT: manual=%d audio=%d, want 0/1", line.ManualQuantityAudio, line.QuantityAudio)
	}

	// DELETE is idempotent.
	if status, _ = doJSON(t, http.MethodDelete, manualURL, nil); status != http.StatusNoContent {
		t.Errorf("DELETE: status %d, want 204", status)
	}
	if status, _ = doJSON(t, http.MethodDelete, manualURL, nil); status != http.StatusNoContent {
		t.Errorf("second DELETE: status %d, want 204", status)
	}
}

// TestAudioInputMicValidation covers the 400 on dangling mic references.
func TestAudioInputMicValidation(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	inputsURL := fmt.Sprintf("%s/events/%d/audio-inputs", server.URL, eventID)

	status, raw := doJSON(t, http.MethodPost, inputsURL, map[string]any{
		"channel_number": 1, "signal_type": "mic", "mic_item_id": 12345,
	})
	if status != http.StatusBadRequest {
		t.Errorf("dangling mic_item_id: status %d body %s, want 400", status, raw)
	}

	micID := seedItem(t, database, "Shure SM58", 4, 150)
	status, raw = doJSON(t, http.MethodPost, inputsURL, map[string]any{
		"channel_number": 1, "signal_type": "mic", "mic_item_id": micID,
	})
	if status != http.StatusCreated {
		t.Fatalf("valid mic_item_id: status %d body %s, want 201", status, raw)
	}
	input := decodeJSON[domain.AudioPatchInput](t, raw)
	if input.MicItemID == nil || *input.MicItemID != micID {
		t.Errorf("created input mic_item_id=%v, want %d", input.MicItemID, micID)
	}
}
