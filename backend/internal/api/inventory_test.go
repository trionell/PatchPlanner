package api

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// TestListItemsRoleFilter covers ?role= on GET /inventories/{id}/items: only
// items whose category carries the picker_role (cable, stand, or mic) are
// returned; unknown roles 400.
func TestListItemsRoleFilter(t *testing.T) {
	server, database := newTestServer(t)
	inventoryID := testOwnerInventoryID(t, server.URL)
	cableID := seedRoleItem(t, database, "cable", "Mikrofonkabel", "4m", 6, 7)
	standID := seedRoleItem(t, database, "stand", "Mikrofonstativ Med bom", "", 16, 20)
	micID := seedRoleItem(t, database, "mic", "Shure SM58", "", 4, 150)
	seedItem(t, database, "Sennheiser e935", 2, 180) // role-less category

	itemsURL := fmt.Sprintf("%s/inventories/%d/items", server.URL, inventoryID)

	status, raw := doJSON(t, http.MethodGet, itemsURL+"?role=cable", nil)
	if status != http.StatusOK {
		t.Fatalf("GET role=cable: status %d body %s", status, raw)
	}
	cables := decodeJSON[[]domain.InventoryItem](t, raw)
	if len(cables) != 1 || cables[0].ID != cableID || cables[0].Description != "4m" {
		t.Errorf("role=cable returned %+v, want only the 4m Mikrofonkabel", cables)
	}

	status, raw = doJSON(t, http.MethodGet, itemsURL+"?role=stand", nil)
	if status != http.StatusOK {
		t.Fatalf("GET role=stand: status %d body %s", status, raw)
	}
	stands := decodeJSON[[]domain.InventoryItem](t, raw)
	if len(stands) != 1 || stands[0].ID != standID {
		t.Errorf("role=stand returned %+v, want only the boom stand", stands)
	}

	status, raw = doJSON(t, http.MethodGet, itemsURL+"?role=mic", nil)
	if status != http.StatusOK {
		t.Fatalf("GET role=mic: status %d body %s", status, raw)
	}
	mics := decodeJSON[[]domain.InventoryItem](t, raw)
	if len(mics) != 1 || mics[0].ID != micID {
		t.Errorf("role=mic returned %+v, want only the Shure SM58", mics)
	}

	if status, raw = doJSON(t, http.MethodGet, itemsURL+"?role=banana", nil); status != http.StatusBadRequest {
		t.Errorf("role=banana: status %d body %s, want 400", status, raw)
	}

	// Discontinued role items leave the picker feed by default.
	if _, err := database.Exec(`UPDATE inventory_items SET discontinued = 1 WHERE id = ?`, cableID); err != nil {
		t.Fatalf("discontinue cable: %v", err)
	}
	status, raw = doJSON(t, http.MethodGet, itemsURL+"?role=cable", nil)
	if status != http.StatusOK {
		t.Fatalf("GET role=cable after discontinue: status %d body %s", status, raw)
	}
	if remaining := decodeJSON[[]domain.InventoryItem](t, raw); len(remaining) != 0 {
		t.Errorf("discontinued cable still offered: %+v", remaining)
	}

	// The category listing exposes the seeded roles.
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/inventories/%d/categories", server.URL, inventoryID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET categories: status %d body %s", status, raw)
	}
	roles := map[string]string{}
	for _, category := range decodeJSON[[]domain.InventoryCategory](t, raw) {
		roles[category.Name] = category.PickerRole
	}
	if roles["cable kategori"] != "cable" || roles["stand kategori"] != "stand" || roles["mic kategori"] != "mic" {
		t.Errorf("category roles = %v, want cable/stand/mic set", roles)
	}
	if roles[fmt.Sprintf("%s kategori", "Sennheiser e935")] != "" {
		t.Errorf("role-less category unexpectedly has a picker role")
	}
}

// TestEventScopedItemsRoleFilter covers ?role= on GET
// /events/{eventID}/inventory/items — the event-scoped route the Audio
// Inputs flow graph actually calls, which validates the role param with
// its own copy of the check in TestListItemsRoleFilter's owner-scoped
// route. Both copies must accept the same roles.
func TestEventScopedItemsRoleFilter(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	micID := seedRoleItem(t, database, "mic", "Shure SM58", "", 4, 150)
	itemsURL := fmt.Sprintf("%s/events/%d/inventory/items", server.URL, eventID)

	status, raw := doJSON(t, http.MethodGet, itemsURL+"?role=mic", nil)
	if status != http.StatusOK {
		t.Fatalf("GET role=mic: status %d body %s", status, raw)
	}
	mics := decodeJSON[[]domain.InventoryItem](t, raw)
	if len(mics) != 1 || mics[0].ID != micID {
		t.Errorf("role=mic returned %+v, want only the Shure SM58", mics)
	}

	if status, raw := doJSON(t, http.MethodGet, itemsURL+"?role=banana", nil); status != http.StatusBadRequest {
		t.Errorf("role=banana: status %d body %s, want 400", status, raw)
	}
}

// TestUpdateCategoryPickerRole covers PATCH /inventories/{id}/categories/{id}.
func TestUpdateCategoryPickerRole(t *testing.T) {
	server, database := newTestServer(t)
	inventoryID := testOwnerInventoryID(t, server.URL)
	itemID := seedItem(t, database, "Mikrofonkabel", 6, 7)
	var categoryID int64
	if err := database.QueryRow(`SELECT category_id FROM inventory_items WHERE id = ?`, itemID).Scan(&categoryID); err != nil {
		t.Fatalf("category id: %v", err)
	}
	url := fmt.Sprintf("%s/inventories/%d/categories/%d", server.URL, inventoryID, categoryID)
	itemsURL := fmt.Sprintf("%s/inventories/%d/items", server.URL, inventoryID)

	// Assign a role: the category's items start feeding the picker.
	status, raw := doJSON(t, http.MethodPatch, url, map[string]any{"picker_role": "cable"})
	if status != http.StatusOK {
		t.Fatalf("PATCH role: status %d body %s", status, raw)
	}
	if category := decodeJSON[domain.InventoryCategory](t, raw); category.PickerRole != "cable" {
		t.Errorf("picker_role=%q, want cable", category.PickerRole)
	}
	status, raw = doJSON(t, http.MethodGet, itemsURL+"?role=cable", nil)
	if status != http.StatusOK {
		t.Fatalf("GET role=cable: status %d body %s", status, raw)
	}
	if items := decodeJSON[[]domain.InventoryItem](t, raw); len(items) != 1 || items[0].ID != itemID {
		t.Errorf("role=cable after PATCH returned %+v, want the seeded item", items)
	}

	// Clear the role: items leave the picker.
	status, raw = doJSON(t, http.MethodPatch, url, map[string]any{"picker_role": nil})
	if status != http.StatusOK {
		t.Fatalf("PATCH clear role: status %d body %s", status, raw)
	}
	if category := decodeJSON[domain.InventoryCategory](t, raw); category.PickerRole != "" {
		t.Errorf("picker_role=%q after clear, want empty", category.PickerRole)
	}

	// Contract errors.
	if status, raw = doJSON(t, http.MethodPatch, url, map[string]any{"picker_role": "banana"}); status != http.StatusBadRequest {
		t.Errorf("invalid role: status %d body %s, want 400", status, raw)
	}
	if status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/inventories/%d/categories/99999", server.URL, inventoryID), map[string]any{"picker_role": "cable"}); status != http.StatusNotFound {
		t.Errorf("unknown category: status %d body %s, want 404", status, raw)
	}
}
