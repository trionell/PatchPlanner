package api

import (
	"net/http"
	"testing"
	"time"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

func TestReferenceTemplateEndpoints(t *testing.T) {
	server, _ := newTestServer(t)
	valuesURL := server.URL + "/reference-templates/preamp_connectors/values"

	status, raw := doJSON(t, http.MethodGet, server.URL+"/reference-templates", nil)
	if status != http.StatusOK {
		t.Fatalf("get template: status %d body %s", status, raw)
	}
	data := decodeJSON[domain.ReferenceData](t, raw)
	if len(data["preamp_connectors"]) == 0 {
		t.Fatalf("template preamp_connectors empty — seed missing")
	}

	if status, raw := doJSON(t, http.MethodPost, server.URL+"/reference-templates/starships/values", map[string]any{"value": "x", "label": "X"}); status != http.StatusNotFound {
		t.Fatalf("unknown vocabulary: expected 404, got %d: %s", status, raw)
	}
	if status, raw := doJSON(t, http.MethodPost, valuesURL, map[string]any{"value": " ", "label": "X"}); status != http.StatusBadRequest {
		t.Fatalf("blank value: expected 400, got %d: %s", status, raw)
	}

	status, raw = doJSON(t, http.MethodPost, valuesURL, map[string]any{"value": "dmx5", "label": "DMX 5-pin"})
	if status != http.StatusCreated {
		t.Fatalf("create: expected 201, got %d: %s", status, raw)
	}
	created := decodeJSON[domain.ReferenceTemplateValue](t, raw)

	if status, raw := doJSON(t, http.MethodPost, valuesURL, map[string]any{"value": "dmx5", "label": "Again"}); status != http.StatusConflict {
		t.Fatalf("duplicate: expected 409, got %d: %s", status, raw)
	}

	status, raw = doJSON(t, http.MethodPatch, valuesURL+"/"+itoa(created.ID), map[string]any{"label": "DMX 5-pin (110 Ω)"})
	if status != http.StatusOK {
		t.Fatalf("rename: expected 200, got %d: %s", status, raw)
	}
	renamed := decodeJSON[domain.ReferenceTemplateValue](t, raw)
	if renamed.Label != "DMX 5-pin (110 Ω)" || renamed.Value != "dmx5" {
		t.Errorf("rename must only change the label: %+v", renamed)
	}
	if status, raw := doJSON(t, http.MethodPatch, valuesURL+"/99999", map[string]any{"label": "X"}); status != http.StatusNotFound {
		t.Fatalf("rename unknown id: expected 404, got %d: %s", status, raw)
	}

	// Delete always succeeds, no in-use check — a template value is never
	// referenced by any planning row (spec.md FR-009).
	if status, raw := doJSON(t, http.MethodDelete, valuesURL+"/"+itoa(created.ID), nil); status != http.StatusNoContent {
		t.Fatalf("delete: expected 204, got %d: %s", status, raw)
	}
	if status, _ := doJSON(t, http.MethodDelete, valuesURL+"/"+itoa(created.ID), nil); status != http.StatusNotFound {
		t.Fatalf("delete twice: expected 404, got %d", status)
	}
}

// TestReferenceTemplateNotAccessibleByOtherUser covers FR-012: a value
// that doesn't belong to the caller's own template 404s, even though it's
// a real row belonging to someone else.
func TestReferenceTemplateNotAccessibleByOtherUser(t *testing.T) {
	server, database := newTestServer(t)
	valuesURL := server.URL + "/reference-templates/signal_cable_types/values"

	status, raw := doJSON(t, http.MethodPost, valuesURL, map[string]any{"value": "dmx5", "label": "Owner's DMX 5-pin"})
	if status != http.StatusCreated {
		t.Fatalf("create as owner: status %d body %s", status, raw)
	}
	ownerValue := decodeJSON[domain.ReferenceTemplateValue](t, raw)

	stranger, err := db.UpsertUserByGoogleSub(database, "stranger-sub", "stranger@example.com", "Stranger", "")
	if err != nil {
		t.Fatalf("seed stranger: %v", err)
	}
	strangerToken, err := db.CreateSession(database, stranger.ID, time.Hour)
	if err != nil {
		t.Fatalf("create stranger session: %v", err)
	}
	strangerClient := clientForSession(t, server.URL, strangerToken)

	patchRequest, err := http.NewRequest(http.MethodPatch, valuesURL+"/"+itoa(ownerValue.ID), jsonBody(t, map[string]any{"label": "Hijacked"}))
	if err != nil {
		t.Fatalf("build patch request: %v", err)
	}
	patchRequest.Header.Set("Content-Type", "application/json")
	patchResponse, err := strangerClient.Do(patchRequest)
	if err != nil {
		t.Fatalf("PATCH as stranger: %v", err)
	}
	_ = patchResponse.Body.Close()
	if patchResponse.StatusCode != http.StatusNotFound {
		t.Errorf("stranger renamed owner's template value: status %d, want 404", patchResponse.StatusCode)
	}

	deleteRequest, err := http.NewRequest(http.MethodDelete, valuesURL+"/"+itoa(ownerValue.ID), nil)
	if err != nil {
		t.Fatalf("build delete request: %v", err)
	}
	deleteResponse, err := strangerClient.Do(deleteRequest)
	if err != nil {
		t.Fatalf("DELETE as stranger: %v", err)
	}
	_ = deleteResponse.Body.Close()
	if deleteResponse.StatusCode != http.StatusNotFound {
		t.Errorf("stranger deleted owner's template value: status %d, want 404", deleteResponse.StatusCode)
	}
}
