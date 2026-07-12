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

	// Merge with a derived quantity: one Source using the same mic.
	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/input-sources", server.URL, eventID), map[string]any{
		"name": "Lead Vox", "kind": "mic", "mic_item_id": micID, "connector_type": "xlr", "width": "mono",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST input source: status %d body %s", status, raw)
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

// TestInputSourceMicValidation covers the 400 on dangling mic references.
func TestInputSourceMicValidation(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	sourcesURL := fmt.Sprintf("%s/events/%d/input-sources", server.URL, eventID)

	status, raw := doJSON(t, http.MethodPost, sourcesURL, map[string]any{
		"name": "Lead Vox", "kind": "mic", "mic_item_id": 12345, "connector_type": "xlr", "width": "mono",
	})
	if status != http.StatusBadRequest {
		t.Errorf("dangling mic_item_id: status %d body %s, want 400", status, raw)
	}

	micID := seedItem(t, database, "Shure SM58", 4, 150)
	status, raw = doJSON(t, http.MethodPost, sourcesURL, map[string]any{
		"name": "Lead Vox", "kind": "mic", "mic_item_id": micID, "connector_type": "xlr", "width": "mono",
	})
	if status != http.StatusCreated {
		t.Fatalf("valid mic_item_id: status %d body %s, want 201", status, raw)
	}
	source := decodeJSON[domain.InputSource](t, raw)
	if source.MicItemID == nil || *source.MicItemID != micID {
		t.Errorf("created source mic_item_id=%v, want %d", source.MicItemID, micID)
	}
}

// TestRentalSummaryCountsInputCables covers the Slice 12 aggregation arm:
// cable picks on input_cables edges become priced, stock-validated rental
// lines; a channel with nothing feeding it contributes nothing.
func TestRentalSummaryCountsInputCables(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	cable4m := seedRoleItem(t, database, "cable", "Mikrofonkabel", "4m", 2, 7)
	cable10m := seedRoleItem(t, database, "cable", "Mikrofonkabel", "10m", 8, 8)
	channelsURL := fmt.Sprintf("%s/events/%d/input-channels", server.URL, eventID)
	sourcesURL := fmt.Sprintf("%s/events/%d/input-sources", server.URL, eventID)
	cablesURL := fmt.Sprintf("%s/events/%d/input-cables", server.URL, eventID)

	for channel, cableID := range map[int]int64{1: cable4m, 2: cable4m, 3: cable10m} {
		status, raw := doJSON(t, http.MethodPost, channelsURL, map[string]any{"channel_number": channel})
		if status != http.StatusCreated {
			t.Fatalf("POST channel %d: status %d body %s", channel, status, raw)
		}
		channelID := decodeJSON[domain.InputChannel](t, raw).ID
		status, raw = doJSON(t, http.MethodPost, sourcesURL, map[string]any{
			"name": fmt.Sprintf("Source %d", channel), "kind": "line", "connector_type": "jack_ts", "width": "mono",
		})
		if status != http.StatusCreated {
			t.Fatalf("POST source %d: status %d body %s", channel, status, raw)
		}
		sourceID := decodeJSON[domain.InputSource](t, raw).ID
		status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
			"from_kind": "source", "from_id": sourceID, "from_port": 0,
			"to_kind": "channel", "to_id": channelID, "to_port": 0, "cable_item_id": cableID,
		})
		if status != http.StatusCreated {
			t.Fatalf("POST cable ch %d: status %d body %s", channel, status, raw)
		}
	}
	// A channel without anything feeding it contributes nothing.
	if status, raw := doJSON(t, http.MethodPost, channelsURL, map[string]any{"channel_number": 4}); status != http.StatusCreated {
		t.Fatalf("POST bare channel: status %d body %s", status, raw)
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

// TestRentalSummaryCountsStands covers the input_sources.stand_item_id
// aggregation arm (stand is meaningful only alongside a mic pick, so every
// row here also carries a shared mic — asserted as its own line too).
func TestRentalSummaryCountsStands(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	micID := seedItem(t, database, "Shure SM58", 10, 150)
	boomStand := seedRoleItem(t, database, "stand", "Mikrofonstativ Med bom", "", 16, 20)
	drumStand := seedRoleItem(t, database, "stand", "Mikrofonstativ till trummor", "", 4, 20)
	sourcesURL := fmt.Sprintf("%s/events/%d/input-sources", server.URL, eventID)

	for i, standID := range map[int]int64{1: boomStand, 2: boomStand, 3: boomStand, 4: drumStand} {
		status, raw := doJSON(t, http.MethodPost, sourcesURL, map[string]any{
			"name": fmt.Sprintf("Mic %d", i), "kind": "mic", "mic_item_id": micID, "stand_item_id": standID, "connector_type": "xlr", "width": "mono",
		})
		if status != http.StatusCreated {
			t.Fatalf("POST source %d: status %d body %s", i, status, raw)
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
	if len(summary.Items) != 3 {
		t.Fatalf("summary has %d lines, want 3 (mic + 2 stands): %+v", len(summary.Items), summary.Items)
	}
	if line := byID[micID]; line.QuantityAudio != 4 {
		t.Errorf("mic line audio=%d, want 4", line.QuantityAudio)
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
	// The same cable picked on an input source's cable merges into the one line.
	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/input-channels", server.URL, eventID), map[string]any{"channel_number": 1})
	if status != http.StatusCreated {
		t.Fatalf("POST input channel: status %d body %s", status, raw)
	}
	inputChannelID := decodeJSON[domain.InputChannel](t, raw).ID
	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/input-sources", server.URL, eventID), map[string]any{
		"name": "Bass", "kind": "line", "connector_type": "jack_ts", "width": "mono",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST input source: status %d body %s", status, raw)
	}
	inputSourceID := decodeJSON[domain.InputSource](t, raw).ID
	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/input-cables", server.URL, eventID), map[string]any{
		"from_kind": "source", "from_id": inputSourceID, "from_port": 0,
		"to_kind": "channel", "to_id": inputChannelID, "to_port": 0, "cable_item_id": speakonCable,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST input cable: status %d body %s", status, raw)
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
