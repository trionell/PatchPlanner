package api

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// TestInputCableRoundTrip covers Slice 12 US1 end to end through the real
// HTTP API: a mic Source cabled through a Stagebox jack (real cable) into
// a Channel (cableless console-side hop), that same Source's port
// double-patched directly to a second Channel (FR-006), and the guard-rail
// error responses (out-of-bounds port, already-in-use port, non-null
// cable_item_id on a cableless edge, dangling item ref).
func TestInputCableRoundTrip(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	micItem := seedItem(t, database, "Shure SM58", 4, 150)
	cableItem := seedItem(t, database, "XLR Mic Cable 10m", 10, 20)

	sourcesURL := fmt.Sprintf("%s/events/%d/input-sources", server.URL, eventID)
	stageboxesURL := fmt.Sprintf("%s/events/%d/stageboxes", server.URL, eventID)
	channelsURL := fmt.Sprintf("%s/events/%d/input-channels", server.URL, eventID)
	cablesURL := fmt.Sprintf("%s/events/%d/input-cables", server.URL, eventID)

	status, raw := doJSON(t, http.MethodPost, sourcesURL, map[string]any{
		"name": "Lead Vox", "kind": "mic", "mic_item_id": micItem, "connector_type": "xlr", "width": "mono",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST source: status %d body %s", status, raw)
	}
	source := decodeJSON[domain.InputSource](t, raw)

	status, raw = doJSON(t, http.MethodPost, stageboxesURL, map[string]any{"name": "SB1", "connection_type": "analog", "input_count": 8})
	if status != http.StatusCreated {
		t.Fatalf("POST stagebox: status %d body %s", status, raw)
	}
	stagebox := decodeJSON[domain.Stagebox](t, raw)

	status, raw = doJSON(t, http.MethodPost, channelsURL, map[string]any{"channel_number": 1, "channel_name": "Lead Vox"})
	if status != http.StatusCreated {
		t.Fatalf("POST channel: status %d body %s", status, raw)
	}
	channel1 := decodeJSON[domain.InputChannel](t, raw)

	status, raw = doJSON(t, http.MethodPost, channelsURL, map[string]any{"channel_number": 2, "channel_name": "Talkback Mon"})
	if status != http.StatusCreated {
		t.Fatalf("POST second channel: status %d body %s", status, raw)
	}
	channel2 := decodeJSON[domain.InputChannel](t, raw)

	// Source -> Stagebox jack: real, picker-eligible cable.
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "source", "from_id": source.ID, "from_port": 0,
		"to_kind": "stagebox", "to_id": stagebox.ID, "to_port": 0, "cable_item_id": cableItem,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST source->stagebox cable: status %d body %s", status, raw)
	}
	sourceToStagebox := decodeJSON[domain.InputCable](t, raw)
	if sourceToStagebox.CableItemID == nil || *sourceToStagebox.CableItemID != cableItem {
		t.Errorf("source->stagebox cable = %+v, want cable item %d", sourceToStagebox, cableItem)
	}

	// Stagebox -> Channel 1: cableless console-side hop, non-null item rejected.
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "stagebox", "from_id": stagebox.ID, "from_port": 0,
		"to_kind": "channel", "to_id": channel1.ID, "to_port": 0, "cable_item_id": cableItem,
	}); status != http.StatusBadRequest {
		t.Errorf("cable_item_id on cableless edge: status %d body %s, want 400", status, raw)
	}
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "stagebox", "from_id": stagebox.ID, "from_port": 0,
		"to_kind": "channel", "to_id": channel1.ID, "to_port": 0,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST stagebox->channel cable: status %d body %s", status, raw)
	}
	stageboxToChannel := decodeJSON[domain.InputCable](t, raw)
	if stageboxToChannel.CableItemID != nil {
		t.Errorf("stagebox->channel cable should be cableless, got %+v", stageboxToChannel)
	}

	// Double-patch: the same Source port feeds a second Channel directly,
	// bypassing the stagebox entirely — no error, no duplicate Source.
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "source", "from_id": source.ID, "from_port": 0,
		"to_kind": "channel", "to_id": channel2.ID, "to_port": 0,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST double-patch cable: status %d body %s", status, raw)
	}

	// GET /audio-patch reflects all three cables.
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/audio-patch", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET patch: status %d body %s", status, raw)
	}
	patch := decodeJSON[inputCablesPatchResponse](t, raw)
	if len(patch.InputCables) != 3 {
		t.Fatalf("audio-patch input_cables = %+v, want 3", patch.InputCables)
	}

	// A second Source into an already-fed Channel port is rejected.
	status, raw = doJSON(t, http.MethodPost, sourcesURL, map[string]any{
		"name": "Backup Mic", "kind": "mic", "mic_item_id": micItem, "connector_type": "xlr", "width": "mono",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST second source: status %d body %s", status, raw)
	}
	secondSource := decodeJSON[domain.InputSource](t, raw)
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "source", "from_id": secondSource.ID, "from_port": 0,
		"to_kind": "channel", "to_id": channel2.ID, "to_port": 0,
	}); status != http.StatusConflict {
		t.Errorf("second source into fed channel: status %d body %s, want 409", status, raw)
	}

	// A non-Source from-port already in use is rejected (stagebox port 0
	// already feeds channel 1).
	if status, raw = doJSON(t, http.MethodPost, channelsURL, map[string]any{"channel_number": 3}); status != http.StatusCreated {
		t.Fatalf("POST third channel: status %d body %s", status, raw)
	}
	channel3 := decodeJSON[domain.InputChannel](t, raw)
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "stagebox", "from_id": stagebox.ID, "from_port": 0,
		"to_kind": "channel", "to_id": channel3.ID, "to_port": 0,
	}); status != http.StatusConflict {
		t.Errorf("reused non-source from-port: status %d body %s, want 409", status, raw)
	}

	// Out-of-bounds port index.
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "source", "from_id": source.ID, "from_port": 5,
		"to_kind": "channel", "to_id": channel3.ID, "to_port": 0,
	}); status != http.StatusBadRequest {
		t.Errorf("out-of-bounds from_port: status %d body %s, want 400", status, raw)
	}

	// Dangling cable_item_id is rejected up front.
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "source", "from_id": secondSource.ID, "from_port": 0,
		"to_kind": "channel", "to_id": channel3.ID, "to_port": 0, "cable_item_id": 99999,
	}); status != http.StatusBadRequest {
		t.Errorf("dangling cable_item_id: status %d body %s, want 400", status, raw)
	}

	// PATCH only ever changes cable_item_id.
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", cablesURL, sourceToStagebox.ID), map[string]any{"cable_item_id": nil})
	if status != http.StatusOK {
		t.Fatalf("PATCH cable: status %d body %s", status, raw)
	}
	if patched := decodeJSON[domain.InputCable](t, raw); patched.CableItemID != nil || patched.FromID != source.ID || patched.ToID != stagebox.ID {
		t.Errorf("patched cable = %+v, want cable_item_id cleared, endpoints unchanged", patched)
	}

	// Deleting the stagebox->channel cable reverts channel 1 to unfed.
	if status, raw = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/%d", cablesURL, stageboxToChannel.ID), nil); status != http.StatusNoContent {
		t.Fatalf("DELETE cable: status %d body %s", status, raw)
	}
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/audio-patch", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET patch after delete: status %d body %s", status, raw)
	}
	patch = decodeJSON[inputCablesPatchResponse](t, raw)
	for _, c := range patch.InputCables {
		if c.ToKind == "channel" && c.ToID == channel1.ID {
			t.Errorf("channel 1 still fed after cable deletion: %+v", c)
		}
	}
}

type inputCablesPatchResponse struct {
	InputCables []domain.InputCable `json:"input_cables"`
}

// TestStageMultiOutputAlwaysCableless covers a correction to research.md
// R5 found via manual use: a Stage Multi's own body IS the cable for its
// entire run, so its output side is cableless no matter what it feeds —
// a Channel, a Stagebox, another Stage Multi, or a Processing device —
// unlike a Stagebox, whose output side is only cableless into a Channel
// (a real cable is still required from a Stagebox into a device).
func TestStageMultiOutputAlwaysCableless(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	cableItem := seedItem(t, database, "XLR Cable", 10, 20)
	diItem := seedItem(t, database, "DI Box", 10, 40)

	sourcesURL := fmt.Sprintf("%s/events/%d/input-sources", server.URL, eventID)
	devicesURL := fmt.Sprintf("%s/events/%d/input-devices", server.URL, eventID)
	stageboxesURL := fmt.Sprintf("%s/events/%d/stageboxes", server.URL, eventID)
	stageMultisURL := fmt.Sprintf("%s/events/%d/stage-multis", server.URL, eventID)
	cablesURL := fmt.Sprintf("%s/events/%d/input-cables", server.URL, eventID)

	status, raw := doJSON(t, http.MethodPost, sourcesURL, map[string]any{"name": "Mic", "kind": "line", "connector_type": "xlr", "width": "mono"})
	if status != http.StatusCreated {
		t.Fatalf("POST source: status %d body %s", status, raw)
	}
	source := decodeJSON[domain.InputSource](t, raw)

	status, raw = doJSON(t, http.MethodPost, stageMultisURL, map[string]any{"name": "Multi 1", "channels": 8, "connector_type": "xlr"})
	if status != http.StatusCreated {
		t.Fatalf("POST stage multi: status %d body %s", status, raw)
	}
	stageMulti := decodeJSON[domain.StageMulti](t, raw)

	status, raw = doJSON(t, http.MethodPost, devicesURL, map[string]any{
		"name": "DI", "inventory_item_id": diItem, "input_port_count": 1, "input_connector_type": "jack_ts", "output_port_count": 1, "output_connector_type": "xlr",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST device: status %d body %s", status, raw)
	}
	device := decodeJSON[domain.InputDevice](t, raw)

	// Source -> Stage Multi jack: a real, picker-eligible cable.
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "source", "from_id": source.ID, "from_port": 0,
		"to_kind": "stage_multi", "to_id": stageMulti.ID, "to_port": 0, "cable_item_id": cableItem,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST source->multi cable: status %d body %s", status, raw)
	}

	// Stage Multi's output side -> a Device: cableless, a non-null pick is rejected.
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "stage_multi", "from_id": stageMulti.ID, "from_port": 0,
		"to_kind": "device", "to_id": device.ID, "to_port": 0, "cable_item_id": cableItem,
	}); status != http.StatusBadRequest {
		t.Errorf("cable_item_id on stage-multi->device edge: status %d body %s, want 400", status, raw)
	}
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "stage_multi", "from_id": stageMulti.ID, "from_port": 0,
		"to_kind": "device", "to_id": device.ID, "to_port": 0,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST stage-multi->device cable: status %d body %s", status, raw)
	}
	multiToDevice := decodeJSON[domain.InputCable](t, raw)
	if multiToDevice.CableItemID != nil {
		t.Errorf("stage-multi->device cable should be cableless, got %+v", multiToDevice)
	}

	// By contrast, a Stagebox's output side into a Device still requires a real cable.
	status, raw = doJSON(t, http.MethodPost, stageboxesURL, map[string]any{"name": "SB1", "connection_type": "analog", "input_count": 8})
	if status != http.StatusCreated {
		t.Fatalf("POST stagebox: status %d body %s", status, raw)
	}
	stagebox := decodeJSON[domain.Stagebox](t, raw)
	status, raw = doJSON(t, http.MethodPost, sourcesURL, map[string]any{"name": "Mic 2", "kind": "line", "connector_type": "xlr", "width": "mono"})
	if status != http.StatusCreated {
		t.Fatalf("POST second source: status %d body %s", status, raw)
	}
	source2 := decodeJSON[domain.InputSource](t, raw)
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "source", "from_id": source2.ID, "from_port": 0,
		"to_kind": "stagebox", "to_id": stagebox.ID, "to_port": 0, "cable_item_id": cableItem,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST source->stagebox cable: status %d body %s", status, raw)
	}
	status, raw = doJSON(t, http.MethodPost, devicesURL, map[string]any{
		"name": "DI 2", "inventory_item_id": diItem, "input_port_count": 1, "input_connector_type": "jack_ts", "output_port_count": 1, "output_connector_type": "xlr",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST second device: status %d body %s", status, raw)
	}
	device2 := decodeJSON[domain.InputDevice](t, raw)
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "stagebox", "from_id": stagebox.ID, "from_port": 0,
		"to_kind": "device", "to_id": device2.ID, "to_port": 0, "cable_item_id": cableItem,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST stagebox->device cable: status %d body %s", status, raw)
	}
	stageboxToDevice := decodeJSON[domain.InputCable](t, raw)
	if stageboxToDevice.CableItemID == nil || *stageboxToDevice.CableItemID != cableItem {
		t.Errorf("stagebox->device cable should keep its real cable pick, got %+v", stageboxToDevice)
	}
}

// TestStereoChannelHasTwoIndependentPorts covers a bug found via manual
// use: a stereo Channel must contribute two independent ports to the
// graph, mirroring how a stereo Source already works (sourcePorts) and
// the Output graph's Mixer (mixerPorts) — a mono Channel keeps exactly
// one port, and connecting a second real cable into port 1 of a stereo
// Channel must succeed, not 400.
func TestStereoChannelHasTwoIndependentPorts(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)

	sourcesURL := fmt.Sprintf("%s/events/%d/input-sources", server.URL, eventID)
	channelsURL := fmt.Sprintf("%s/events/%d/input-channels", server.URL, eventID)
	cablesURL := fmt.Sprintf("%s/events/%d/input-cables", server.URL, eventID)

	status, raw := doJSON(t, http.MethodPost, channelsURL, map[string]any{"channel_number": 1, "channel_name": "OH", "width": "stereo"})
	if status != http.StatusCreated {
		t.Fatalf("POST stereo channel: status %d body %s", status, raw)
	}
	channel := decodeJSON[domain.InputChannel](t, raw)

	status, raw = doJSON(t, http.MethodPost, sourcesURL, map[string]any{"name": "OH L", "kind": "line", "connector_type": "xlr", "width": "mono"})
	if status != http.StatusCreated {
		t.Fatalf("POST source L: status %d body %s", status, raw)
	}
	sourceL := decodeJSON[domain.InputSource](t, raw)
	status, raw = doJSON(t, http.MethodPost, sourcesURL, map[string]any{"name": "OH R", "kind": "line", "connector_type": "xlr", "width": "mono"})
	if status != http.StatusCreated {
		t.Fatalf("POST source R: status %d body %s", status, raw)
	}
	sourceR := decodeJSON[domain.InputSource](t, raw)

	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "source", "from_id": sourceL.ID, "from_port": 0,
		"to_kind": "channel", "to_id": channel.ID, "to_port": 0,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST cable into channel port 0: status %d body %s", status, raw)
	}
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "source", "from_id": sourceR.ID, "from_port": 0,
		"to_kind": "channel", "to_id": channel.ID, "to_port": 1,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST cable into stereo channel port 1: status %d body %s", status, raw)
	}

	// Port 2 is out of bounds for a stereo (2-port) channel.
	status, raw = doJSON(t, http.MethodPost, sourcesURL, map[string]any{"name": "Extra", "kind": "line", "connector_type": "jack_ts", "width": "mono"})
	if status != http.StatusCreated {
		t.Fatalf("POST extra source: status %d body %s", status, raw)
	}
	extraSource := decodeJSON[domain.InputSource](t, raw)
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "source", "from_id": extraSource.ID, "from_port": 0,
		"to_kind": "channel", "to_id": channel.ID, "to_port": 2,
	}); status != http.StatusBadRequest {
		t.Errorf("cable into out-of-bounds channel port 2: status %d body %s, want 400", status, raw)
	}

	// A mono channel keeps exactly one port — port 1 is out of bounds.
	status, raw = doJSON(t, http.MethodPost, channelsURL, map[string]any{"channel_number": 2, "channel_name": "Mono"})
	if status != http.StatusCreated {
		t.Fatalf("POST mono channel: status %d body %s", status, raw)
	}
	monoChannel := decodeJSON[domain.InputChannel](t, raw)
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "source", "from_id": extraSource.ID, "from_port": 0,
		"to_kind": "channel", "to_id": monoChannel.ID, "to_port": 1,
	}); status != http.StatusBadRequest {
		t.Errorf("cable into out-of-bounds mono channel port 1: status %d body %s, want 400", status, raw)
	}
}

// TestInputCableStereoSplitterRentalCounting covers Slice 12 US5 through the
// real HTTP API: a stereo Source's two ports both cabled into a stereo
// Device's two input ports via a splitter — one port's cable carries the
// catalog item, the paired port's cable is left without one (research.md
// R6) — and the rental summary must bill that item once, not twice
// (cross-checks TestInputGraphRentalCounting's db-package-level assertion
// through the full create-cable -> rental-summary path).
func TestInputCableStereoSplitterRentalCounting(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	splitterCable := seedItem(t, database, "TRS-2xTS Splitter", 10, 25)
	diItem := seedItem(t, database, "Stereo DI", 4, 60)

	sourcesURL := fmt.Sprintf("%s/events/%d/input-sources", server.URL, eventID)
	devicesURL := fmt.Sprintf("%s/events/%d/input-devices", server.URL, eventID)
	cablesURL := fmt.Sprintf("%s/events/%d/input-cables", server.URL, eventID)

	status, raw := doJSON(t, http.MethodPost, sourcesURL, map[string]any{
		"name": "Playback PC", "kind": "line", "connector_type": "mini_jack_3_5mm", "width": "stereo",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST stereo source: status %d body %s", status, raw)
	}
	source := decodeJSON[domain.InputSource](t, raw)

	status, raw = doJSON(t, http.MethodPost, devicesURL, map[string]any{
		"name": "Stereo DI", "inventory_item_id": diItem,
		"input_port_count": 2, "input_connector_type": "jack_ts",
		"output_port_count": 2, "output_connector_type": "xlr",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST stereo DI device: status %d body %s", status, raw)
	}
	device := decodeJSON[domain.InputDevice](t, raw)

	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "source", "from_id": source.ID, "from_port": 0,
		"to_kind": "device", "to_id": device.ID, "to_port": 0, "cable_item_id": splitterCable,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST splitter cable L: status %d body %s", status, raw)
	}
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "source", "from_id": source.ID, "from_port": 1,
		"to_kind": "device", "to_id": device.ID, "to_port": 1,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST splitter cable R (no item): status %d body %s", status, raw)
	}

	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/rentals", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET rental summary: status %d body %s", status, raw)
	}
	summary := decodeJSON[domain.RentalSummary](t, raw)
	byID := map[int64]domain.EventRental{}
	for _, line := range summary.Items {
		byID[line.InventoryItemID] = line
	}
	if got := byID[splitterCable].QuantityAudio; got != 1 {
		t.Errorf("splitter cable quantity_audio = %d, want 1 (billed once, not per port)", got)
	}
	if got := byID[diItem].QuantityAudio; got != 1 {
		t.Errorf("stereo DI device quantity_audio = %d, want 1", got)
	}
}
