package api

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// TestOutputCableRoundTrip covers Slice 11 US1 end to end through the real
// HTTP API: a cable from the mixer into a device, then onward from that
// device into a second device, round-trips through both the create
// response and GET /audio-patch; every port/endpoint/FR-013 validation
// rule rejects bad payloads with the right status code; PATCH only ever
// touches cable_item_id.
func TestOutputCableRoundTrip(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	otherEventID := seedEvent(t, server.URL)
	cable := seedItem(t, database, "Speakon Cable", 10, 25)
	ampItem := seedItem(t, database, "Amp", 2, 400)
	speakerItem := seedItem(t, database, "Speaker", 4, 500)

	outputsURL := fmt.Sprintf("%s/events/%d/audio-outputs", server.URL, eventID)
	devicesURL := fmt.Sprintf("%s/events/%d/output-devices", server.URL, eventID)
	cablesURL := fmt.Sprintf("%s/events/%d/output-cables", server.URL, eventID)

	status, raw := doJSON(t, http.MethodPost, outputsURL, map[string]any{"output_number": 1, "output_type": "foh", "width": "mono"})
	if status != http.StatusCreated {
		t.Fatalf("POST output: status %d body %s", status, raw)
	}
	output := decodeJSON[domain.AudioPatchOutput](t, raw)

	status, raw = doJSON(t, http.MethodPost, devicesURL, map[string]any{
		"name": "Amp", "inventory_item_id": ampItem, "input_port_count": 1, "input_connector_type": "xlr", "output_port_count": 1, "output_connector_type": "speakon",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST amp device: status %d body %s", status, raw)
	}
	amp := decodeJSON[domain.OutputDevice](t, raw)

	status, raw = doJSON(t, http.MethodPost, devicesURL, map[string]any{
		"name": "Speaker", "inventory_item_id": speakerItem, "input_port_count": 1, "input_connector_type": "speakon",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST speaker device: status %d body %s", status, raw)
	}
	speaker := decodeJSON[domain.OutputDevice](t, raw)

	// mixer -> amp
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "mixer", "from_id": output.ID, "from_port": 0,
		"to_kind": "device", "to_id": amp.ID, "to_port": 0,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST mixer->amp cable: status %d body %s", status, raw)
	}
	mixerToAmp := decodeJSON[domain.OutputCable](t, raw)
	if mixerToAmp.FromKind != "mixer" || mixerToAmp.ToKind != "device" || mixerToAmp.ToID != amp.ID || mixerToAmp.CableItemID != nil {
		t.Errorf("mixer->amp cable = %+v, want no cable item picked yet", mixerToAmp)
	}

	// amp -> speaker, with a catalog cable pick.
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "device", "from_id": amp.ID, "from_port": 0,
		"to_kind": "device", "to_id": speaker.ID, "to_port": 0, "cable_item_id": cable,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST amp->speaker cable: status %d body %s", status, raw)
	}
	ampToSpeaker := decodeJSON[domain.OutputCable](t, raw)
	if ampToSpeaker.CableItemID == nil || *ampToSpeaker.CableItemID != cable {
		t.Errorf("amp->speaker cable = %+v, want cable item %d", ampToSpeaker, cable)
	}

	// Both cables show up in GET /audio-patch.
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/audio-patch", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET patch: status %d body %s", status, raw)
	}
	patch := decodeJSON[struct {
		OutputCables []domain.OutputCable `json:"output_cables"`
	}](t, raw)
	if len(patch.OutputCables) != 2 {
		t.Fatalf("audio-patch output_cables = %+v, want 2", patch.OutputCables)
	}

	// Out-of-bounds port index (amp only has 1 output port, index 0).
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "device", "from_id": amp.ID, "from_port": 1,
		"to_kind": "device", "to_id": speaker.ID, "to_port": 0,
	}); status != http.StatusBadRequest {
		t.Errorf("out-of-bounds from_port: status %d body %s, want 400", status, raw)
	}

	// Port already in use (mixer port 0 already feeds the amp).
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "mixer", "from_id": output.ID, "from_port": 0,
		"to_kind": "device", "to_id": speaker.ID, "to_port": 0,
	}); status != http.StatusConflict {
		t.Errorf("from port already in use: status %d body %s, want 409", status, raw)
	}
	status, raw = doJSON(t, http.MethodPost, devicesURL, map[string]any{
		"name": "Amp 2", "inventory_item_id": ampItem, "output_port_count": 1, "output_connector_type": "speakon",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST amp2 device: status %d body %s", status, raw)
	}
	amp2 := decodeJSON[domain.OutputDevice](t, raw)
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "device", "from_id": amp2.ID, "from_port": 0,
		"to_kind": "device", "to_id": speaker.ID, "to_port": 0,
	}); status != http.StatusConflict {
		t.Errorf("to port already in use: status %d body %s, want 409", status, raw)
	}

	// to_kind of mixer/stagebox is never valid (no input side to target).
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "device", "from_id": amp.ID, "from_port": 0,
		"to_kind": "mixer", "to_id": output.ID, "to_port": 0,
	}); status != http.StatusBadRequest {
		t.Errorf("to_kind=mixer: status %d body %s, want 400", status, raw)
	}

	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/stageboxes", server.URL, eventID), map[string]any{"name": "SB A", "connection_type": "analog"})
	if status != http.StatusCreated {
		t.Fatalf("POST stagebox: status %d body %s", status, raw)
	}
	sb := decodeJSON[domain.Stagebox](t, raw)
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "device", "from_id": amp.ID, "from_port": 0,
		"to_kind": "stagebox", "to_id": sb.ID, "to_port": 0,
	}); status != http.StatusBadRequest {
		t.Errorf("to_kind=stagebox: status %d body %s, want 400", status, raw)
	}

	// FR-013: cable_item_id must be null for a cable into a stage multi.
	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/stage-multis", server.URL, eventID), map[string]any{"name": "Multi 1", "channels": 8, "connector_type": "xlr"})
	if status != http.StatusCreated {
		t.Fatalf("POST stage multi: status %d body %s", status, raw)
	}
	multi := decodeJSON[domain.StageMulti](t, raw)
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "device", "from_id": amp2.ID, "from_port": 0,
		"to_kind": "stage_multi", "to_id": multi.ID, "to_port": 0, "cable_item_id": cable,
	}); status != http.StatusBadRequest {
		t.Errorf("cable_item_id against stage_multi to_kind: status %d body %s, want 400", status, raw)
	}
	// The same connection with no cable_item_id succeeds.
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "device", "from_id": amp2.ID, "from_port": 0,
		"to_kind": "stage_multi", "to_id": multi.ID, "to_port": 0,
	}); status != http.StatusCreated {
		t.Errorf("cable into stage multi with no item: status %d body %s, want 201", status, raw)
	}

	// A reference belonging to another event is rejected.
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "mixer", "from_id": otherEventID, "from_port": 0,
		"to_kind": "device", "to_id": speaker.ID, "to_port": 0,
	}); status != http.StatusBadRequest {
		t.Errorf("foreign from_id: status %d body %s, want 400", status, raw)
	}

	// PATCH only ever changes cable_item_id; ports/kinds are untouched.
	newCable := seedItem(t, database, "Speakon Cable 2", 10, 30)
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", cablesURL, ampToSpeaker.ID), map[string]any{"cable_item_id": newCable})
	if status != http.StatusOK {
		t.Fatalf("PATCH cable: status %d body %s", status, raw)
	}
	patched := decodeJSON[domain.OutputCable](t, raw)
	if patched.CableItemID == nil || *patched.CableItemID != newCable {
		t.Errorf("patched cable item = %v, want %d", patched.CableItemID, newCable)
	}
	if patched.FromKind != ampToSpeaker.FromKind || patched.FromID != ampToSpeaker.FromID || patched.FromPort != ampToSpeaker.FromPort ||
		patched.ToKind != ampToSpeaker.ToKind || patched.ToID != ampToSpeaker.ToID || patched.ToPort != ampToSpeaker.ToPort {
		t.Errorf("PATCH changed endpoints: before %+v after %+v", ampToSpeaker, patched)
	}

	// DELETE removes only that cable.
	if status, raw = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/%d", cablesURL, mixerToAmp.ID), nil); status != http.StatusNoContent {
		t.Fatalf("DELETE cable: status %d body %s", status, raw)
	}
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/audio-patch", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET patch after delete: status %d body %s", status, raw)
	}
	afterDelete := decodeJSON[struct {
		OutputCables []domain.OutputCable `json:"output_cables"`
	}](t, raw)
	for _, c := range afterDelete.OutputCables {
		if c.ID == mixerToAmp.ID {
			t.Errorf("deleted cable still present: %+v", c)
		}
	}
}

// TestStageMultiIndependentChannels covers Slice 11 US2: a stage multi's
// channels each connect independently — different sources, different
// destinations — with its own built-in wiring never prompting for a
// cable pick or adding a rental line, while the multi's own existing
// rental line (from the pre-existing stageboxes/stage_multis rental arm)
// is unaffected.
func TestStageMultiIndependentChannels(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	multiItem := seedItem(t, database, "Multikabel 24/4", 2, 300)
	speakerItem := seedItem(t, database, "Speaker", 4, 500)
	monitorItem := seedItem(t, database, "Monitor", 4, 450)
	inputCable := seedItem(t, database, "Sneaky input cable", 10, 20)

	outputsURL := fmt.Sprintf("%s/events/%d/audio-outputs", server.URL, eventID)
	devicesURL := fmt.Sprintf("%s/events/%d/output-devices", server.URL, eventID)
	cablesURL := fmt.Sprintf("%s/events/%d/output-cables", server.URL, eventID)

	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/stage-multis", server.URL, eventID), map[string]any{
		"name": "Multi 1", "channels": 8, "connector_type": "xlr", "inventory_item_id": multiItem,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST stage multi: status %d body %s", status, raw)
	}
	multi := decodeJSON[domain.StageMulti](t, raw)

	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/stageboxes", server.URL, eventID), map[string]any{
		"name": "SB A", "connection_type": "analog", "output_count": 4,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST stagebox: status %d body %s", status, raw)
	}
	sb := decodeJSON[domain.Stagebox](t, raw)

	status, raw = doJSON(t, http.MethodPost, outputsURL, map[string]any{"output_number": 1, "output_type": "foh", "width": "mono"})
	if status != http.StatusCreated {
		t.Fatalf("POST output: status %d body %s", status, raw)
	}
	output := decodeJSON[domain.AudioPatchOutput](t, raw)

	status, raw = doJSON(t, http.MethodPost, devicesURL, map[string]any{
		"name": "Speaker", "inventory_item_id": speakerItem, "input_port_count": 1, "input_connector_type": "speakon",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST speaker device: status %d body %s", status, raw)
	}
	speaker := decodeJSON[domain.OutputDevice](t, raw)

	status, raw = doJSON(t, http.MethodPost, devicesURL, map[string]any{
		"name": "Monitor", "inventory_item_id": monitorItem, "input_port_count": 1, "input_connector_type": "speakon",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST monitor device: status %d body %s", status, raw)
	}
	monitor := decodeJSON[domain.OutputDevice](t, raw)

	// Channel 0: mixer -> multi input 0 (a cable_item_id sent here must be
	// ignored/rejected, FR-013), multi output 0 -> speaker.
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "mixer", "from_id": output.ID, "from_port": 0,
		"to_kind": "stage_multi", "to_id": multi.ID, "to_port": 0, "cable_item_id": inputCable,
	}); status != http.StatusBadRequest {
		t.Fatalf("mixer->multi ch0 with cable_item_id: status %d body %s, want 400", status, raw)
	}
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "mixer", "from_id": output.ID, "from_port": 0,
		"to_kind": "stage_multi", "to_id": multi.ID, "to_port": 0,
	})
	if status != http.StatusCreated {
		t.Fatalf("mixer->multi ch0: status %d body %s", status, raw)
	}
	mixerToMulti := decodeJSON[domain.OutputCable](t, raw)
	if mixerToMulti.CableItemID != nil {
		t.Errorf("mixer->multi ch0 cable_item_id = %v, want nil", mixerToMulti.CableItemID)
	}
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "stage_multi", "from_id": multi.ID, "from_port": 0,
		"to_kind": "device", "to_id": speaker.ID, "to_port": 0,
	}); status != http.StatusCreated {
		t.Fatalf("multi->speaker ch0: status %d body %s", status, raw)
	}

	// Channel 1: an independent source (the stagebox) into the SAME
	// multi's different channel, with a cable_item_id also rejected, then
	// on to a different destination (the monitor).
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "stagebox", "from_id": sb.ID, "from_port": 0,
		"to_kind": "stage_multi", "to_id": multi.ID, "to_port": 1, "cable_item_id": inputCable,
	}); status != http.StatusBadRequest {
		t.Fatalf("stagebox->multi ch1 with cable_item_id: status %d body %s, want 400", status, raw)
	}
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "stagebox", "from_id": sb.ID, "from_port": 0,
		"to_kind": "stage_multi", "to_id": multi.ID, "to_port": 1,
	})
	if status != http.StatusCreated {
		t.Fatalf("stagebox->multi ch1: status %d body %s", status, raw)
	}
	stageboxToMulti := decodeJSON[domain.OutputCable](t, raw)
	if stageboxToMulti.CableItemID != nil {
		t.Errorf("stagebox->multi ch1 cable_item_id = %v, want nil", stageboxToMulti.CableItemID)
	}
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "stage_multi", "from_id": multi.ID, "from_port": 1,
		"to_kind": "device", "to_id": monitor.ID, "to_port": 0,
	}); status != http.StatusCreated {
		t.Fatalf("multi->monitor ch1: status %d body %s", status, raw)
	}

	// Rental: the multi's own line counts once (unchanged), speaker and
	// monitor devices each count once, and neither input-side cable
	// contributes anything (no cable item exists for either).
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/rentals", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET rentals: status %d body %s", status, raw)
	}
	summary := decodeJSON[domain.RentalSummary](t, raw)
	byID := map[int64]domain.EventRental{}
	for _, line := range summary.Items {
		byID[line.InventoryItemID] = line
	}
	if line := byID[multiItem]; line.QuantityAudio != 1 {
		t.Errorf("multi's own rental line audio=%d, want 1 (unaffected by its channels' connections)", line.QuantityAudio)
	}
	if line := byID[speakerItem]; line.QuantityAudio != 1 {
		t.Errorf("speaker device line audio=%d, want 1", line.QuantityAudio)
	}
	if line := byID[monitorItem]; line.QuantityAudio != 1 {
		t.Errorf("monitor device line audio=%d, want 1", line.QuantityAudio)
	}
	if _, found := byID[inputCable]; found {
		t.Errorf("input-side cable item unexpectedly on the rental order: %+v", byID[inputCable])
	}
}

// TestStageboxPassThroughAndMixerFanOut covers the graph-topology
// follow-up: a stagebox is a full pass-through (a channel routes into a
// specific jack with no cable pick, then a real cable carries on from
// that same jack), and a mixer port — a logical channel, not a physical
// jack — can fan out to more than one destination at once.
func TestStageboxPassThroughAndMixerFanOut(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	speakerItem := seedItem(t, database, "Speaker", 4, 500)
	cable := seedItem(t, database, "Speakon Cable", 10, 25)

	outputsURL := fmt.Sprintf("%s/events/%d/audio-outputs", server.URL, eventID)
	devicesURL := fmt.Sprintf("%s/events/%d/output-devices", server.URL, eventID)
	cablesURL := fmt.Sprintf("%s/events/%d/output-cables", server.URL, eventID)

	status, raw := doJSON(t, http.MethodPost, outputsURL, map[string]any{"output_number": 1, "output_type": "foh", "width": "mono"})
	if status != http.StatusCreated {
		t.Fatalf("POST output: status %d body %s", status, raw)
	}
	output := decodeJSON[domain.AudioPatchOutput](t, raw)

	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/stageboxes", server.URL, eventID), map[string]any{"name": "SB A", "connection_type": "analog", "output_count": 4})
	if status != http.StatusCreated {
		t.Fatalf("POST stagebox: status %d body %s", status, raw)
	}
	sb := decodeJSON[domain.Stagebox](t, raw)

	status, raw = doJSON(t, http.MethodPost, devicesURL, map[string]any{
		"name": "Monitor", "inventory_item_id": speakerItem, "input_port_count": 1, "input_connector_type": "xlr",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST device: status %d body %s", status, raw)
	}
	monitor := decodeJSON[domain.OutputDevice](t, raw)

	// Channel -> stagebox jack: a cable_item_id is rejected (FR-013, same
	// rule as a stage multi's input side).
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "mixer", "from_id": output.ID, "from_port": 0,
		"to_kind": "stagebox", "to_id": sb.ID, "to_port": 2, "cable_item_id": cable,
	}); status != http.StatusBadRequest {
		t.Errorf("mixer->stagebox with cable_item_id: status %d body %s, want 400", status, raw)
	}
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "mixer", "from_id": output.ID, "from_port": 0,
		"to_kind": "stagebox", "to_id": sb.ID, "to_port": 2,
	})
	if status != http.StatusCreated {
		t.Fatalf("mixer->stagebox: status %d body %s", status, raw)
	}
	channelToStagebox := decodeJSON[domain.OutputCable](t, raw)
	if channelToStagebox.CableItemID != nil {
		t.Errorf("mixer->stagebox cable_item_id = %v, want nil", channelToStagebox.CableItemID)
	}

	// The same stagebox jack now carries on to a device with a real,
	// normally-picked cable.
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "stagebox", "from_id": sb.ID, "from_port": 2,
		"to_kind": "device", "to_id": monitor.ID, "to_port": 0, "cable_item_id": cable,
	}); status != http.StatusCreated {
		t.Errorf("stagebox->device: status %d body %s", status, raw)
	}

	// The SAME mixer port also fans out to its own local-out device —
	// two cables from one from_port, allowed only for from_kind=mixer.
	status, raw = doJSON(t, http.MethodPost, devicesURL, map[string]any{
		"name": "Local speaker", "inventory_item_id": speakerItem, "input_port_count": 1, "input_connector_type": "xlr",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST second device: status %d body %s", status, raw)
	}
	localSpeaker := decodeJSON[domain.OutputDevice](t, raw)
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "mixer", "from_id": output.ID, "from_port": 0,
		"to_kind": "device", "to_id": localSpeaker.ID, "to_port": 0,
	}); status != http.StatusCreated {
		t.Errorf("mixer fan-out to a second destination: status %d body %s, want 201", status, raw)
	}

	// A non-mixer from_kind stays restricted to one cable per port.
	if status, raw = doJSON(t, http.MethodPost, devicesURL, map[string]any{
		"name": "Third speaker", "inventory_item_id": speakerItem, "input_port_count": 1, "input_connector_type": "xlr",
	}); status != http.StatusCreated {
		t.Fatalf("POST third device: status %d body %s", status, raw)
	}
	thirdSpeaker := decodeJSON[domain.OutputDevice](t, raw)
	if status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "stagebox", "from_id": sb.ID, "from_port": 2,
		"to_kind": "device", "to_id": thirdSpeaker.ID, "to_port": 0,
	}); status != http.StatusConflict {
		t.Errorf("stagebox port reused for a second cable: status %d body %s, want 409", status, raw)
	}

	// Rental: the channel->stagebox cable contributes nothing; the
	// stagebox->device cable and both devices count normally.
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/rentals", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET rentals: status %d body %s", status, raw)
	}
	summary := decodeJSON[domain.RentalSummary](t, raw)
	byID := map[int64]domain.EventRental{}
	for _, line := range summary.Items {
		byID[line.InventoryItemID] = line
	}
	if line := byID[speakerItem]; line.QuantityAudio != 3 {
		t.Errorf("speaker device line audio=%d, want 3 (monitor + local speaker + third speaker)", line.QuantityAudio)
	}
	if line := byID[cable]; line.QuantityAudio != 1 {
		t.Errorf("cable line audio=%d, want 1 (only the stagebox->device leg)", line.QuantityAudio)
	}

	// Mixer position round-trips through its own dedicated endpoint.
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/events/%d/output-mixer-position", server.URL, eventID), map[string]any{"position_y": 123.5})
	if status != http.StatusNoContent {
		t.Fatalf("PATCH mixer position: status %d body %s", status, raw)
	}
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/audio-patch", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET patch: status %d body %s", status, raw)
	}
	patch := decodeJSON[struct {
		OutputMixerPositionY float64 `json:"output_mixer_position_y"`
	}](t, raw)
	if patch.OutputMixerPositionY != 123.5 {
		t.Errorf("mixer position_y = %v, want 123.5", patch.OutputMixerPositionY)
	}
}
