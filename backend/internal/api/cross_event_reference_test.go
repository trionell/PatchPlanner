package api

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// TestReferenceDataCrossEventIsolation covers T017/US1: renaming/adding/
// deleting a value on one event's vocabulary never changes another
// event's vocabulary for the same (vocabulary, value) pair.
func TestReferenceDataCrossEventIsolation(t *testing.T) {
	server, _ := newTestServer(t)
	eventA := seedEvent(t, server.URL)
	eventB := seedEvent(t, server.URL)
	urlA := fmt.Sprintf("%s/events/%d/reference-data", server.URL, eventA)
	urlB := fmt.Sprintf("%s/events/%d/reference-data", server.URL, eventB)

	// Both events start with the same seeded preamp_connectors set —
	// find a shared value to rename on A only.
	status, raw := doJSON(t, http.MethodGet, urlA, nil)
	if status != http.StatusOK {
		t.Fatalf("get event A data: status %d body %s", status, raw)
	}
	dataA := decodeJSON[domain.ReferenceData](t, raw)
	if len(dataA["preamp_connectors"]) == 0 {
		t.Fatalf("event A has no preamp_connectors values to rename")
	}
	target := dataA["preamp_connectors"][0]

	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/preamp_connectors/values/%d", urlA, target.ID), map[string]any{"label": "Renamed on A"})
	if status != http.StatusOK {
		t.Fatalf("rename on event A: status %d body %s", status, raw)
	}

	// Event B's identical (vocabulary, value) row is untouched.
	status, raw = doJSON(t, http.MethodGet, urlB, nil)
	if status != http.StatusOK {
		t.Fatalf("get event B data: status %d body %s", status, raw)
	}
	dataB := decodeJSON[domain.ReferenceData](t, raw)
	for _, v := range dataB["preamp_connectors"] {
		if v.Value == target.Value && v.Label == "Renamed on A" {
			t.Errorf("event B's value was renamed by event A's edit: %+v", v)
		}
	}

	// Adding a value to event A never appears on event B.
	status, raw = doJSON(t, http.MethodPost, urlA+"/preamp_connectors/values", map[string]any{"value": "only_on_a", "label": "Only on A"})
	if status != http.StatusCreated {
		t.Fatalf("create on event A: status %d body %s", status, raw)
	}
	status, raw = doJSON(t, http.MethodGet, urlB, nil)
	if status != http.StatusOK {
		t.Fatalf("re-get event B data: status %d body %s", status, raw)
	}
	dataB = decodeJSON[domain.ReferenceData](t, raw)
	for _, v := range dataB["preamp_connectors"] {
		if v.Value == "only_on_a" {
			t.Errorf("event A's new value leaked into event B: %+v", v)
		}
	}

	// Deleting a value from event A never removes event B's identical one.
	status, raw = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/preamp_connectors/values/%d", urlA, target.ID), nil)
	if status != http.StatusNoContent {
		t.Fatalf("delete on event A: status %d body %s", status, raw)
	}
	status, raw = doJSON(t, http.MethodGet, urlB, nil)
	if status != http.StatusOK {
		t.Fatalf("final get event B data: status %d body %s", status, raw)
	}
	dataB = decodeJSON[domain.ReferenceData](t, raw)
	found := false
	for _, v := range dataB["preamp_connectors"] {
		if v.Value == target.Value {
			found = true
		}
	}
	if !found {
		t.Errorf("deleting event A's value also removed event B's identical value")
	}
}

// TestReferenceDataDeleteProtectionScopedPerEvent covers T018: a value in
// use by a planning row on one event never blocks deleting the identical
// (vocabulary, value) pair from a different event — including the
// power_connectors/lighting_fixtures join case (research.md R6).
func TestReferenceDataDeleteProtectionScopedPerEvent(t *testing.T) {
	server, database := newTestServer(t)
	eventA := seedEvent(t, server.URL)
	eventB := seedEvent(t, server.URL)
	urlA := fmt.Sprintf("%s/events/%d/reference-data", server.URL, eventA)
	urlB := fmt.Sprintf("%s/events/%d/reference-data", server.URL, eventB)

	// preamp_connectors: direct event_id column.
	status, raw := doJSON(t, http.MethodGet, urlA, nil)
	if status != http.StatusOK {
		t.Fatalf("get event A data: status %d body %s", status, raw)
	}
	dataA := decodeJSON[domain.ReferenceData](t, raw)
	preamp := dataA["preamp_connectors"][0]
	if _, err := database.Exec(`INSERT INTO input_sources (event_id, name, kind, connector_type, width) VALUES (?, 'Test', 'line', ?, 'mono')`, eventA, preamp.Value); err != nil {
		t.Fatalf("insert referencing input source on event A: %v", err)
	}

	status, raw = doJSON(t, http.MethodGet, urlB, nil)
	if status != http.StatusOK {
		t.Fatalf("get event B data: status %d body %s", status, raw)
	}
	dataB := decodeJSON[domain.ReferenceData](t, raw)
	var preampB domain.ReferenceValue
	for _, v := range dataB["preamp_connectors"] {
		if v.Value == preamp.Value {
			preampB = v
		}
	}
	if preampB.ID == 0 {
		t.Fatalf("event B has no matching preamp_connectors value %q", preamp.Value)
	}
	// Event A's in-use value blocks deletion...
	if status, _ := doJSON(t, http.MethodDelete, fmt.Sprintf("%s/preamp_connectors/values/%d", urlA, preamp.ID), nil); status != http.StatusConflict {
		t.Errorf("delete in-use value on event A: status %d, want 409", status)
	}
	// ...but event B's identical value, unused on event B, deletes freely.
	if status, raw := doJSON(t, http.MethodDelete, fmt.Sprintf("%s/preamp_connectors/values/%d", urlB, preampB.ID), nil); status != http.StatusNoContent {
		t.Errorf("delete unused identical value on event B: status %d body %s, want 204", status, raw)
	}

	// power_connectors: needs a join through lighting_rigs to reach
	// event_id (research.md R6) — verify the join is itself scoped
	// correctly, not just present.
	powerA := dataA["power_connectors"][0]
	rigResult, err := database.Exec(`INSERT INTO lighting_rigs (event_id, name) VALUES (?, 'Rig A')`, eventA)
	if err != nil {
		t.Fatalf("insert lighting rig on event A: %v", err)
	}
	rigAID, err := rigResult.LastInsertId()
	if err != nil {
		t.Fatalf("lighting rig last insert id: %v", err)
	}
	if _, err := database.Exec(`INSERT INTO lighting_fixtures (rig_id, custom_name, power_connector_in) VALUES (?, 'Wash', ?)`, rigAID, powerA.Value); err != nil {
		t.Fatalf("insert referencing lighting fixture on event A: %v", err)
	}

	var powerBID int64
	for _, v := range dataB["power_connectors"] {
		if v.Value == powerA.Value {
			powerBID = v.ID
		}
	}
	if powerBID == 0 {
		t.Fatalf("event B has no matching power_connectors value %q", powerA.Value)
	}
	if status, _ := doJSON(t, http.MethodDelete, fmt.Sprintf("%s/power_connectors/values/%d", urlA, powerA.ID), nil); status != http.StatusConflict {
		t.Errorf("delete in-use power_connectors value on event A: status %d, want 409", status)
	}
	if status, raw := doJSON(t, http.MethodDelete, fmt.Sprintf("%s/power_connectors/values/%d", urlB, powerBID), nil); status != http.StatusNoContent {
		t.Errorf("delete unused identical power_connectors value on event B: status %d body %s, want 204", status, raw)
	}
}
