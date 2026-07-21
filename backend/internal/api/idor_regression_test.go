package api

import (
	"fmt"
	"net/http"
	"testing"
)

type idWrapper struct {
	ID int64 `json:"id"`
}

// assertCrossOwnershipBlocked asserts that both PATCH and DELETE against
// url 404 — used to prove a resource id from one event/inventory can't be
// reached through a URL scoped to a different one, even by a caller who is
// otherwise fully authorized on that other scope.
func assertCrossOwnershipBlocked(t *testing.T, url string) {
	t.Helper()
	if status, raw := doJSON(t, http.MethodPatch, url, nil); status != http.StatusNotFound {
		t.Errorf("PATCH %s: status %d body %s, want 404", url, status, raw)
	}
	if status, raw := doJSON(t, http.MethodDelete, url, nil); status != http.StatusNotFound {
		t.Errorf("DELETE %s: status %d body %s, want 404", url, status, raw)
	}
}

// TestAudioPatchCrossEventIsolation covers the IDOR fix: every audio-patch
// sub-resource mutation route must 404 when the resource id in the URL
// belongs to a different event than the {eventID} path segment, even for a
// caller who is owner of both events (RequireEventAccess only authorizes
// against {eventID}, never against the target row's real event).
func TestAudioPatchCrossEventIsolation(t *testing.T) {
	server, database := newTestServer(t)
	diItem := seedItem(t, database, "DI Box", 10, 40)
	eventA := seedEvent(t, server.URL)
	eventB := seedEvent(t, server.URL)
	baseA := fmt.Sprintf("%s/events/%d", server.URL, eventA)
	baseB := fmt.Sprintf("%s/events/%d", server.URL, eventB)

	// Stagebox
	status, raw := doJSON(t, http.MethodPost, baseA+"/stageboxes", map[string]any{"name": "SB1"})
	if status != http.StatusCreated {
		t.Fatalf("create stagebox: status %d body %s", status, raw)
	}
	sb := decodeJSON[idWrapper](t, raw)
	assertCrossOwnershipBlocked(t, fmt.Sprintf("%s/stageboxes/%d", baseB, sb.ID))

	// Stage multi
	status, raw = doJSON(t, http.MethodPost, baseA+"/stage-multis", map[string]any{"name": "SM1"})
	if status != http.StatusCreated {
		t.Fatalf("create stage multi: status %d body %s", status, raw)
	}
	sm := decodeJSON[idWrapper](t, raw)
	assertCrossOwnershipBlocked(t, fmt.Sprintf("%s/stage-multis/%d", baseB, sm.ID))

	// Input channel
	status, raw = doJSON(t, http.MethodPost, baseA+"/input-channels", map[string]any{"channel_number": 1})
	if status != http.StatusCreated {
		t.Fatalf("create input channel: status %d body %s", status, raw)
	}
	ch := decodeJSON[idWrapper](t, raw)
	assertCrossOwnershipBlocked(t, fmt.Sprintf("%s/input-channels/%d", baseB, ch.ID))

	// Input source
	status, raw = doJSON(t, http.MethodPost, baseA+"/input-sources", map[string]any{
		"name": "Src1", "kind": "line", "connector_type": "xlr",
	})
	if status != http.StatusCreated {
		t.Fatalf("create input source: status %d body %s", status, raw)
	}
	src := decodeJSON[idWrapper](t, raw)
	assertCrossOwnershipBlocked(t, fmt.Sprintf("%s/input-sources/%d", baseB, src.ID))

	// Input device
	status, raw = doJSON(t, http.MethodPost, baseA+"/input-devices", map[string]any{
		"name": "Dev1", "inventory_item_id": diItem, "input_port_count": 1, "input_connector_type": "xlr",
	})
	if status != http.StatusCreated {
		t.Fatalf("create input device: status %d body %s", status, raw)
	}
	dev := decodeJSON[idWrapper](t, raw)
	assertCrossOwnershipBlocked(t, fmt.Sprintf("%s/input-devices/%d", baseB, dev.ID))

	// Input cable (source -> channel)
	status, raw = doJSON(t, http.MethodPost, baseA+"/input-cables", map[string]any{
		"from_kind": "source", "from_id": src.ID, "from_port": 0,
		"to_kind": "channel", "to_id": ch.ID, "to_port": 0,
	})
	if status != http.StatusCreated {
		t.Fatalf("create input cable: status %d body %s", status, raw)
	}
	inCable := decodeJSON[idWrapper](t, raw)
	assertCrossOwnershipBlocked(t, fmt.Sprintf("%s/input-cables/%d", baseB, inCable.ID))

	// Audio output
	status, raw = doJSON(t, http.MethodPost, baseA+"/audio-outputs", map[string]any{"output_number": 1})
	if status != http.StatusCreated {
		t.Fatalf("create audio output: status %d body %s", status, raw)
	}
	out := decodeJSON[idWrapper](t, raw)
	assertCrossOwnershipBlocked(t, fmt.Sprintf("%s/audio-outputs/%d", baseB, out.ID))

	// Output device
	status, raw = doJSON(t, http.MethodPost, baseA+"/output-devices", map[string]any{
		"name": "OutDev1", "inventory_item_id": diItem, "input_port_count": 1, "input_connector_type": "xlr",
	})
	if status != http.StatusCreated {
		t.Fatalf("create output device: status %d body %s", status, raw)
	}
	outDev := decodeJSON[idWrapper](t, raw)
	assertCrossOwnershipBlocked(t, fmt.Sprintf("%s/output-devices/%d", baseB, outDev.ID))

	// Output cable (mixer -> device)
	status, raw = doJSON(t, http.MethodPost, baseA+"/output-cables", map[string]any{
		"from_kind": "mixer", "from_id": out.ID, "from_port": 0,
		"to_kind": "device", "to_id": outDev.ID, "to_port": 0,
	})
	if status != http.StatusCreated {
		t.Fatalf("create output cable: status %d body %s", status, raw)
	}
	outCable := decodeJSON[idWrapper](t, raw)
	assertCrossOwnershipBlocked(t, fmt.Sprintf("%s/output-cables/%d", baseB, outCable.ID))

	// After every rejected cross-event attempt, event A's rows must be
	// completely untouched.
	status, raw = doJSON(t, http.MethodGet, baseA+"/audio-patch", nil)
	if status != http.StatusOK {
		t.Fatalf("get event A audio-patch: status %d body %s", status, raw)
	}
	patch := decodeJSON[audioPatchResponse](t, raw)
	if len(patch.Stageboxes) != 1 || len(patch.StageMultis) != 1 || len(patch.InputChannels) != 1 ||
		len(patch.InputSources) != 1 || len(patch.InputDevices) != 1 || len(patch.InputCables) != 1 ||
		len(patch.Outputs) != 1 || len(patch.OutputDevices) != 1 || len(patch.OutputCables) != 1 {
		t.Errorf("event A patch state changed by rejected cross-event requests: %+v", patch)
	}
}

// TestLightingCrossEventIsolation covers the same IDOR class in the
// lighting-rig routes: a fixture (or rig) id from event A must not be
// reachable through event B's {eventID}/{rigID} path, and event B's own
// rig id must not be usable to create fixtures "into" event A.
func TestLightingCrossEventIsolation(t *testing.T) {
	server, _ := newTestServer(t)
	eventA := seedEvent(t, server.URL)
	eventB := seedEvent(t, server.URL)
	rigA, _ := lightingRigOf(t, server.URL, eventA)
	rigB, _ := lightingRigOf(t, server.URL, eventB)

	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/lighting-rigs/%d/fixtures", server.URL, eventA, rigA), map[string]any{
		"position_index": 1, "power_connection": "grid", "power_connector_in": "schuko",
	})
	if status != http.StatusCreated {
		t.Fatalf("create fixture on event A: status %d body %s", status, raw)
	}
	fixtureA := decodeJSON[idWrapper](t, raw)

	// event B's own rig id, reached via event B's URL, but the fixture id
	// belongs to rig A: must 404.
	assertCrossOwnershipBlocked(t, fmt.Sprintf("%s/events/%d/lighting-rigs/%d/fixtures/%d", server.URL, eventB, rigB, fixtureA.ID))

	// event A's real rig id, reached via event B's {eventID}: must 404 too
	// (rig doesn't belong to event B), regardless of the fixture id.
	assertCrossOwnershipBlocked(t, fmt.Sprintf("%s/events/%d/lighting-rigs/%d/fixtures/%d", server.URL, eventB, rigA, fixtureA.ID))

	// Creating a fixture "into" event A's rig via event B's URL must also
	// be rejected, not just update/delete.
	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/lighting-rigs/%d/fixtures", server.URL, eventB, rigA), map[string]any{
		"position_index": 1, "power_connection": "grid", "power_connector_in": "schuko",
	})
	if status != http.StatusNotFound {
		t.Errorf("create fixture on event A's rig via event B: status %d body %s, want 404", status, raw)
	}

	_, fixturesA := lightingRigOf(t, server.URL, eventA)
	if len(fixturesA) != 1 {
		t.Errorf("event A's fixtures changed by rejected cross-event requests: %+v", fixturesA)
	}
}

// TestFixtureModeCrossInventoryIsolation covers the fixture-modes IDOR fix:
// PATCH/DELETE .../inventories/{inventoryID}/fixture-modes/{modeID} must
// 404 when modeID belongs to an item in a different inventory than
// {inventoryID}, even when the caller owns both inventories.
func TestFixtureModeCrossInventoryIsolation(t *testing.T) {
	server, database := newTestServer(t)
	invA := testOwnerInventoryID(t, server.URL)

	status, raw := doJSON(t, http.MethodPost, server.URL+"/inventories", map[string]any{"name": "Second inventory"})
	if status != http.StatusCreated {
		t.Fatalf("create second inventory: status %d body %s", status, raw)
	}
	invB := decodeJSON[idWrapper](t, raw).ID

	// Inventory items/categories have no create-via-API route (only
	// XLSX import), so seed one directly, mirroring seedItem's pattern.
	result, err := database.Exec(`INSERT INTO inventory_categories (inventory_id, name, category_type) VALUES (?, 'Fixtures', 'lighting')`, invA)
	if err != nil {
		t.Fatalf("insert category on inventory A: %v", err)
	}
	categoryA, _ := result.LastInsertId()
	result, err = database.Exec(`INSERT INTO inventory_items (inventory_id, category_id, name, quantity_available, price_ex_vat) VALUES (?, ?, 'Moving head', 2, 100)`, invA, categoryA)
	if err != nil {
		t.Fatalf("insert item on inventory A: %v", err)
	}
	itemA, _ := result.LastInsertId()

	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/inventories/%d/items/%d/fixture-modes", server.URL, invA, itemA), map[string]any{
		"name": "16-channel", "channel_count": 16,
	})
	if status != http.StatusCreated {
		t.Fatalf("create fixture mode on inventory A: status %d body %s", status, raw)
	}
	modeA := decodeJSON[idWrapper](t, raw).ID

	assertCrossOwnershipBlocked(t, fmt.Sprintf("%s/inventories/%d/fixture-modes/%d", server.URL, invB, modeA))

	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/inventories/%d/items/%d/fixture-modes", server.URL, invA, itemA), nil)
	if status != http.StatusOK {
		t.Fatalf("list fixture modes on inventory A: status %d body %s", status, raw)
	}
	modes := decodeJSON[[]idWrapper](t, raw)
	if len(modes) != 1 || modes[0].ID != modeA {
		t.Errorf("inventory A's fixture mode changed by rejected cross-inventory requests: %+v", modes)
	}
}
