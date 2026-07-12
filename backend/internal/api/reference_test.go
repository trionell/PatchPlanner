package api

import (
	"net/http"
	"strconv"
	"strings"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

func itoa(id int64) string { return strconv.FormatInt(id, 10) }

func TestGetReferenceData(t *testing.T) {
	server, _ := newTestServer(t)

	status, raw := doJSON(t, http.MethodGet, server.URL+"/reference-data", nil)
	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", status, raw)
	}
	data := decodeJSON[domain.ReferenceData](t, raw)

	if len(data) != len(domain.Vocabularies) {
		t.Fatalf("expected %d vocabularies, got %d", len(domain.Vocabularies), len(data))
	}
	for _, vocabulary := range domain.Vocabularies {
		values, ok := data[vocabulary]
		if !ok {
			t.Errorf("vocabulary %s missing from response", vocabulary)
			continue
		}
		if len(values) == 0 {
			t.Errorf("vocabulary %s empty — seed missing", vocabulary)
		}
	}
	found := false
	for _, v := range data["power_connectors"] {
		if v.Value == "powercon_true1" && v.Label == "PowerCon TRUE1" {
			found = true
		}
	}
	if !found {
		t.Error("seeded power connector powercon_true1/PowerCon TRUE1 not in response")
	}
}

func TestReferenceValueEndpoints(t *testing.T) {
	server, database := newTestServer(t)
	// preamp_connectors (Slice 12: input_sources.connector_type is its real
	// home now, reference.go's vocabularyUsage) is used here rather than
	// signal_cable_types, which no longer tracks usage at all.
	valuesURL := server.URL + "/reference-data/preamp_connectors/values"

	if status, raw := doJSON(t, http.MethodPost, server.URL+"/reference-data/starships/values", map[string]any{"value": "x", "label": "X"}); status != http.StatusNotFound {
		t.Fatalf("unknown vocabulary: expected 404, got %d: %s", status, raw)
	}
	if status, raw := doJSON(t, http.MethodPost, valuesURL, map[string]any{"value": " ", "label": "X"}); status != http.StatusBadRequest {
		t.Fatalf("blank value: expected 400, got %d: %s", status, raw)
	}

	status, raw := doJSON(t, http.MethodPost, valuesURL, map[string]any{"value": "dmx5", "label": "DMX 5-pin"})
	if status != http.StatusCreated {
		t.Fatalf("create: expected 201, got %d: %s", status, raw)
	}
	created := decodeJSON[domain.ReferenceValue](t, raw)

	if status, raw := doJSON(t, http.MethodPost, valuesURL, map[string]any{"value": "dmx5", "label": "Again"}); status != http.StatusConflict {
		t.Fatalf("duplicate: expected 409, got %d: %s", status, raw)
	}

	status, raw = doJSON(t, http.MethodPatch, valuesURL+"/"+itoa(created.ID), map[string]any{"label": "DMX 5-pin (110 Ω)"})
	if status != http.StatusOK {
		t.Fatalf("rename: expected 200, got %d: %s", status, raw)
	}
	renamed := decodeJSON[domain.ReferenceValue](t, raw)
	if renamed.Label != "DMX 5-pin (110 Ω)" || renamed.Value != "dmx5" {
		t.Errorf("rename must only change the label: %+v", renamed)
	}
	if status, raw := doJSON(t, http.MethodPatch, valuesURL+"/99999", map[string]any{"label": "X"}); status != http.StatusNotFound {
		t.Fatalf("rename unknown id: expected 404, got %d: %s", status, raw)
	}

	// A planning row using the value blocks deletion with 409.
	eventID := seedEvent(t, server.URL)
	if _, err := database.Exec(`INSERT INTO input_sources (event_id, name, kind, connector_type, width) VALUES (?, 'Test', 'line', 'dmx5', 'mono')`, eventID); err != nil {
		t.Fatalf("insert referencing input source: %v", err)
	}
	status, raw = doJSON(t, http.MethodDelete, valuesURL+"/"+itoa(created.ID), nil)
	if status != http.StatusConflict {
		t.Fatalf("delete in-use: expected 409, got %d: %s", status, raw)
	}
	if !strings.Contains(string(raw), "in use") {
		t.Errorf("409 body must name the usage: %s", raw)
	}

	if _, err := database.Exec(`DELETE FROM input_sources WHERE event_id = ?`, eventID); err != nil {
		t.Fatalf("clear referencing input source: %v", err)
	}
	if status, raw := doJSON(t, http.MethodDelete, valuesURL+"/"+itoa(created.ID), nil); status != http.StatusNoContent {
		t.Fatalf("delete unused: expected 204, got %d: %s", status, raw)
	}
	if status, _ := doJSON(t, http.MethodDelete, valuesURL+"/"+itoa(created.ID), nil); status != http.StatusNotFound {
		t.Fatalf("delete twice: expected 404, got %d", status)
	}
}

func TestFixtureModeEndpoints(t *testing.T) {
	server, database := newTestServer(t)
	itemID := seedItem(t, database, "Robe LEDWash 600", 6, 250)
	modesURL := server.URL + "/inventory/items/" + itoa(itemID) + "/fixture-modes"

	if status, raw := doJSON(t, http.MethodGet, server.URL+"/inventory/items/99999/fixture-modes", nil); status != http.StatusNotFound {
		t.Fatalf("unknown item: expected 404, got %d: %s", status, raw)
	}
	if status, raw := doJSON(t, http.MethodPost, modesURL, map[string]any{"name": "Bad", "channel_count": 0}); status != http.StatusBadRequest {
		t.Fatalf("channel_count 0: expected 400, got %d: %s", status, raw)
	}

	status, raw := doJSON(t, http.MethodPost, modesURL, map[string]any{"name": "Extended", "channel_count": 39})
	if status != http.StatusCreated {
		t.Fatalf("create mode: expected 201, got %d: %s", status, raw)
	}
	extended := decodeJSON[domain.FixtureMode](t, raw)

	if status, raw := doJSON(t, http.MethodPost, modesURL, map[string]any{"name": "Extended", "channel_count": 40}); status != http.StatusConflict {
		t.Fatalf("duplicate mode: expected 409, got %d: %s", status, raw)
	}

	status, raw = doJSON(t, http.MethodGet, modesURL, nil)
	if status != http.StatusOK {
		t.Fatalf("list modes: expected 200, got %d: %s", status, raw)
	}
	if modes := decodeJSON[[]domain.FixtureMode](t, raw); len(modes) != 1 || modes[0].Name != "Extended" {
		t.Fatalf("expected [Extended], got %+v", modes)
	}

	status, raw = doJSON(t, http.MethodPatch, server.URL+"/fixture-modes/"+itoa(extended.ID), map[string]any{"name": "Extended", "channel_count": 40})
	if status != http.StatusOK {
		t.Fatalf("update mode: expected 200, got %d: %s", status, raw)
	}
	if updated := decodeJSON[domain.FixtureMode](t, raw); updated.ChannelCount != 40 {
		t.Errorf("expected channel_count 40, got %+v", updated)
	}

	if status, _ := doJSON(t, http.MethodDelete, server.URL+"/fixture-modes/"+itoa(extended.ID), nil); status != http.StatusNoContent {
		t.Fatalf("delete mode: expected 204, got %d", status)
	}
	if status, _ := doJSON(t, http.MethodDelete, server.URL+"/fixture-modes/"+itoa(extended.ID), nil); status != http.StatusNotFound {
		t.Fatalf("delete twice: expected 404, got %d", status)
	}
}
