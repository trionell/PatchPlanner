package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

type busPatchResponse struct {
	Groups        []domain.MixerGroup   `json:"groups"`
	DCAs          []domain.MixerDCA     `json:"dcas"`
	InputChannels []domain.InputChannel `json:"input_channels"`
}

func audioPatchOf(t *testing.T, serverURL string, eventID int64) busPatchResponse {
	t.Helper()
	status, raw := doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/audio-patch", serverURL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET audio-patch: status %d body %s", status, raw)
	}
	return decodeJSON[busPatchResponse](t, raw)
}

// TestGroupCRUDAndLR covers the slice-8 group endpoints: the built-in LR
// group, the status matrix, and built-in protection (rename/delete blocked,
// recolor allowed).
func TestGroupCRUDAndLR(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	groupsURL := fmt.Sprintf("%s/events/%d/groups", server.URL, eventID)

	// A fresh event is born with LR.
	patch := audioPatchOf(t, server.URL, eventID)
	if len(patch.Groups) != 1 || patch.Groups[0].Name != "LR" || !patch.Groups[0].IsBuiltin {
		t.Fatalf("fresh event groups = %+v, want built-in LR only", patch.Groups)
	}
	lr := patch.Groups[0]

	// Create with color; both round-trip.
	status, raw := doJSON(t, http.MethodPost, groupsURL, map[string]any{"name": "Trummor", "color": "#ef4444"})
	if status != http.StatusCreated {
		t.Fatalf("POST group: status %d body %s", status, raw)
	}
	group := decodeJSON[domain.MixerGroup](t, raw)
	if group.Name != "Trummor" || group.Color != "#ef4444" || group.IsBuiltin {
		t.Errorf("created group = %+v", group)
	}

	// Duplicate names are rejected case-insensitively, including LR.
	for _, dup := range []string{"Trummor", "trummor", "lr"} {
		if status, raw = doJSON(t, http.MethodPost, groupsURL, map[string]any{"name": dup}); status != http.StatusConflict {
			t.Errorf("duplicate %q: status %d body %s, want 409", dup, status, raw)
		}
	}
	if status, raw = doJSON(t, http.MethodPost, groupsURL, map[string]any{"name": "   "}); status != http.StatusBadRequest {
		t.Errorf("blank name: status %d body %s, want 400", status, raw)
	}
	if status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/99999/groups", server.URL), map[string]any{"name": "Ghost"}); status != http.StatusNotFound {
		t.Errorf("unknown event: status %d body %s, want 404", status, raw)
	}

	// Rename + recolor.
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", groupsURL, group.ID), map[string]any{"name": "Drums", "color": "#3b82f6"})
	if status != http.StatusOK {
		t.Fatalf("PATCH group: status %d body %s", status, raw)
	}
	if renamed := decodeJSON[domain.MixerGroup](t, raw); renamed.Name != "Drums" || renamed.Color != "#3b82f6" {
		t.Errorf("patched group = %+v", renamed)
	}

	// Built-in: rename and delete blocked, recolor allowed.
	if status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", groupsURL, lr.ID), map[string]any{"name": "Mains"}); status != http.StatusBadRequest {
		t.Errorf("rename LR: status %d body %s, want 400", status, raw)
	}
	if status, raw = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/%d", groupsURL, lr.ID), nil); status != http.StatusBadRequest {
		t.Errorf("delete LR: status %d body %s, want 400", status, raw)
	}
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", groupsURL, lr.ID), map[string]any{"name": "LR", "color": "#9ca3af"})
	if status != http.StatusOK {
		t.Fatalf("recolor LR: status %d body %s, want 200", status, raw)
	}
	if recolored := decodeJSON[domain.MixerGroup](t, raw); recolored.Color != "#9ca3af" || !recolored.IsBuiltin {
		t.Errorf("recolored LR = %+v", recolored)
	}

	// Delete + unknown id.
	if status, raw = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/%d", groupsURL, group.ID), nil); status != http.StatusNoContent {
		t.Errorf("delete group: status %d body %s, want 204", status, raw)
	}
	if status, raw = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/%d", groupsURL, group.ID), nil); status != http.StatusNotFound {
		t.Errorf("delete unknown group: status %d body %s, want 404", status, raw)
	}
}

// TestInputGroupAssignments covers the LR default, explicit-empty override,
// wholesale replacement, foreign-event validation, and delete cascade.
func TestInputGroupAssignments(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	inputsURL := fmt.Sprintf("%s/events/%d/input-channels", server.URL, eventID)

	patch := audioPatchOf(t, server.URL, eventID)
	lrID := patch.Groups[0].ID
	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/groups", server.URL, eventID), map[string]any{"name": "Band"})
	if status != http.StatusCreated {
		t.Fatalf("POST group: status %d body %s", status, raw)
	}
	bandID := decodeJSON[domain.MixerGroup](t, raw).ID

	// Omitted group_ids → LR default.
	status, raw = doJSON(t, http.MethodPost, inputsURL, map[string]any{"channel_number": 1})
	if status != http.StatusCreated {
		t.Fatalf("POST input: status %d body %s", status, raw)
	}
	defaulted := decodeJSON[domain.InputChannel](t, raw)
	if len(defaulted.GroupIDs) != 1 || defaulted.GroupIDs[0] != lrID {
		t.Errorf("defaulted group_ids = %v, want [%d]", defaulted.GroupIDs, lrID)
	}

	// Explicit empty array sticks (spec scenario 5).
	status, raw = doJSON(t, http.MethodPost, inputsURL, map[string]any{"channel_number": 2, "group_ids": []int64{}})
	if status != http.StatusCreated {
		t.Fatalf("POST unrouted input: status %d body %s", status, raw)
	}
	if unrouted := decodeJSON[domain.InputChannel](t, raw); len(unrouted.GroupIDs) != 0 {
		t.Errorf("explicit-empty group_ids = %v, want []", unrouted.GroupIDs)
	}

	// PATCH replaces wholesale; duplicates in the payload are deduped.
	defaulted.GroupIDs = []int64{lrID, bandID, bandID}
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", inputsURL, defaulted.ID), defaulted)
	if status != http.StatusOK {
		t.Fatalf("PATCH input groups: status %d body %s", status, raw)
	}
	if updated := decodeJSON[domain.InputChannel](t, raw); len(updated.GroupIDs) != 2 {
		t.Errorf("patched group_ids = %v, want [LR Band]", updated.GroupIDs)
	}
	patch = audioPatchOf(t, server.URL, eventID)
	if len(patch.InputChannels) != 2 || len(patch.InputChannels[0].GroupIDs) != 2 {
		t.Errorf("listed inputs carry %v", patch.InputChannels)
	}

	// A group of another event is rejected.
	otherEvent := seedEvent(t, server.URL)
	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/groups", server.URL, otherEvent), map[string]any{"name": "Foreign"})
	if status != http.StatusCreated {
		t.Fatalf("POST foreign group: status %d body %s", status, raw)
	}
	foreignID := decodeJSON[domain.MixerGroup](t, raw).ID
	defaulted.GroupIDs = []int64{foreignID}
	if status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", inputsURL, defaulted.ID), defaulted); status != http.StatusBadRequest {
		t.Errorf("foreign group id: status %d body %s, want 400", status, raw)
	}

	// Deleting a group clears its assignments; the channel survives.
	if status, raw = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/events/%d/groups/%d", server.URL, eventID, bandID), nil); status != http.StatusNoContent {
		t.Fatalf("delete assigned group: status %d body %s", status, raw)
	}
	patch = audioPatchOf(t, server.URL, eventID)
	if len(patch.InputChannels) != 2 {
		t.Fatalf("channel count changed after group delete: %d", len(patch.InputChannels))
	}
	if got := patch.InputChannels[0].GroupIDs; len(got) != 1 || got[0] != lrID {
		t.Errorf("group_ids after delete = %v, want [%d]", got, lrID)
	}
}

// TestDCACRUDAndAssignments covers the DCA endpoints (no built-in rule),
// multi-DCA membership, and the removal of the legacy dca_groups field.
func TestDCACRUDAndAssignments(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	dcasURL := fmt.Sprintf("%s/events/%d/dcas", server.URL, eventID)
	inputsURL := fmt.Sprintf("%s/events/%d/input-channels", server.URL, eventID)

	status, raw := doJSON(t, http.MethodPost, dcasURL, map[string]any{"name": "Trummor", "color": "#a855f7"})
	if status != http.StatusCreated {
		t.Fatalf("POST dca: status %d body %s", status, raw)
	}
	trummor := decodeJSON[domain.MixerDCA](t, raw)
	if trummor.Color != "#a855f7" {
		t.Errorf("dca color = %q", trummor.Color)
	}
	status, raw = doJSON(t, http.MethodPost, dcasURL, map[string]any{"name": "Keys"})
	if status != http.StatusCreated {
		t.Fatalf("POST second dca: status %d body %s", status, raw)
	}
	keys := decodeJSON[domain.MixerDCA](t, raw)

	if status, raw = doJSON(t, http.MethodPost, dcasURL, map[string]any{"name": "trummor"}); status != http.StatusConflict {
		t.Errorf("duplicate dca: status %d body %s, want 409", status, raw)
	}
	if status, raw = doJSON(t, http.MethodPost, dcasURL, map[string]any{"name": ""}); status != http.StatusBadRequest {
		t.Errorf("empty dca name: status %d body %s, want 400", status, raw)
	}
	if status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/99999/dcas", server.URL), map[string]any{"name": "Ghost"}); status != http.StatusNotFound {
		t.Errorf("unknown event: status %d body %s, want 404", status, raw)
	}

	// Any DCA can be renamed — no built-in protection.
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", dcasURL, trummor.ID), map[string]any{"name": "Drums", "color": ""})
	if status != http.StatusOK {
		t.Fatalf("PATCH dca: status %d body %s", status, raw)
	}
	if renamed := decodeJSON[domain.MixerDCA](t, raw); renamed.Name != "Drums" || renamed.Color != "" {
		t.Errorf("patched dca = %+v (color should clear)", renamed)
	}

	// Multi-DCA membership round-trips; dca_groups is gone from the wire.
	status, raw = doJSON(t, http.MethodPost, inputsURL, map[string]any{"channel_number": 1, "dca_ids": []int64{trummor.ID, keys.ID}})
	if status != http.StatusCreated {
		t.Fatalf("POST input with dcas: status %d body %s", status, raw)
	}
	input := decodeJSON[domain.InputChannel](t, raw)
	if len(input.DCAIDs) != 2 {
		t.Errorf("dca_ids = %v, want two", input.DCAIDs)
	}
	var wire map[string]any
	if err := json.Unmarshal(raw, &wire); err != nil {
		t.Fatalf("unmarshal input: %v", err)
	}
	if _, present := wire["dca_groups"]; present {
		t.Error("response still carries dca_groups")
	}

	// A DCA of another event is rejected.
	otherEvent := seedEvent(t, server.URL)
	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/dcas", server.URL, otherEvent), map[string]any{"name": "Foreign"})
	if status != http.StatusCreated {
		t.Fatalf("POST foreign dca: status %d body %s", status, raw)
	}
	foreign := decodeJSON[domain.MixerDCA](t, raw)
	input.DCAIDs = []int64{foreign.ID}
	if status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", inputsURL, input.ID), input); status != http.StatusBadRequest {
		t.Errorf("foreign dca id: status %d body %s, want 400", status, raw)
	}

	// Delete cascades assignments and 404s on repeat.
	if status, raw = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/%d", dcasURL, trummor.ID), nil); status != http.StatusNoContent {
		t.Fatalf("delete dca: status %d body %s", status, raw)
	}
	if status, raw = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/%d", dcasURL, trummor.ID), nil); status != http.StatusNotFound {
		t.Errorf("delete unknown dca: status %d body %s, want 404", status, raw)
	}
	patch := audioPatchOf(t, server.URL, eventID)
	if got := patch.InputChannels[0].DCAIDs; len(got) != 1 || got[0] != keys.ID {
		t.Errorf("dca_ids after delete = %v, want [%d]", got, keys.ID)
	}
	if len(patch.DCAs) != 1 {
		t.Errorf("event has %d DCAs after delete, want 1", len(patch.DCAs))
	}
}

// TestChannelColors covers the slice-8 color attribute on input and output
// channels plus the seeded palette vocabulary.
func TestChannelColors(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)

	// Input color round-trips and clears.
	inputsURL := fmt.Sprintf("%s/events/%d/input-channels", server.URL, eventID)
	status, raw := doJSON(t, http.MethodPost, inputsURL, map[string]any{"channel_number": 1, "color": "#22c55e"})
	if status != http.StatusCreated {
		t.Fatalf("POST colored input: status %d body %s", status, raw)
	}
	input := decodeJSON[domain.InputChannel](t, raw)
	if input.Color != "#22c55e" {
		t.Errorf("input color = %q, want #22c55e", input.Color)
	}
	input.Color = ""
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", inputsURL, input.ID), input)
	if status != http.StatusOK {
		t.Fatalf("PATCH input: status %d body %s", status, raw)
	}
	if cleared := decodeJSON[domain.InputChannel](t, raw); cleared.Color != "" {
		t.Errorf("input color not cleared: %q", cleared.Color)
	}

	// Output color round-trips.
	outputsURL := fmt.Sprintf("%s/events/%d/audio-outputs", server.URL, eventID)
	status, raw = doJSON(t, http.MethodPost, outputsURL, map[string]any{"output_number": 1, "output_type": "foh", "destination_type": "local", "color": "#3b82f6"})
	if status != http.StatusCreated {
		t.Fatalf("POST colored output: status %d body %s", status, raw)
	}
	output := decodeJSON[domain.AudioPatchOutput](t, raw)
	if output.Color != "#3b82f6" {
		t.Errorf("output color = %q, want #3b82f6", output.Color)
	}

	// The palette ships as a reference vocabulary.
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/reference-data", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET reference-data: status %d body %s", status, raw)
	}
	data := decodeJSON[map[string][]domain.ReferenceValue](t, raw)
	if len(data["channel_colors"]) != 8 {
		t.Errorf("channel_colors has %d values, want 8", len(data["channel_colors"]))
	}
}
