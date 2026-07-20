package api

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// TestEventInventoryEndpoint covers GET /events/{eventId}/inventory (T043):
// any role with event access can see which inventory the event uses (name,
// source filename), even though only its owner can manage it.
func TestEventInventoryEndpoint(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)

	status, raw := doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/inventory", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("get event inventory: status %d body %s", status, raw)
	}
	inventory := decodeJSON[domain.Inventory](t, raw)
	if inventory.ID != testOwnerInventoryID(t, server.URL) {
		t.Errorf("event inventory = %+v, want the event's bound inventory", inventory)
	}

	if status, _ := doJSON(t, http.MethodGet, server.URL+"/events/99999/inventory", nil); status != http.StatusNotFound {
		t.Errorf("unknown event: status %d, want 404", status)
	}
}
