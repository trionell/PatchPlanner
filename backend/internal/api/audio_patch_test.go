package api

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// TestInputChannelCRUD covers the Slice 12 input-channels endpoint: basic
// round-trip of console-strip fields (no source-only fields present at
// all) and width/mixer_behavior enum validation.
func TestInputChannelCRUD(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	channelsURL := fmt.Sprintf("%s/events/%d/input-channels", server.URL, eventID)

	status, raw := doJSON(t, http.MethodPost, channelsURL, map[string]any{
		"channel_number": 1, "channel_name": "Lead Vox", "color": "#ef4444", "notes": "spare windscreen",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST channel: status %d body %s", status, raw)
	}
	created := decodeJSON[domain.InputChannel](t, raw)
	if created.ChannelName != "Lead Vox" || created.Color != "#ef4444" || created.Notes != "spare windscreen" {
		t.Errorf("created channel = %+v", created)
	}
	if created.Width != "mono" || created.MixerBehavior != "stereo_channel" {
		t.Errorf("created channel defaults = %+v, want mono/stereo_channel", created)
	}

	created.ChannelName = "Lead Vocal"
	updateURL := fmt.Sprintf("%s/%d", channelsURL, created.ID)
	status, raw = doJSON(t, http.MethodPatch, updateURL, created)
	if status != http.StatusOK {
		t.Fatalf("PATCH channel: status %d body %s", status, raw)
	}
	if updated := decodeJSON[domain.InputChannel](t, raw); updated.ChannelName != "Lead Vocal" {
		t.Errorf("updated channel name = %q, want Lead Vocal", updated.ChannelName)
	}

	if status, raw = doJSON(t, http.MethodPost, channelsURL, map[string]any{"channel_number": 2, "width": "quad"}); status != http.StatusBadRequest {
		t.Errorf("invalid width: status %d body %s, want 400", status, raw)
	}
	if status, raw = doJSON(t, http.MethodPost, channelsURL, map[string]any{"channel_number": 2, "width": "stereo", "mixer_behavior": "ganged"}); status != http.StatusBadRequest {
		t.Errorf("invalid mixer_behavior: status %d body %s, want 400", status, raw)
	}

	if status, raw = doJSON(t, http.MethodDelete, updateURL, nil); status != http.StatusNoContent {
		t.Errorf("delete channel: status %d body %s, want 204", status, raw)
	}
}

// TestInputChannelIndependentOfSource verifies US2: a Channel's metadata is
// fully manageable with no Source involved, and updating it never touches
// whichever Source ends up feeding it via the cable graph.
func TestInputChannelIndependentOfSource(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	micID := seedRoleItem(t, database, "", "Shure SM58", "", 4, 150)
	channelsURL := fmt.Sprintf("%s/events/%d/input-channels", server.URL, eventID)
	sourcesURL := fmt.Sprintf("%s/events/%d/input-sources", server.URL, eventID)
	cablesURL := fmt.Sprintf("%s/events/%d/input-cables", server.URL, eventID)

	// Channel created and fully configured with no Source anywhere yet.
	status, raw := doJSON(t, http.MethodPost, channelsURL, map[string]any{
		"channel_number": 1, "channel_name": "Lead Vox", "color": "#ef4444", "notes": "note",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST channel: status %d body %s", status, raw)
	}
	channel := decodeJSON[domain.InputChannel](t, raw)

	// Wire a Source to it via the graph.
	status, raw = doJSON(t, http.MethodPost, sourcesURL, map[string]any{
		"name": "Lead Vox Mic", "kind": "mic", "mic_item_id": micID, "connector_type": "xlr", "width": "mono",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST source: status %d body %s", status, raw)
	}
	source := decodeJSON[domain.InputSource](t, raw)
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "source", "from_id": source.ID, "from_port": 0, "to_kind": "channel", "to_id": channel.ID, "to_port": 0,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST cable: status %d body %s", status, raw)
	}

	// Updating the channel's name/color must not alter the Source.
	channel.ChannelName = "Lead Vocal"
	channel.Color = "#3b82f6"
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", channelsURL, channel.ID), channel)
	if status != http.StatusOK {
		t.Fatalf("PATCH channel: status %d body %s", status, raw)
	}

	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/audio-patch", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET audio-patch: status %d body %s", status, raw)
	}
	patch := decodeJSON[busPatchResponse](t, raw)
	if len(patch.InputChannels) != 1 || patch.InputChannels[0].ChannelName != "Lead Vocal" || patch.InputChannels[0].Color != "#3b82f6" {
		t.Errorf("channel not updated: %+v", patch.InputChannels)
	}
}

// TestInputSourceKindValidation verifies US3: mic/line kind-conditional
// field validation, and that switching kind clears the mic-only fields
// server-side.
func TestInputSourceKindValidation(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	micID := seedRoleItem(t, database, "", "Shure SM58", "", 4, 150)
	standID := seedRoleItem(t, database, "stand", "Boom stand", "", 10, 20)
	sourcesURL := fmt.Sprintf("%s/events/%d/input-sources", server.URL, eventID)

	// mic without mic_item_id → 400.
	if status, raw := doJSON(t, http.MethodPost, sourcesURL, map[string]any{
		"name": "Lead Vox", "kind": "mic", "connector_type": "xlr", "width": "mono",
	}); status != http.StatusBadRequest {
		t.Errorf("mic without mic_item_id: status %d body %s, want 400", status, raw)
	}

	// line with mic_item_id set → 400.
	if status, raw := doJSON(t, http.MethodPost, sourcesURL, map[string]any{
		"name": "Bass", "kind": "line", "mic_item_id": micID, "connector_type": "jack_ts", "width": "mono",
	}); status != http.StatusBadRequest {
		t.Errorf("line with mic_item_id: status %d body %s, want 400", status, raw)
	}

	// line with phantom_power true → 400.
	if status, raw := doJSON(t, http.MethodPost, sourcesURL, map[string]any{
		"name": "Bass", "kind": "line", "phantom_power": true, "connector_type": "jack_ts", "width": "mono",
	}); status != http.StatusBadRequest {
		t.Errorf("line with phantom_power: status %d body %s, want 400", status, raw)
	}

	// Valid mic source round-trips.
	status, raw := doJSON(t, http.MethodPost, sourcesURL, map[string]any{
		"name": "Lead Vox", "kind": "mic", "mic_item_id": micID, "stand_item_id": standID, "phantom_power": true, "connector_type": "xlr", "width": "mono",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST mic source: status %d body %s", status, raw)
	}
	created := decodeJSON[domain.InputSource](t, raw)
	if created.MicItemID == nil || *created.MicItemID != micID || created.StandItemID == nil || !created.PhantomPower {
		t.Errorf("created mic source = %+v", created)
	}

	// Valid line source round-trips with no mic fields.
	status, raw = doJSON(t, http.MethodPost, sourcesURL, map[string]any{
		"name": "Bass", "kind": "line", "connector_type": "jack_ts", "width": "mono",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST line source: status %d body %s", status, raw)
	}
	lineSource := decodeJSON[domain.InputSource](t, raw)
	if lineSource.MicItemID != nil || lineSource.StandItemID != nil || lineSource.PhantomPower {
		t.Errorf("line source unexpectedly carries mic fields: %+v", lineSource)
	}

	// Switching an existing mic source to line clears mic/stand/phantom
	// server-side, in the same response.
	created.Kind = "line"
	created.MicItemID = nil
	created.StandItemID = nil
	created.PhantomPower = false
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", sourcesURL, created.ID), created)
	if status != http.StatusOK {
		t.Fatalf("PATCH source to line: status %d body %s", status, raw)
	}
	if switched := decodeJSON[domain.InputSource](t, raw); switched.MicItemID != nil || switched.StandItemID != nil || switched.PhantomPower {
		t.Errorf("switched source still carries mic fields: %+v", switched)
	}

	// connector_type is always required.
	if status, raw := doJSON(t, http.MethodPost, sourcesURL, map[string]any{"name": "No connector", "kind": "line", "width": "mono"}); status != http.StatusBadRequest {
		t.Errorf("missing connector_type: status %d body %s, want 400", status, raw)
	}

	// Dangling mic_item_id/stand_item_id are rejected up front.
	if status, raw := doJSON(t, http.MethodPost, sourcesURL, map[string]any{
		"name": "Ghost mic", "kind": "mic", "mic_item_id": 99999, "connector_type": "xlr", "width": "mono",
	}); status != http.StatusBadRequest {
		t.Errorf("dangling mic_item_id: status %d body %s, want 400", status, raw)
	}
}
