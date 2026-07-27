package api

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// lightingRigOf fetches (and lazily creates) the event's default rig.
func lightingRigOf(t *testing.T, serverURL string, eventID int64) (int64, []domain.LightingFixture) {
	t.Helper()
	status, raw := doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/lighting-rigs", serverURL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET lighting rig: status %d body %s", status, raw)
	}
	response := decodeJSON[struct {
		Rig      domain.LightingRig       `json:"rig"`
		Fixtures []domain.LightingFixture `json:"fixtures"`
	}](t, raw)
	return response.Rig.ID, response.Fixtures
}

// TestFixtureNumberRoundTrip covers the slice-7 console fixture ID field:
// create/PATCH/list round-trips, positivity validation, and old rows
// staying unnumbered.
func TestFixtureNumberRoundTrip(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	rigID, _ := lightingRigOf(t, server.URL, eventID)
	fixturesURL := fmt.Sprintf("%s/events/%d/lighting-rigs/%d/fixtures", server.URL, eventID, rigID)

	// A pre-slice-7-style fixture has no number.
	status, raw := doJSON(t, http.MethodPost, fixturesURL, map[string]any{
		"custom_name": "House blinder", "position_index": 1, "power_connection": "grid",
		"power_connector_in": "schuko", "dmx_universe": 1, "dmx_channel_count": 4,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST fixture: status %d body %s", status, raw)
	}
	plain := decodeJSON[domain.LightingFixture](t, raw)
	if plain.FixtureNumber != nil {
		t.Errorf("unnumbered fixture got fixture_number %v", *plain.FixtureNumber)
	}

	// Numbers round-trip through create and PATCH.
	status, raw = doJSON(t, http.MethodPost, fixturesURL, map[string]any{
		"custom_name": "Wash 1", "fixture_number": 101, "position_index": 2, "power_connection": "grid",
		"power_connector_in": "schuko", "dmx_universe": 1, "dmx_channel_count": 16,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST numbered fixture: status %d body %s", status, raw)
	}
	numbered := decodeJSON[domain.LightingFixture](t, raw)
	if numbered.FixtureNumber == nil || *numbered.FixtureNumber != 101 {
		t.Fatalf("created fixture_number = %v, want 101", numbered.FixtureNumber)
	}
	numbered.FixtureNumber = intPtr(202)
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", fixturesURL, numbered.ID), numbered)
	if status != http.StatusOK {
		t.Fatalf("PATCH fixture: status %d body %s", status, raw)
	}
	if updated := decodeJSON[domain.LightingFixture](t, raw); updated.FixtureNumber == nil || *updated.FixtureNumber != 202 {
		t.Errorf("patched fixture_number = %v, want 202", updated.FixtureNumber)
	}
	_, fixtures := lightingRigOf(t, server.URL, eventID)
	if len(fixtures) != 2 {
		t.Fatalf("rig has %d fixtures, want 2", len(fixtures))
	}

	// Non-positive numbers are rejected.
	for _, bad := range []int{0, -5} {
		if status, raw = doJSON(t, http.MethodPost, fixturesURL, map[string]any{
			"custom_name": "Bad", "fixture_number": bad, "dmx_channel_count": 4,
		}); status != http.StatusBadRequest {
			t.Errorf("fixture_number %d: status %d body %s, want 400", bad, status, raw)
		}
	}
}

func intPtr(v int) *int { return &v }

// TestBulkAddFixtures covers the slice-7 bulk endpoint: batch placement,
// all-or-nothing overflow, and validation.
func TestBulkAddFixtures(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	rigID, _ := lightingRigOf(t, server.URL, eventID)
	modelID := seedItem(t, database, "Wash Beam 300", 12, 90)
	bulkURL := fmt.Sprintf("%s/events/%d/lighting-rigs/%d/fixtures/bulk", server.URL, eventID, rigID)

	// Existing fixture occupying universe 2 addresses 1–16 and position 1.
	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/lighting-rigs/%d/fixtures", server.URL, eventID, rigID), map[string]any{
		"custom_name": "Existing spot", "position_index": 1, "power_connection": "grid",
		"power_connector_in": "schuko", "dmx_universe": 2, "dmx_start_address": 1, "dmx_channel_count": 16,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST existing fixture: status %d body %s", status, raw)
	}

	// Happy path: 8 units, numbered from 101, appended on universe 2.
	status, raw = doJSON(t, http.MethodPost, bulkURL, map[string]any{
		"inventory_item_id": modelID, "quantity": 8, "fixture_number_start": 101,
		"dmx_channel_mode": "Extended", "dmx_channel_count": 16,
		"dmx_universe": 2, "power_connection": "grid", "power_connector_in": "powercon",
	})
	if status != http.StatusOK {
		t.Fatalf("POST bulk: status %d body %s", status, raw)
	}
	fixtures := decodeJSON[[]domain.LightingFixture](t, raw)
	if len(fixtures) != 9 {
		t.Fatalf("rig has %d fixtures after bulk, want 9", len(fixtures))
	}
	batch := fixtures[1:]
	for i, fixture := range batch {
		if fixture.FixtureNumber == nil || *fixture.FixtureNumber != 101+i {
			t.Errorf("unit %d fixture_number = %v, want %d", i, fixture.FixtureNumber, 101+i)
		}
		if fixture.DMXStartAddress == nil || *fixture.DMXStartAddress != 17+i*16 {
			t.Errorf("unit %d dmx_start_address = %v, want %d", i, fixture.DMXStartAddress, 17+i*16)
		}
		if fixture.DMXUniverse != 2 || fixture.DMXChannelMode != "Extended" || fixture.DMXChannelCount != 16 {
			t.Errorf("unit %d shared settings wrong: %+v", i, fixture)
		}
		if fixture.PowerConnectorIn != "powercon" {
			t.Errorf("unit %d power wrong: %+v", i, fixture)
		}
		if fixture.PositionIndex != 2+i {
			t.Errorf("unit %d position_index = %d, want %d", i, fixture.PositionIndex, 2+i)
		}
	}

	// Overflow: universe 2 now ends at 144 (9×16); 24 more × 16 ch = 384 > remaining 368.
	countBefore := len(fixtures)
	status, raw = doJSON(t, http.MethodPost, bulkURL, map[string]any{
		"inventory_item_id": modelID, "quantity": 24, "dmx_channel_count": 16, "dmx_universe": 2,
		"power_connection": "grid", "power_connector_in": "schuko",
	})
	if status != http.StatusConflict {
		t.Fatalf("overflow bulk: status %d body %s, want 409", status, raw)
	}
	if _, after := lightingRigOf(t, server.URL, eventID); len(after) != countBefore {
		t.Errorf("overflow created fixtures: %d → %d (want unchanged)", countBefore, len(after))
	}

	// Validation contract.
	for _, quantity := range []int{0, 101} {
		if status, raw = doJSON(t, http.MethodPost, bulkURL, map[string]any{
			"inventory_item_id": modelID, "quantity": quantity, "dmx_channel_count": 16,
			"power_connection": "grid", "power_connector_in": "schuko",
		}); status != http.StatusBadRequest {
			t.Errorf("quantity %d: status %d body %s, want 400", quantity, status, raw)
		}
	}
	if status, raw = doJSON(t, http.MethodPost, bulkURL, map[string]any{
		"inventory_item_id": 99999, "quantity": 2, "dmx_channel_count": 4,
		"power_connection": "grid", "power_connector_in": "schuko",
	}); status != http.StatusBadRequest {
		t.Errorf("unknown item: status %d body %s, want 400", status, raw)
	}
	badRig := fmt.Sprintf("%s/events/%d/lighting-rigs/99999/fixtures/bulk", server.URL, eventID)
	if status, raw = doJSON(t, http.MethodPost, badRig, map[string]any{
		"inventory_item_id": modelID, "quantity": 2, "dmx_channel_count": 4,
		"power_connection": "grid", "power_connector_in": "schuko",
	}); status != http.StatusNotFound {
		t.Errorf("unknown rig: status %d body %s, want 404", status, raw)
	}

	// Omitted start → units without numbers, on a fresh universe from address 1.
	status, raw = doJSON(t, http.MethodPost, bulkURL, map[string]any{
		"inventory_item_id": modelID, "quantity": 2, "dmx_channel_count": 10, "dmx_universe": 3,
		"power_connection": "grid", "power_connector_in": "schuko",
	})
	if status != http.StatusOK {
		t.Fatalf("bulk without start: status %d body %s", status, raw)
	}
	all := decodeJSON[[]domain.LightingFixture](t, raw)
	tail := all[len(all)-2:]
	for i, fixture := range tail {
		if fixture.FixtureNumber != nil {
			t.Errorf("unnumbered unit %d got fixture_number %v", i, *fixture.FixtureNumber)
		}
		if fixture.DMXStartAddress == nil || *fixture.DMXStartAddress != 1+i*10 {
			t.Errorf("unit %d on fresh universe: address %v, want %d", i, fixture.DMXStartAddress, 1+i*10)
		}
	}
}

// TestUpdateFixtureAddresses covers the endpoint that replaced auto-assign
// (Slice 27): it validates and guarantees, and has no opinion about whether a
// set of addresses is a good one.
//
// The arithmetic that produces the list is deliberately not here — it lives in
// the browser, in lib/dmxPlan.ts, because the DMX map has to exist there anyway
// for the sheet, the strip and the collision prompt (specs/027 research.md R3).
func TestUpdateFixtureAddresses(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	rigID, _ := lightingRigOf(t, server.URL, eventID)
	addressesURL := fmt.Sprintf("%s/events/%d/lighting-rigs/%d/fixtures/addresses", server.URL, eventID, rigID)

	create := func(name string, universe, address, channels int) domain.LightingFixture {
		t.Helper()
		status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/lighting-rigs/%d/fixtures", server.URL, eventID, rigID), map[string]any{
			"custom_name": name, "position_index": 1, "power_connection": "grid",
			"power_connector_in": "schuko", "dmx_universe": universe,
			"dmx_start_address": address, "dmx_channel_count": channels,
		})
		if status != http.StatusCreated {
			t.Fatalf("POST fixture %s: status %d body %s", name, status, raw)
		}
		return decodeJSON[domain.LightingFixture](t, raw)
	}

	first := create("Wash SR", 1, 1, 16)
	second := create("Wash SL", 1, 17, 16)

	// A plan applies, and the whole rig comes back as the other routes return it.
	status, raw := doJSON(t, http.MethodPatch, addressesURL, map[string]any{
		"changes": []map[string]any{
			{"fixture_id": first.ID, "dmx_universe": 1, "dmx_start_address": 33},
			{"fixture_id": second.ID, "dmx_universe": 1, "dmx_start_address": 49},
		},
	})
	if status != http.StatusOK {
		t.Fatalf("PATCH addresses: status %d body %s", status, raw)
	}
	for _, fixture := range decodeJSON[[]domain.LightingFixture](t, raw) {
		want := map[int64]int{first.ID: 33, second.ID: 49}[fixture.ID]
		if fixture.DMXStartAddress == nil || *fixture.DMXStartAddress != want {
			t.Errorf("fixture %d address %v, want %d", fixture.ID, fixture.DMXStartAddress, want)
		}
	}

	// An overlap is a legal thing to save: a rig legitimately passes through a
	// broken state while it is being renumbered (FR-060). The strip reports it;
	// the endpoint does not refuse it.
	status, raw = doJSON(t, http.MethodPatch, addressesURL, map[string]any{
		"changes": []map[string]any{{"fixture_id": second.ID, "dmx_universe": 1, "dmx_start_address": 40}},
	})
	if status != http.StatusOK {
		t.Fatalf("PATCH overlapping address: status %d body %s, want 200", status, raw)
	}

	// Out of range is not.
	for _, address := range []int{0, 513} {
		status, raw = doJSON(t, http.MethodPatch, addressesURL, map[string]any{
			"changes": []map[string]any{{"fixture_id": first.ID, "dmx_universe": 1, "dmx_start_address": address}},
		})
		if status != http.StatusBadRequest {
			t.Errorf("PATCH address %d: status %d body %s, want 400", address, status, raw)
		}
	}

	// A fixture from another event's rig applies nothing at all — including the
	// valid change beside it.
	otherEvent := seedEvent(t, server.URL)
	otherRigID, _ := lightingRigOf(t, server.URL, otherEvent)
	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/lighting-rigs/%d/fixtures", server.URL, otherEvent, otherRigID), map[string]any{
		"custom_name": "Theirs", "position_index": 1, "power_connection": "grid",
		"power_connector_in": "schuko", "dmx_universe": 1, "dmx_start_address": 1, "dmx_channel_count": 8,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST other-rig fixture: status %d body %s", status, raw)
	}
	theirs := decodeJSON[domain.LightingFixture](t, raw)

	status, raw = doJSON(t, http.MethodPatch, addressesURL, map[string]any{
		"changes": []map[string]any{
			{"fixture_id": first.ID, "dmx_universe": 1, "dmx_start_address": 200},
			{"fixture_id": theirs.ID, "dmx_universe": 1, "dmx_start_address": 300},
		},
	})
	if status != http.StatusNotFound {
		t.Fatalf("PATCH with a foreign fixture: status %d body %s, want 404", status, raw)
	}
	_, fixtures := lightingRigOf(t, server.URL, eventID)
	for _, fixture := range fixtures {
		if fixture.ID == first.ID && fixture.DMXStartAddress != nil && *fixture.DMXStartAddress == 200 {
			t.Error("a change beside a rejected one was applied — the batch is not all-or-nothing")
		}
	}
}
