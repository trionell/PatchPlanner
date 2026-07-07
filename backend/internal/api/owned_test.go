package api

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// TestOwnedItemEndpoints covers the catalog CRUD contract.
func TestOwnedItemEndpoints(t *testing.T) {
	server, _ := newTestServer(t)
	itemsURL := server.URL + "/owned-items"

	// Validation.
	if status, raw := doJSON(t, http.MethodPost, itemsURL, map[string]any{"name": ""}); status != http.StatusBadRequest {
		t.Errorf("empty name: status %d body %s, want 400", status, raw)
	}
	if status, raw := doJSON(t, http.MethodPost, itemsURL, map[string]any{"name": "X", "category_type": "spaceship"}); status != http.StatusBadRequest {
		t.Errorf("bad category: status %d body %s, want 400", status, raw)
	}

	// Create with defaults.
	status, raw := doJSON(t, http.MethodPost, itemsURL, map[string]any{"name": "Gaffatejp"})
	if status != http.StatusCreated {
		t.Fatalf("create: status %d body %s", status, raw)
	}
	item := decodeJSON[domain.OwnedItem](t, raw)
	if item.CategoryType != "misc" || item.QuantityOwned != 1 {
		t.Errorf("defaults: %+v, want misc/1", item)
	}

	// Update.
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", itemsURL, item.ID), map[string]any{"name": "Gaffatejp svart", "category_type": "rigging", "quantity_owned": 10})
	if status != http.StatusOK {
		t.Fatalf("update: status %d body %s", status, raw)
	}
	if updated := decodeJSON[domain.OwnedItem](t, raw); updated.Name != "Gaffatejp svart" || updated.QuantityOwned != 10 {
		t.Errorf("updated: %+v", updated)
	}
	if status, _ = doJSON(t, http.MethodPatch, itemsURL+"/99999", map[string]any{"name": "X"}); status != http.StatusNotFound {
		t.Errorf("update unknown: status %d, want 404", status)
	}

	// List + delete.
	status, raw = doJSON(t, http.MethodGet, itemsURL, nil)
	if status != http.StatusOK {
		t.Fatalf("list: status %d", status)
	}
	if items := decodeJSON[[]domain.OwnedItem](t, raw); len(items) != 1 {
		t.Errorf("list: %d items, want 1", len(items))
	}
	if status, _ = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/%d", itemsURL, item.ID), nil); status != http.StatusNoContent {
		t.Errorf("delete: status %d, want 204", status)
	}
}

// TestEventOwnedEquipmentEndpoints covers the event-line contract.
func TestEventOwnedEquipmentEndpoints(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)

	status, raw := doJSON(t, http.MethodPost, server.URL+"/owned-items", map[string]any{"name": "Egen laptop", "category_type": "misc", "quantity_owned": 1})
	if status != http.StatusCreated {
		t.Fatalf("create owned item: status %d body %s", status, raw)
	}
	item := decodeJSON[domain.OwnedItem](t, raw)
	lineURL := fmt.Sprintf("%s/events/%d/owned-equipment/%d", server.URL, eventID, item.ID)

	// Upsert with over-owned flag.
	status, raw = doJSON(t, http.MethodPut, lineURL, domain.OwnedEquipmentRequest{Quantity: 2, Notes: "FOH + spare"})
	if status != http.StatusOK {
		t.Fatalf("put line: status %d body %s", status, raw)
	}
	line := decodeJSON[domain.EventOwnedEquipment](t, raw)
	if line.Quantity != 2 || !line.IsOverOwned || line.OwnedItemName != "Egen laptop" {
		t.Errorf("line: %+v", line)
	}

	// List.
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/owned-equipment", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("list lines: status %d", status)
	}
	if lines := decodeJSON[[]domain.EventOwnedEquipment](t, raw); len(lines) != 1 {
		t.Errorf("lines: %+v", lines)
	}

	// Errors.
	if status, _ = doJSON(t, http.MethodPut, lineURL, domain.OwnedEquipmentRequest{Quantity: -1}); status != http.StatusBadRequest {
		t.Errorf("negative quantity: status %d, want 400", status)
	}
	if status, _ = doJSON(t, http.MethodPut, fmt.Sprintf("%s/events/99999/owned-equipment/%d", server.URL, item.ID), domain.OwnedEquipmentRequest{Quantity: 1}); status != http.StatusNotFound {
		t.Errorf("unknown event: status %d, want 404", status)
	}
	if status, _ = doJSON(t, http.MethodPut, fmt.Sprintf("%s/events/%d/owned-equipment/99999", server.URL, eventID), domain.OwnedEquipmentRequest{Quantity: 1}); status != http.StatusNotFound {
		t.Errorf("unknown item: status %d, want 404", status)
	}

	// Zero-quantity PUT removes; DELETE idempotent.
	if status, _ = doJSON(t, http.MethodPut, lineURL, domain.OwnedEquipmentRequest{Quantity: 0}); status != http.StatusOK {
		t.Errorf("zero put: status %d, want 200", status)
	}
	if status, _ = doJSON(t, http.MethodDelete, lineURL, nil); status != http.StatusNoContent {
		t.Errorf("delete: status %d, want 204", status)
	}
}
