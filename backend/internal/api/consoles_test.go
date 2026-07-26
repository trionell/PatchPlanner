package api

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// TestConsoleCRUD covers Slice 23 US3 through the real HTTP API: declaring a
// desk, the validation that keeps it describable, and the guard that refuses
// to shrink it out from under a patch.
func TestConsoleCRUD(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	deskItem := seedItem(t, database, "DiGiCo SD10", 1, 9000)

	consolesURL := fmt.Sprintf("%s/events/%d/consoles", server.URL, eventID)
	patchURL := fmt.Sprintf("%s/events/%d/audio-patch", server.URL, eventID)

	// Every event is born with one unnamed desk — the same state migration 042
	// leaves existing events in, so both paths behave identically.
	status, raw := doJSON(t, http.MethodGet, patchURL, nil)
	if status != http.StatusOK {
		t.Fatalf("GET patch: status %d body %s", status, raw)
	}
	seeded := decodeJSON[struct {
		Consoles []domain.Console `json:"consoles"`
	}](t, raw).Consoles
	if len(seeded) != 1 || seeded[0].Name != "" || seeded[0].InputCount != 0 {
		t.Fatalf("seeded consoles = %+v, want one unnamed desk with nothing declared", seeded)
	}

	status, raw = doJSON(t, http.MethodPost, consolesURL, map[string]any{
		"name": "FOH · SD10", "role": "foh", "inventory_item_id": deskItem,
		"input_count": 96, "output_count": 48, "local_input_count": 8, "local_output_count": 8,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST console: status %d body %s", status, raw)
	}
	console := decodeJSON[domain.Console](t, raw)
	if console.Role != "foh" || console.LocalInputCount != 8 {
		t.Errorf("created console = %+v, want role foh with 8 local inputs", console)
	}

	// Validation: an unknown role, both item kinds at once, and a negative
	// count are each refused with a 400 the user can act on.
	for _, tc := range []struct {
		name    string
		payload map[string]any
	}{
		{"unknown role", map[string]any{"name": "X", "role": "playback"}},
		{"both item kinds", map[string]any{"name": "X", "inventory_item_id": deskItem, "owned_item_id": 1}},
		{"negative count", map[string]any{"name": "X", "input_count": -1}},
	} {
		status, raw = doJSON(t, http.MethodPost, consolesURL, tc.payload)
		if status != http.StatusBadRequest {
			t.Errorf("POST console (%s): status %d body %s, want 400", tc.name, status, raw)
		}
	}

	// Patch the desk's canvas position — where the mixer node's own endpoint
	// used to live.
	consoleURL := fmt.Sprintf("%s/%d", consolesURL, console.ID)
	status, raw = doJSON(t, http.MethodPatch, consoleURL, map[string]any{"position_y": 88, "input_position_y": 44})
	if status != http.StatusOK {
		t.Fatalf("PATCH console: status %d body %s", status, raw)
	}
	if updated := decodeJSON[domain.Console](t, raw); updated.PositionY != 88 || updated.InputPositionY != 44 {
		t.Errorf("patched positions = %v/%v, want 88/44", updated.PositionY, updated.InputPositionY)
	}

	// The local jack panel is a second node per graph since Slice 24, with its
	// own placement — and moving it must not move the desk's own node. A created
	// desk starts it inside the processing lane rather than at the origin.
	created := decodeJSON[domain.Console](t, raw)
	if created.LocalPositionX != 260 || created.LocalPositionY != 320 || created.LocalInputPositionX != 260 || created.LocalInputPositionY != 320 {
		t.Errorf("new desk's jack panel at %v/%v and %v/%v, want 260/320 on both canvases",
			created.LocalPositionX, created.LocalPositionY, created.LocalInputPositionX, created.LocalInputPositionY)
	}
	status, raw = doJSON(t, http.MethodPatch, consoleURL, map[string]any{
		"local_position_x": 312, "local_position_y": 448,
		"local_input_position_x": 280, "local_input_position_y": 96,
	})
	if status != http.StatusOK {
		t.Fatalf("PATCH console jack panel: status %d body %s", status, raw)
	}
	moved := decodeJSON[domain.Console](t, raw)
	if moved.LocalPositionX != 312 || moved.LocalPositionY != 448 || moved.LocalInputPositionX != 280 || moved.LocalInputPositionY != 96 {
		t.Errorf("jack panel at %v/%v and %v/%v, want 312/448 and 280/96",
			moved.LocalPositionX, moved.LocalPositionY, moved.LocalInputPositionX, moved.LocalInputPositionY)
	}
	if moved.PositionY != 88 || moved.InputPositionY != 44 {
		t.Errorf("desk's own node moved to %v/%v while dragging the jack panel, want 88/44", moved.PositionY, moved.InputPositionY)
	}

	// A console of another event is a 404, not someone else's row to edit.
	otherEvent := seedEvent(t, server.URL)
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/events/%d/consoles/%d", server.URL, otherEvent, console.ID), map[string]any{"name": "stolen"})
	if status != http.StatusNotFound {
		t.Errorf("PATCH console across events: status %d body %s, want 404", status, raw)
	}
}

// TestConsoleLocalJacksAndGuards covers what the console makes newly possible
// (FR-020: a source reaching a channel with no stagebox in the path) and the
// guard that protects it (FR-024).
func TestConsoleLocalJacksAndGuards(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	micItem := seedItem(t, database, "Shure SM58", 4, 150)
	cableItem := seedItem(t, database, "XLR 10 m", 10, 20)

	consolesURL := fmt.Sprintf("%s/events/%d/consoles", server.URL, eventID)
	sourcesURL := fmt.Sprintf("%s/events/%d/input-sources", server.URL, eventID)
	channelsURL := fmt.Sprintf("%s/events/%d/input-channels", server.URL, eventID)
	cablesURL := fmt.Sprintf("%s/events/%d/input-cables", server.URL, eventID)

	status, raw := doJSON(t, http.MethodPost, consolesURL, map[string]any{
		"name": "FOH · SD10", "role": "foh", "input_count": 96, "local_input_count": 8, "local_output_count": 8,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST console: status %d body %s", status, raw)
	}
	console := decodeJSON[domain.Console](t, raw)

	status, raw = doJSON(t, http.MethodPost, sourcesURL, map[string]any{
		"name": "Talkback", "kind": "mic", "mic_item_id": micItem, "connector_type": "xlr", "width": "mono",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST source: status %d body %s", status, raw)
	}
	source := decodeJSON[domain.InputSource](t, raw)

	status, raw = doJSON(t, http.MethodPost, channelsURL, map[string]any{"channel_number": 15, "channel_name": "Talkback"})
	if status != http.StatusCreated {
		t.Fatalf("POST channel: status %d body %s", status, raw)
	}
	channel := decodeJSON[domain.InputChannel](t, raw)

	// Straight into the desk: a real cable into local in 1, then the desk's own
	// (cableless) hop from that jack to the channel. Impossible before Slice 23.
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "source", "from_id": source.ID, "from_port": 0,
		"to_kind": "console_local", "to_id": console.ID, "to_port": 0,
		"cable_item_id": cableItem,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST cable into local jack: status %d body %s", status, raw)
	}
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "console_local", "from_id": console.ID, "from_port": 0,
		"to_kind": "channel", "to_id": channel.ID, "to_port": 0,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST local jack to channel: status %d body %s", status, raw)
	}
	hop := decodeJSON[domain.InputCable](t, raw)
	if hop.CableItemID != nil {
		t.Error("the local-jack-to-channel hop carries a cable item; it is desk routing, not a cable")
	}

	// A cable item on that hop is refused, exactly as for a stagebox hop.
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "console_local", "from_id": console.ID, "from_port": 1,
		"to_kind": "channel", "to_id": channel.ID, "to_port": 0,
		"cable_item_id": cableItem,
	})
	if status != http.StatusBadRequest {
		t.Errorf("POST cableless hop with an item: status %d body %s, want 400", status, raw)
	}

	// A jack beyond what the desk declares is out of bounds.
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "source", "from_id": source.ID, "from_port": 0,
		"to_kind": "console_local", "to_id": console.ID, "to_port": 8,
		"cable_item_id": cableItem,
	})
	if status != http.StatusBadRequest {
		t.Errorf("POST cable to jack 9 of 8: status %d body %s, want 400", status, raw)
	}

	// Shrinking the desk below what is patched is refused, naming the jack.
	consoleURL := fmt.Sprintf("%s/%d", consolesURL, console.ID)
	status, raw = doJSON(t, http.MethodPatch, consoleURL, map[string]any{"local_input_count": 0})
	if status != http.StatusConflict {
		t.Fatalf("PATCH shrinking a patched desk: status %d body %s, want 409", status, raw)
	}
	if !strings.Contains(string(raw), "local in 1") {
		t.Errorf("409 body %s does not name the conflicting jack", raw)
	}

	// Deleting the desk clears its local-jack cables and leaves the channel.
	status, raw = doJSON(t, http.MethodDelete, consoleURL, nil)
	if status != http.StatusOK {
		t.Fatalf("DELETE console: status %d body %s", status, raw)
	}
	if cleared := decodeJSON[struct {
		ClearedCables int `json:"cleared_cables"`
	}](t, raw).ClearedCables; cleared != 2 {
		t.Errorf("cleared_cables = %d, want 2 (the cable in and the hop out)", cleared)
	}
	var channels, remainingCables int
	if err := database.QueryRow(`SELECT COUNT(*) FROM input_channels WHERE event_id = ?`, eventID).Scan(&channels); err != nil {
		t.Fatalf("count channels: %v", err)
	}
	if err := database.QueryRow(`SELECT COUNT(*) FROM input_cables WHERE event_id = ?`, eventID).Scan(&remainingCables); err != nil {
		t.Fatalf("count cables: %v", err)
	}
	if channels != 1 {
		t.Errorf("channels after deleting the desk = %d, want 1 — deleting a desk must not delete the patch", channels)
	}
	if remainingCables != 0 {
		t.Errorf("cables after deleting the desk = %d, want 0", remainingCables)
	}
	var consoleID *int64
	if err := database.QueryRow(`SELECT console_id FROM input_channels WHERE id = ?`, channel.ID).Scan(&consoleID); err != nil {
		t.Fatalf("read channel console_id: %v", err)
	}
	if consoleID != nil {
		t.Errorf("channel still references the deleted console (%v); it should have nulled out", *consoleID)
	}
}

// TestConsoleLocalOutJack is the output graph's mirror: an output routed into
// one of the desk's own jacks and cabled onward to a recorder, with no
// stagebox involved.
func TestConsoleLocalOutJack(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	cableItem := seedItem(t, database, "XLR 5 m", 10, 15)

	// Fill in the desk the event was born with, rather than adding a second —
	// a new output only inherits a console when the event has exactly one.
	status, raw := doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/audio-patch", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET patch: status %d body %s", status, raw)
	}
	seeded := decodeJSON[struct {
		Consoles []domain.Console `json:"consoles"`
	}](t, raw).Consoles
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/events/%d/consoles/%d", server.URL, eventID, seeded[0].ID), map[string]any{
		"name": "FOH · SD10", "role": "foh", "local_output_count": 8,
	})
	if status != http.StatusOK {
		t.Fatalf("PATCH console: status %d body %s", status, raw)
	}
	console := decodeJSON[domain.Console](t, raw)

	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/audio-outputs", server.URL, eventID), map[string]any{
		"output_number": 9, "output_name": "Aux · rec", "output_type": "aux", "width": "mono",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST output: status %d body %s", status, raw)
	}
	output := decodeJSON[domain.AudioPatchOutput](t, raw)
	if output.ConsoleID == nil || *output.ConsoleID != console.ID {
		t.Errorf("new output console_id = %v, want the event's console %d", output.ConsoleID, console.ID)
	}

	recorderItem := seedItem(t, database, "Tascam DA-3000", 2, 400)
	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/output-devices", server.URL, eventID), map[string]any{
		"name": "Recorder", "inventory_item_id": recorderItem, "input_port_count": 2, "input_connector_type": "xlr",
	})
	if status != http.StatusCreated {
		t.Fatalf("POST output device: status %d body %s", status, raw)
	}
	recorder := decodeJSON[domain.OutputDevice](t, raw)

	cablesURL := fmt.Sprintf("%s/events/%d/output-cables", server.URL, eventID)
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "mixer", "from_id": output.ID, "from_port": 0,
		"to_kind": "console_local", "to_id": console.ID, "to_port": 0,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST output into local jack: status %d body %s", status, raw)
	}
	status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
		"from_kind": "console_local", "from_id": console.ID, "from_port": 0,
		"to_kind": "device", "to_id": recorder.ID, "to_port": 0,
		"cable_item_id": cableItem,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST local jack to recorder: status %d body %s", status, raw)
	}
}
