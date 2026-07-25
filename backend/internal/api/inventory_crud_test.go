package api

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

// createCategory adds a category through the API and returns it.
func createCategory(t *testing.T, serverURL string, inventoryID int64, name, categoryType string) domain.InventoryCategory {
	t.Helper()
	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/inventories/%d/categories", serverURL, inventoryID),
		map[string]any{"name": name, "category_type": categoryType})
	if status != http.StatusCreated {
		t.Fatalf("create category %q: status %d body %s", name, status, raw)
	}
	return decodeJSON[domain.InventoryCategory](t, raw)
}

// createItem adds an item through the API and returns it.
func createItem(t *testing.T, serverURL string, inventoryID, categoryID int64, name string) domain.InventoryItem {
	t.Helper()
	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/inventories/%d/items", serverURL, inventoryID),
		map[string]any{"category_id": categoryID, "name": name, "description": "hand entered", "quantity_available": 3, "price_ex_vat": 75})
	if status != http.StatusCreated {
		t.Fatalf("create item %q: status %d body %s", name, status, raw)
	}
	return decodeJSON[domain.InventoryItem](t, raw)
}

// TestInventoryCategoryCRUD covers US2's category half.
func TestInventoryCategoryCRUD(t *testing.T) {
	server, _ := newTestServer(t)
	inventoryID := testOwnerInventoryID(t, server.URL)

	category := createCategory(t, server.URL, inventoryID, "Moving heads", "lighting")
	if category.Name != "Moving heads" || category.CategoryType != "lighting" {
		t.Fatalf("created category = %+v", category)
	}

	// Rename and retype in one partial update.
	status, raw := doJSON(t, http.MethodPatch, fmt.Sprintf("%s/inventories/%d/categories/%d", server.URL, inventoryID, category.ID),
		map[string]any{"name": "Movers", "category_type": "lighting"})
	if status != http.StatusOK {
		t.Fatalf("patch category: status %d body %s", status, raw)
	}
	if updated := decodeJSON[domain.InventoryCategory](t, raw); updated.Name != "Movers" {
		t.Errorf("renamed category = %+v, want name Movers", updated)
	}

	// Names are unique per inventory, case-insensitively, so a category
	// never appears twice in a planning dropdown under two spellings.
	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/inventories/%d/categories", server.URL, inventoryID),
		map[string]any{"name": "movers", "category_type": "lighting"})
	if status != http.StatusConflict {
		t.Errorf("duplicate category status = %d, want 409; body %s", status, raw)
	}

	// Type is a fixed set because planning dropdowns branch on it.
	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/inventories/%d/categories", server.URL, inventoryID),
		map[string]any{"name": "Lasers", "category_type": "lights"})
	if status != http.StatusBadRequest {
		t.Errorf("bad category_type status = %d, want 400; body %s", status, raw)
	}

	status, _ = doJSON(t, http.MethodPost, fmt.Sprintf("%s/inventories/%d/categories", server.URL, inventoryID),
		map[string]any{"name": "   ", "category_type": "audio"})
	if status != http.StatusBadRequest {
		t.Errorf("blank name status = %d, want 400", status)
	}

	status, raw = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/inventories/%d/categories/%d", server.URL, inventoryID, category.ID), nil)
	if status != http.StatusNoContent {
		t.Fatalf("delete empty category: status %d body %s", status, raw)
	}
}

// A category holding items cannot be deleted (FR-019) — otherwise its
// items would be orphaned out of every dropdown.
func TestDeleteCategoryRefusedWhileItHoldsItems(t *testing.T) {
	server, _ := newTestServer(t)
	inventoryID := testOwnerInventoryID(t, server.URL)

	category := createCategory(t, server.URL, inventoryID, "Microphones", "audio")
	createItem(t, server.URL, inventoryID, category.ID, "Shure SM58")

	status, raw := doJSON(t, http.MethodDelete, fmt.Sprintf("%s/inventories/%d/categories/%d", server.URL, inventoryID, category.ID), nil)
	if status != http.StatusConflict {
		t.Fatalf("delete non-empty category status = %d, want 409; body %s", status, raw)
	}
	if !strings.Contains(string(raw), "1 item") {
		t.Errorf("error %s should say how many items block the delete", raw)
	}
}

// TestInventoryItemCRUD covers US2's item half, including the server's
// exclusive ownership of is_manual.
func TestInventoryItemCRUD(t *testing.T) {
	server, _ := newTestServer(t)
	inventoryID := testOwnerInventoryID(t, server.URL)
	category := createCategory(t, server.URL, inventoryID, "Microphones", "audio")

	item := createItem(t, server.URL, inventoryID, category.ID, "Shure SM58")
	if !item.IsManual {
		t.Errorf("hand-created item has is_manual = false; the next import would discontinue it")
	}
	if item.Discontinued {
		t.Errorf("new item created discontinued: %+v", item)
	}

	// A client must not be able to declare an item imported and so hand it
	// to the importer's sweep.
	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/inventories/%d/items", server.URL, inventoryID),
		map[string]any{"category_id": category.ID, "name": "Sneaky", "is_manual": false})
	if status != http.StatusCreated {
		t.Fatalf("create item: status %d body %s", status, raw)
	}
	if sneaky := decodeJSON[domain.InventoryItem](t, raw); !sneaky.IsManual {
		t.Errorf("client-supplied is_manual was honoured; the server must own that flag")
	}

	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/inventories/%d/items/%d", server.URL, inventoryID, item.ID),
		map[string]any{"price_ex_vat": 130, "quantity_available": 20})
	if status != http.StatusOK {
		t.Fatalf("patch item: status %d body %s", status, raw)
	}
	updated := decodeJSON[domain.InventoryItem](t, raw)
	if updated.PriceExVAT != 130 || updated.QuantityAvailable != 20 {
		t.Errorf("patched item = %+v, want price 130 qty 20", updated)
	}
	if updated.Name != "Shure SM58" {
		t.Errorf("partial update clobbered name: %+v", updated)
	}
	if !updated.IsManual {
		t.Errorf("patch cleared is_manual: %+v", updated)
	}

	status, _ = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/inventories/%d/items/%d", server.URL, inventoryID, item.ID),
		map[string]any{"quantity_available": -1})
	if status != http.StatusBadRequest {
		t.Errorf("negative quantity status = %d, want 400", status)
	}

	status, raw = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/inventories/%d/items/%d", server.URL, inventoryID, item.ID), nil)
	if status != http.StatusNoContent {
		t.Fatalf("delete unreferenced item: status %d body %s", status, raw)
	}
}

// FR-018: deleting a planned item is refused with its reference count,
// rather than cascading and destroying planning work.
func TestDeleteItemRefusedWhileReferencedByAPlan(t *testing.T) {
	server, _ := newTestServer(t)
	inventoryID := testOwnerInventoryID(t, server.URL)
	eventID := seedEvent(t, server.URL)
	category := createCategory(t, server.URL, inventoryID, "Microphones", "audio")
	item := createItem(t, server.URL, inventoryID, category.ID, "Shure SM58")

	// Reference it from the event's plan.
	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/input-sources", server.URL, eventID),
		map[string]any{"name": "Kick", "kind": "mic", "mic_item_id": item.ID, "connector_type": "xlr", "width": "mono"})
	if status != http.StatusCreated {
		t.Fatalf("create input source: status %d body %s", status, raw)
	}

	status, raw = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/inventories/%d/items/%d", server.URL, inventoryID, item.ID), nil)
	if status != http.StatusConflict {
		t.Fatalf("delete referenced item status = %d, want 409; body %s", status, raw)
	}
	message := string(raw)
	if !strings.Contains(message, "Shure SM58") || !strings.Contains(message, "1 time") {
		t.Errorf("error %s should name the item and its reference count", message)
	}

	// Still there, and still usable.
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/inventories/%d/items", server.URL, inventoryID), nil)
	if status != http.StatusOK {
		t.Fatalf("list items: status %d", status)
	}
	if items := decodeJSON[[]domain.InventoryItem](t, raw); len(items) != 1 {
		t.Errorf("refused delete changed the catalog: %+v", items)
	}
}

// Manual rental lines count as references too, so removing an item that
// only appears as a manual order line is still blocked.
func TestDeleteItemRefusedWhileOnAManualRentalLine(t *testing.T) {
	server, _ := newTestServer(t)
	inventoryID := testOwnerInventoryID(t, server.URL)
	eventID := seedEvent(t, server.URL)
	category := createCategory(t, server.URL, inventoryID, "Rigging", "rigging")
	item := createItem(t, server.URL, inventoryID, category.ID, "Steel wire 1m")

	status, raw := doJSON(t, http.MethodPut, fmt.Sprintf("%s/events/%d/rentals/manual/%d", server.URL, eventID, item.ID),
		map[string]any{"quantity_audio": 2, "quantity_lighting": 0})
	if status != http.StatusOK {
		t.Fatalf("add manual rental line: status %d body %s", status, raw)
	}

	status, raw = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/inventories/%d/items/%d", server.URL, inventoryID, item.ID), nil)
	if status != http.StatusConflict {
		t.Errorf("delete status = %d, want 409 for an item on a manual rental line; body %s", status, raw)
	}
}

// FR-020 / IDOR: the CRUD routes are owner-only, and a child id from
// another inventory must not resolve through this inventory's URL.
func TestInventoryCRUDRejectsForeignIDsAndNonOwners(t *testing.T) {
	server, database := newTestServer(t)
	inventoryID := testOwnerInventoryID(t, server.URL)

	// A second inventory owned by the same user, never bound to anything.
	status, raw := doJSON(t, http.MethodPost, server.URL+"/inventories", map[string]any{"name": "Other Inventory"})
	if status != http.StatusCreated {
		t.Fatalf("create other inventory: status %d body %s", status, raw)
	}
	otherInventoryID := decodeJSON[domain.Inventory](t, raw).ID

	foreignCategory := createCategory(t, server.URL, otherInventoryID, "Foreign", "audio")
	foreignItem := createItem(t, server.URL, otherInventoryID, foreignCategory.ID, "Foreign Mic")

	// Reaching another inventory's category or item through this
	// inventory's URL must 404, not succeed.
	for _, probe := range []struct {
		name, method, url string
		body              any
	}{
		{"patch foreign category", http.MethodPatch, fmt.Sprintf("%s/inventories/%d/categories/%d", server.URL, inventoryID, foreignCategory.ID), map[string]any{"name": "Hijacked"}},
		{"delete foreign category", http.MethodDelete, fmt.Sprintf("%s/inventories/%d/categories/%d", server.URL, inventoryID, foreignCategory.ID), nil},
		{"patch foreign item", http.MethodPatch, fmt.Sprintf("%s/inventories/%d/items/%d", server.URL, inventoryID, foreignItem.ID), map[string]any{"name": "Hijacked"}},
		{"delete foreign item", http.MethodDelete, fmt.Sprintf("%s/inventories/%d/items/%d", server.URL, inventoryID, foreignItem.ID), nil},
	} {
		status, raw := doJSON(t, probe.method, probe.url, probe.body)
		if status != http.StatusNotFound {
			t.Errorf("%s: status = %d, want 404; body %s", probe.name, status, raw)
		}
	}

	// Creating an item under another inventory's category must not work
	// either — that would smuggle a row into the wrong catalog.
	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/inventories/%d/items", server.URL, inventoryID),
		map[string]any{"category_id": foreignCategory.ID, "name": "Smuggled"})
	if status != http.StatusNotFound {
		t.Errorf("create item in a foreign category: status = %d, want 404; body %s", status, raw)
	}

	// A different user cannot touch any of it. The inventory must be
	// invisible to them (404), not merely forbidden.
	stranger, err := db.UpsertUserByGoogleSub(database, "crud-stranger-sub", "crud-stranger@example.com", "Stranger", "")
	if err != nil {
		t.Fatalf("seed stranger: %v", err)
	}
	strangerToken, err := db.CreateSession(database, stranger.ID, time.Hour)
	if err != nil {
		t.Fatalf("create stranger session: %v", err)
	}
	strangerClient := clientForSession(t, server.URL, strangerToken)

	ownCategory := createCategory(t, server.URL, inventoryID, "Microphones", "audio")
	ownItem := createItem(t, server.URL, inventoryID, ownCategory.ID, "Shure SM58")

	for _, probe := range []struct {
		name, method, url string
		body              any
	}{
		{"create category", http.MethodPost, fmt.Sprintf("%s/inventories/%d/categories", server.URL, inventoryID), map[string]any{"name": "Theirs", "category_type": "audio"}},
		{"create item", http.MethodPost, fmt.Sprintf("%s/inventories/%d/items", server.URL, inventoryID), map[string]any{"category_id": ownCategory.ID, "name": "Theirs"}},
		{"delete category", http.MethodDelete, fmt.Sprintf("%s/inventories/%d/categories/%d", server.URL, inventoryID, ownCategory.ID), nil},
		{"delete item", http.MethodDelete, fmt.Sprintf("%s/inventories/%d/items/%d", server.URL, inventoryID, ownItem.ID), nil},
		{"import", http.MethodPost, fmt.Sprintf("%s/inventories/%d/import-xlsx", server.URL, inventoryID), nil},
	} {
		var body io.Reader
		if probe.body != nil {
			body = jsonBody(t, probe.body)
		}
		request, err := http.NewRequest(probe.method, probe.url, body)
		if err != nil {
			t.Fatalf("build %s request: %v", probe.name, err)
		}
		request.Header.Set("Content-Type", "application/json")
		response, err := strangerClient.Do(request)
		if err != nil {
			t.Fatalf("%s: %v", probe.name, err)
		}
		_ = response.Body.Close()
		if response.StatusCode != http.StatusNotFound {
			t.Errorf("non-owner %s: status = %d, want 404 (the inventory must be invisible)", probe.name, response.StatusCode)
		}
	}
}
