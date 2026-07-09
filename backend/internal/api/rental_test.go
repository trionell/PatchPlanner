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

// TestRentalSummaryCountsInputCables covers the slice-6 aggregation arm:
// cable picks on input rows become priced, stock-validated rental lines.
func TestRentalSummaryCountsInputCables(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	cable4m := seedRoleItem(t, database, "cable", "Mikrofonkabel", "4m", 2, 7)
	cable10m := seedRoleItem(t, database, "cable", "Mikrofonkabel", "10m", 8, 8)
	inputsURL := fmt.Sprintf("%s/events/%d/audio-inputs", server.URL, eventID)

	for channel, cableID := range map[int]int64{1: cable4m, 2: cable4m, 3: cable10m} {
		status, raw := doJSON(t, http.MethodPost, inputsURL, map[string]any{
			"channel_number": channel, "signal_type": "mic", "cable_item_id": cableID,
		})
		if status != http.StatusCreated {
			t.Fatalf("POST input ch %d: status %d body %s", channel, status, raw)
		}
	}
	// A channel without a cable contributes nothing.
	if status, raw := doJSON(t, http.MethodPost, inputsURL, map[string]any{
		"channel_number": 4, "signal_type": "mic",
	}); status != http.StatusCreated {
		t.Fatalf("POST bare input: status %d body %s", status, raw)
	}
	// Manual share on the same item merges into one line.
	status, raw := doJSON(t, http.MethodPut, fmt.Sprintf("%s/events/%d/rentals/manual/%d", server.URL, eventID, cable4m),
		domain.ManualRentalRequest{QuantityAudio: 1, Notes: "spare"})
	if status != http.StatusOK {
		t.Fatalf("PUT manual cable line: status %d body %s", status, raw)
	}

	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/rentals", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET summary: status %d body %s", status, raw)
	}
	summary := decodeJSON[domain.RentalSummary](t, raw)
	byID := map[int64]domain.EventRental{}
	for _, line := range summary.Items {
		byID[line.InventoryItemID] = line
	}
	if len(summary.Items) != 2 {
		t.Fatalf("summary has %d lines, want 2 (4m + 10m cables): %+v", len(summary.Items), summary.Items)
	}
	line4m := byID[cable4m]
	// 2 picked + 1 manual = 3 of 2 in stock: merged and over stock.
	if line4m.QuantityAudio != 3 || line4m.ManualQuantityAudio != 1 || !line4m.IsOverStock {
		t.Errorf("4m line audio=%d manual=%d over_stock=%v, want 3/1/true", line4m.QuantityAudio, line4m.ManualQuantityAudio, line4m.IsOverStock)
	}
	if line4m.SubtotalExVAT != 21 {
		t.Errorf("4m line subtotal=%v, want 21 (3 × 7)", line4m.SubtotalExVAT)
	}
	line10m := byID[cable10m]
	if line10m.QuantityAudio != 1 || line10m.IsOverStock {
		t.Errorf("10m line audio=%d over_stock=%v, want 1/false", line10m.QuantityAudio, line10m.IsOverStock)
	}
}

// TestRentalSummaryCountsStands covers the stand_item_id aggregation arm.
func TestRentalSummaryCountsStands(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	boomStand := seedRoleItem(t, database, "stand", "Mikrofonstativ Med bom", "", 16, 20)
	drumStand := seedRoleItem(t, database, "stand", "Mikrofonstativ till trummor", "", 4, 20)
	inputsURL := fmt.Sprintf("%s/events/%d/audio-inputs", server.URL, eventID)

	for channel, standID := range map[int]int64{1: boomStand, 2: boomStand, 3: boomStand, 4: drumStand} {
		status, raw := doJSON(t, http.MethodPost, inputsURL, map[string]any{
			"channel_number": channel, "signal_type": "mic", "stand_item_id": standID,
		})
		if status != http.StatusCreated {
			t.Fatalf("POST input ch %d: status %d body %s", channel, status, raw)
		}
	}

	status, raw := doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/rentals", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET summary: status %d body %s", status, raw)
	}
	summary := decodeJSON[domain.RentalSummary](t, raw)
	byID := map[int64]domain.EventRental{}
	for _, line := range summary.Items {
		byID[line.InventoryItemID] = line
	}
	if len(summary.Items) != 2 {
		t.Fatalf("summary has %d lines, want 2 stand lines: %+v", len(summary.Items), summary.Items)
	}
	if line := byID[boomStand]; line.QuantityAudio != 3 || line.IsOverStock {
		t.Errorf("boom stand line audio=%d over_stock=%v, want 3/false", line.QuantityAudio, line.IsOverStock)
	}
	if line := byID[drumStand]; line.QuantityAudio != 1 {
		t.Errorf("drum stand line audio=%d, want 1", line.QuantityAudio)
	}
}

// TestRentalSummaryCountsOutputCables covers the output_cables
// cable_item_id arm, mixed with input picks of the same item.
func TestRentalSummaryCountsOutputCables(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	speakonCable := seedRoleItem(t, database, "cable", "Högtalarkabel Speakon 2x2,5", "10m", 6, 12)
	speakerItem := seedItem(t, database, "Speaker", 4, 500)
	outputsURL := fmt.Sprintf("%s/events/%d/audio-outputs", server.URL, eventID)
	devicesURL := fmt.Sprintf("%s/events/%d/output-devices", server.URL, eventID)
	cablesURL := fmt.Sprintf("%s/events/%d/output-cables", server.URL, eventID)

	for outputNumber := 1; outputNumber <= 2; outputNumber++ {
		status, raw := doJSON(t, http.MethodPost, outputsURL, map[string]any{
			"output_number": outputNumber, "output_type": "foh", "width": "mono",
		})
		if status != http.StatusCreated {
			t.Fatalf("POST output %d: status %d body %s", outputNumber, status, raw)
		}
		outputID := decodeJSON[domain.AudioPatchOutput](t, raw).ID

		status, raw = doJSON(t, http.MethodPost, devicesURL, map[string]any{
			"name": fmt.Sprintf("Speaker %d", outputNumber), "inventory_item_id": speakerItem,
			"input_port_count": 1, "input_connector_type": "speakon",
		})
		if status != http.StatusCreated {
			t.Fatalf("POST device %d: status %d body %s", outputNumber, status, raw)
		}
		deviceID := decodeJSON[domain.OutputDevice](t, raw).ID

		status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
			"from_kind": "mixer", "from_id": outputID, "from_port": 0,
			"to_kind": "device", "to_id": deviceID, "to_port": 0, "cable_item_id": speakonCable,
		})
		if status != http.StatusCreated {
			t.Fatalf("POST cable %d: status %d body %s", outputNumber, status, raw)
		}
	}
	// The same cable picked on an input merges into the one line.
	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/audio-inputs", server.URL, eventID), map[string]any{
		"channel_number": 1, "signal_type": "line", "cable_item_id": speakonCable,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST input: status %d body %s", status, raw)
	}

	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/rentals", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET summary: status %d body %s", status, raw)
	}
	summary := decodeJSON[domain.RentalSummary](t, raw)
	byID := map[int64]domain.EventRental{}
	for _, line := range summary.Items {
		byID[line.InventoryItemID] = line
	}
	if line := byID[speakonCable]; line.QuantityAudio != 3 {
		t.Errorf("cable line audio=%d, want 3 (2 output cables + 1 input pick)", line.QuantityAudio)
	}
	if line := byID[speakerItem]; line.QuantityAudio != 2 {
		t.Errorf("speaker device line audio=%d, want 2 (one device row per output)", line.QuantityAudio)
	}

	// Dangling cable_item_id on a new output cable is rejected up front.
	status, raw = doJSON(t, http.MethodPost, outputsURL, map[string]any{
		"output_number": 3, "output_type": "foh", "width": "mono",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST output 3: status %d body %s", status, raw)
	}
	output3ID := decodeJSON[domain.AudioPatchOutput](t, raw).ID
	status, raw = doJSON(t, http.MethodPost, devicesURL, map[string]any{
		"name": "Speaker 3", "inventory_item_id": speakerItem, "input_port_count": 1, "input_connector_type": "speakon",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST device 3: status %d body %s", status, raw)
	}
	device3ID := decodeJSON[domain.OutputDevice](t, raw).ID
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "mixer", "from_id": output3ID, "from_port": 0,
		"to_kind": "device", "to_id": device3ID, "to_port": 0, "cable_item_id": 99999,
	}); status != http.StatusBadRequest {
		t.Errorf("dangling output cable_item_id: status %d body %s, want 400", status, raw)
	}
}
