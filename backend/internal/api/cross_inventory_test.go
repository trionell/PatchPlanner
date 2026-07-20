package api

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// TestCrossInventoryValidation covers T028: a representative handler from
// each of audio_patch.go, lighting.go, rental.go, and plot_trusses.go
// rejects a catalog item picked from a different inventory than the
// event's bound one (400), while picking from the correct inventory still
// succeeds.
func TestCrossInventoryValidation(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	ownItemID := seedItem(t, database, "Shure SM58", 4, 150)

	// A second inventory, owned by the same user, with its own item —
	// never bound to this event.
	status, raw := doJSON(t, http.MethodPost, server.URL+"/inventories", map[string]any{"name": "Other Inventory"})
	if status != http.StatusCreated {
		t.Fatalf("create other inventory: status %d body %s", status, raw)
	}
	otherInventoryID := decodeJSON[domain.Inventory](t, raw).ID
	result, err := database.Exec(`INSERT INTO inventory_categories (inventory_id, name, category_type) VALUES (?, 'Foreign', 'audio')`, otherInventoryID)
	if err != nil {
		t.Fatalf("insert foreign category: %v", err)
	}
	foreignCategoryID, _ := result.LastInsertId()
	result, err = database.Exec(`INSERT INTO inventory_items (inventory_id, category_id, name, quantity_available, price_ex_vat) VALUES (?, ?, 'Foreign Mic', 4, 150)`, otherInventoryID, foreignCategoryID)
	if err != nil {
		t.Fatalf("insert foreign item: %v", err)
	}
	foreignItemID, _ := result.LastInsertId()

	// audio_patch.go: input source's mic_item_id.
	sourcesURL := fmt.Sprintf("%s/events/%d/input-sources", server.URL, eventID)
	if status, raw := doJSON(t, http.MethodPost, sourcesURL, map[string]any{
		"name": "Lead Vox", "kind": "mic", "mic_item_id": foreignItemID, "connector_type": "xlr", "width": "mono",
	}); status != http.StatusBadRequest {
		t.Errorf("input source with foreign mic_item_id: status %d body %s, want 400", status, raw)
	}
	if status, raw := doJSON(t, http.MethodPost, sourcesURL, map[string]any{
		"name": "Lead Vox", "kind": "mic", "mic_item_id": ownItemID, "connector_type": "xlr", "width": "mono",
	}); status != http.StatusCreated {
		t.Errorf("input source with own mic_item_id: status %d body %s, want 201", status, raw)
	}

	// lighting.go: fixture's inventory_item_id.
	rigID, _ := lightingRigOf(t, server.URL, eventID)
	fixturesURL := fmt.Sprintf("%s/events/%d/lighting-rigs/%d/fixtures", server.URL, eventID, rigID)
	if status, raw := doJSON(t, http.MethodPost, fixturesURL, map[string]any{
		"inventory_item_id": foreignItemID, "position_index": 1, "power_connection": "grid",
		"power_connector_in": "schuko", "dmx_universe": 1, "dmx_channel_count": 4,
	}); status != http.StatusBadRequest {
		t.Errorf("fixture with foreign inventory_item_id: status %d body %s, want 400", status, raw)
	}
	if status, raw := doJSON(t, http.MethodPost, fixturesURL, map[string]any{
		"inventory_item_id": ownItemID, "position_index": 1, "power_connection": "grid",
		"power_connector_in": "schuko", "dmx_universe": 1, "dmx_channel_count": 4,
	}); status != http.StatusCreated {
		t.Errorf("fixture with own inventory_item_id: status %d body %s, want 201", status, raw)
	}

	// rental.go: manual rental line, keyed on the item itself.
	if status, raw := doJSON(t, http.MethodPut, fmt.Sprintf("%s/events/%d/rentals/manual/%d", server.URL, eventID, foreignItemID), domain.ManualRentalRequest{QuantityAudio: 1}); status != http.StatusNotFound {
		t.Errorf("manual line on foreign item: status %d body %s, want 404", status, raw)
	}
	if status, raw := doJSON(t, http.MethodPut, fmt.Sprintf("%s/events/%d/rentals/manual/%d", server.URL, eventID, ownItemID), domain.ManualRentalRequest{QuantityAudio: 1}); status != http.StatusOK {
		t.Errorf("manual line on own item: status %d body %s, want 200", status, raw)
	}

	// plot_trusses.go: truss piece's inventory_item_id.
	trussesURL := fmt.Sprintf("%s/events/%d/plot-trusses", server.URL, eventID)
	status, raw = doJSON(t, http.MethodPost, trussesURL, map[string]any{"name": "Front truss", "height_cm": 400})
	if status != http.StatusCreated {
		t.Fatalf("create truss: status %d body %s", status, raw)
	}
	trussURL := fmt.Sprintf("%s/%d", trussesURL, decodeJSON[domain.PlotTruss](t, raw).ID)
	if status, raw := doJSON(t, http.MethodPost, trussURL+"/pieces", map[string]any{"inventory_item_id": foreignItemID, "length_cm": 200}); status != http.StatusBadRequest {
		t.Errorf("truss piece with foreign inventory_item_id: status %d body %s, want 400", status, raw)
	}
	if status, raw := doJSON(t, http.MethodPost, trussURL+"/pieces", map[string]any{"inventory_item_id": ownItemID, "length_cm": 200}); status != http.StatusCreated {
		t.Errorf("truss piece with own inventory_item_id: status %d body %s, want 201", status, raw)
	}
}
