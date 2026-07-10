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

	// Output chain hops follow the same lifecycle for their cable: a
	// migrated hop's legacy text is served until a catalog pick clears it
	// for good — even if the caller sends both in the same write.
	outputsURL := fmt.Sprintf("%s/events/%d/audio-outputs", server.URL, eventID)
	if _, err := database.Exec(`INSERT INTO audio_patch_outputs (event_id, output_number, output_type, width) VALUES (?, 1, 'foh', 'mono')`, eventID); err != nil {
		t.Fatalf("seed output: %v", err)
	}
	var outputID int64
	if err := database.QueryRow(`SELECT id FROM audio_patch_outputs WHERE event_id = ?`, eventID).Scan(&outputID); err != nil {
		t.Fatalf("output id: %v", err)
	}
	if _, err := database.Exec(`INSERT INTO output_chain_hops (output_id, position, hop_kind, cable_type, cable_length_m) VALUES (?, 0, 'device', 'nl4', 20)`, outputID); err != nil {
		t.Fatalf("seed legacy hop: %v", err)
	}
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", outputsURL, outputID), map[string]any{
		"output_number": 1, "output_type": "foh", "width": "mono",
		"chain": []map[string]any{{"hop_kind": "device", "cable_item_id": cableID, "cable_type": "nl4", "cable_length_m": 20}},
	})
	if status != http.StatusOK {
		t.Fatalf("PATCH output pick: status %d body %s", status, raw)
	}
	output := decodeJSON[domain.AudioPatchOutput](t, raw)
	if len(output.Chain) != 1 {
		t.Fatalf("output chain after pick: %+v, want 1 hop", output.Chain)
	}
	hop := output.Chain[0]
	if hop.CableItemID == nil || *hop.CableItemID != cableID || hop.CableType != "" || hop.CableLengthM != 0 {
		t.Errorf("output hop after pick: %+v, want cable item %d and cleared legacy", hop, cableID)
	}
}

// TestStereoWidthRoundTrip covers slice-9 US1: width/mixer_behavior and
// independently-patched side-B routing round-trip on create and update, and
// enum/foreign-event validation rejects bad values up front.
func TestStereoWidthRoundTrip(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	otherEventID := seedEvent(t, server.URL)

	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/stageboxes", server.URL, eventID), map[string]any{
		"name": "SB A", "connection_type": "analog",
	})
	if status != http.StatusCreated {
		t.Fatalf("create stagebox: status %d body %s", status, raw)
	}
	sbID := decodeJSON[domain.Stagebox](t, raw).ID

	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/stageboxes", server.URL, otherEventID), map[string]any{
		"name": "SB Foreign", "connection_type": "analog",
	})
	if status != http.StatusCreated {
		t.Fatalf("create foreign stagebox: status %d body %s", status, raw)
	}
	foreignSbID := decodeJSON[domain.Stagebox](t, raw).ID

	inputsURL := fmt.Sprintf("%s/events/%d/audio-inputs", server.URL, eventID)

	// Create: stereo, linked channels, independently-patched side B.
	status, raw = doJSON(t, http.MethodPost, inputsURL, map[string]any{
		"channel_number": 5, "signal_type": "mic", "width": "stereo", "mixer_behavior": "linked_channels",
		"stagebox_id": sbID, "stagebox_channel": 9, "stagebox_id_b": sbID, "stagebox_channel_b": 10,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST stereo input: status %d body %s", status, raw)
	}
	created := decodeJSON[domain.AudioPatchInput](t, raw)
	if created.Width != "stereo" || created.MixerBehavior != "linked_channels" {
		t.Errorf("created width=%q mixer_behavior=%q, want stereo/linked_channels", created.Width, created.MixerBehavior)
	}
	if created.StageboxIDB == nil || *created.StageboxIDB != sbID || created.StageboxChannelB == nil || *created.StageboxChannelB != 10 {
		t.Errorf("created side B: stagebox_id_b=%v stagebox_channel_b=%v, want %d/10", created.StageboxIDB, created.StageboxChannelB, sbID)
	}

	// Update: repatch side B independently, per the crowd-mic scenario —
	// no requirement that it stay on the same stagebox as side A.
	created.StageboxIDB = nil
	created.StageboxChannelB = nil
	updateURL := fmt.Sprintf("%s/%d", inputsURL, created.ID)
	status, raw = doJSON(t, http.MethodPatch, updateURL, created)
	if status != http.StatusOK {
		t.Fatalf("PATCH clear side B: status %d body %s", status, raw)
	}
	updated := decodeJSON[domain.AudioPatchInput](t, raw)
	if updated.StageboxIDB != nil || updated.StageboxChannelB != nil {
		t.Errorf("after clearing side B: %+v, want nil", updated)
	}

	// Invalid enum values are rejected.
	if status, raw = doJSON(t, http.MethodPost, inputsURL, map[string]any{
		"channel_number": 6, "signal_type": "mic", "width": "quad",
	}); status != http.StatusBadRequest {
		t.Errorf("invalid width: status %d body %s, want 400", status, raw)
	}
	if status, raw = doJSON(t, http.MethodPost, inputsURL, map[string]any{
		"channel_number": 6, "signal_type": "mic", "width": "stereo", "mixer_behavior": "ganged",
	}); status != http.StatusBadRequest {
		t.Errorf("invalid mixer_behavior: status %d body %s, want 400", status, raw)
	}

	// A side-B stagebox belonging to another event is rejected.
	if status, raw = doJSON(t, http.MethodPost, inputsURL, map[string]any{
		"channel_number": 6, "signal_type": "mic", "width": "stereo", "stagebox_id_b": foreignSbID,
	}); status != http.StatusBadRequest {
		t.Errorf("foreign stagebox_id_b: status %d body %s, want 400", status, raw)
	}
}

// TestDISourceCableValidation covers slice-9 US2: source_cabling enum
// validation, dangling source_cable_item_id rejection, and that a non-DI
// row still accepts (and simply doesn't use for counting) a source cable
// pick if one happens to be set — per FR-012/edge cases, values are inert
// rather than rejected outside their signal type.
func TestDISourceCableValidation(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	cableID := seedRoleItem(t, database, "cable", "Linekabel Tele-tele", "2m", 10, 15)
	inputsURL := fmt.Sprintf("%s/events/%d/audio-inputs", server.URL, eventID)

	if status, raw := doJSON(t, http.MethodPost, inputsURL, map[string]any{
		"channel_number": 1, "signal_type": "di", "width": "stereo", "source_cabling": "half-and-half",
	}); status != http.StatusBadRequest {
		t.Errorf("invalid source_cabling: status %d body %s, want 400", status, raw)
	}
	if status, raw := doJSON(t, http.MethodPost, inputsURL, map[string]any{
		"channel_number": 1, "signal_type": "di", "source_cable_item_id": 99999,
	}); status != http.StatusBadRequest {
		t.Errorf("dangling source_cable_item_id: status %d body %s, want 400", status, raw)
	}

	status, raw := doJSON(t, http.MethodPost, inputsURL, map[string]any{
		"channel_number": 1, "signal_type": "mic", "source_cable_item_id": cableID,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST non-DI with source cable: status %d body %s", status, raw)
	}
	created := decodeJSON[domain.AudioPatchInput](t, raw)
	if created.SourceCableItemID == nil || *created.SourceCableItemID != cableID {
		t.Errorf("non-DI row: source_cable_item_id=%v, want it stored (inert, not rejected)", created.SourceCableItemID)
	}
}

// TestOutputChainRoundTrip covers slice-10 US1: an arbitrary-length chain
// of mixed route/device hops round-trips on create, reorders/shrinks
// correctly on update (positions reassigned to the new array order), and
// every hop-level validation rule rejects bad payloads up front without
// touching the previously stored chain.
func TestOutputChainRoundTrip(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	otherEventID := seedEvent(t, server.URL)
	cable := seedItem(t, database, "Cable", 10, 20)
	speaker1 := seedItem(t, database, "Speaker 1", 4, 500)
	speaker2 := seedItem(t, database, "Speaker 2", 4, 500)

	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/stageboxes", server.URL, eventID), map[string]any{
		"name": "SB A", "connection_type": "analog",
	})
	if status != http.StatusCreated {
		t.Fatalf("create stagebox: status %d body %s", status, raw)
	}
	sbID := decodeJSON[domain.Stagebox](t, raw).ID

	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/stageboxes", server.URL, otherEventID), map[string]any{
		"name": "SB Foreign", "connection_type": "analog",
	})
	if status != http.StatusCreated {
		t.Fatalf("create foreign stagebox: status %d body %s", status, raw)
	}
	foreignSbID := decodeJSON[domain.Stagebox](t, raw).ID

	outputsURL := fmt.Sprintf("%s/events/%d/audio-outputs", server.URL, eventID)

	// 5-hop chain: route hop with independent side B, two plain device
	// hops each with their own cable, one bare device hop (nothing picked
	// yet), one cable-only hop.
	fullChain := []map[string]any{
		{"hop_kind": "route", "stagebox_id": sbID, "stagebox_channel": 1, "stagebox_id_b": sbID, "stagebox_channel_b": 2, "cable_item_id": cable},
		{"hop_kind": "device", "inventory_item_id": speaker1, "cable_item_id": cable},
		{"hop_kind": "device", "inventory_item_id": speaker2, "cable_item_id": cable},
		{"hop_kind": "device"},
		{"hop_kind": "device", "cable_item_id": cable},
	}
	status, raw = doJSON(t, http.MethodPost, outputsURL, map[string]any{
		"output_number": 1, "output_type": "foh", "chain": fullChain,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST output: status %d body %s", status, raw)
	}
	created := decodeJSON[domain.AudioPatchOutput](t, raw)
	if len(created.Chain) != 5 {
		t.Fatalf("created chain has %d hops, want 5: %+v", len(created.Chain), created.Chain)
	}
	for i, hop := range created.Chain {
		if hop.Position != i {
			t.Errorf("hop %d position=%d, want %d", i, hop.Position, i)
		}
	}
	if created.Chain[0].HopKind != "route" || created.Chain[0].StageboxIDB == nil || *created.Chain[0].StageboxIDB != sbID || created.Chain[0].StageboxChannelB == nil || *created.Chain[0].StageboxChannelB != 2 {
		t.Errorf("hop 0 side B not round-tripped: %+v", created.Chain[0])
	}

	// Reorder and remove the middle device hop (index 2, speaker2).
	reordered := []map[string]any{
		fullChain[1], fullChain[0], fullChain[3], fullChain[4],
	}
	updateURL := fmt.Sprintf("%s/%d", outputsURL, created.ID)
	status, raw = doJSON(t, http.MethodPatch, updateURL, map[string]any{
		"output_number": 1, "output_type": "foh", "chain": reordered,
	})
	if status != http.StatusOK {
		t.Fatalf("PATCH reorder: status %d body %s", status, raw)
	}
	updated := decodeJSON[domain.AudioPatchOutput](t, raw)
	if len(updated.Chain) != 4 {
		t.Fatalf("updated chain has %d hops, want 4: %+v", len(updated.Chain), updated.Chain)
	}
	if updated.Chain[0].HopKind != "device" || updated.Chain[0].InventoryItemID == nil || *updated.Chain[0].InventoryItemID != speaker1 {
		t.Errorf("hop 0 after reorder = %+v, want speaker1 device hop", updated.Chain[0])
	}
	if updated.Chain[1].HopKind != "route" {
		t.Errorf("hop 1 after reorder = %+v, want route hop", updated.Chain[1])
	}
	for _, hop := range updated.Chain {
		if hop.InventoryItemID != nil && *hop.InventoryItemID == speaker2 {
			t.Errorf("removed hop's device (speaker2) still present: %+v", updated.Chain)
		}
	}

	// Validation: two device FKs set on one hop.
	if status, raw = doJSON(t, http.MethodPost, outputsURL, map[string]any{
		"output_number": 2, "output_type": "foh",
		"chain": []map[string]any{{"hop_kind": "device", "inventory_item_id": speaker1, "output_device_id": 99999}},
	}); status != http.StatusBadRequest {
		t.Errorf("two device FKs on one hop: status %d body %s, want 400", status, raw)
	}

	// Validation: hop_kind outside the enum.
	if status, raw = doJSON(t, http.MethodPost, outputsURL, map[string]any{
		"output_number": 2, "output_type": "foh",
		"chain": []map[string]any{{"hop_kind": "teleport"}},
	}); status != http.StatusBadRequest {
		t.Errorf("invalid hop_kind: status %d body %s, want 400", status, raw)
	}

	// Validation: a route hop's stagebox_id belonging to another event.
	if status, raw = doJSON(t, http.MethodPost, outputsURL, map[string]any{
		"output_number": 2, "output_type": "foh",
		"chain": []map[string]any{{"hop_kind": "route", "stagebox_id": foreignSbID, "stagebox_channel": 1}},
	}); status != http.StatusBadRequest {
		t.Errorf("foreign stagebox_id on route hop: status %d body %s, want 400", status, raw)
	}

	// A rejected update leaves the previously stored chain untouched.
	status, raw = doJSON(t, http.MethodPatch, updateURL, map[string]any{
		"output_number": 1, "output_type": "foh",
		"chain": []map[string]any{{"hop_kind": "device", "inventory_item_id": speaker1, "output_device_id": 99999}},
	})
	if status != http.StatusBadRequest {
		t.Fatalf("PATCH with invalid hop: status %d body %s, want 400", status, raw)
	}
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/audio-patch", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET patch: status %d body %s", status, raw)
	}
	patch := decodeJSON[struct {
		Outputs []domain.AudioPatchOutput `json:"outputs"`
	}](t, raw)
	if len(patch.Outputs) != 1 || len(patch.Outputs[0].Chain) != 4 {
		t.Errorf("chain changed after a rejected update: %+v", patch.Outputs)
	}
}
