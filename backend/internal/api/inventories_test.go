package api

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

// TestInventoriesCreateListGetRenameDelete covers T018's owner-path CRUD:
// create, list-mine, get, rename, and delete (including delete blocked
// while an event still uses the inventory — FR-010).
func TestInventoriesCreateListGetRenameDelete(t *testing.T) {
	server, _ := newTestServer(t)

	status, raw := doJSON(t, http.MethodPost, server.URL+"/inventories", map[string]any{"name": "Backline"})
	if status != http.StatusCreated {
		t.Fatalf("create: status %d body %s", status, raw)
	}
	created := decodeJSON[domain.Inventory](t, raw)
	if created.Name != "Backline" {
		t.Errorf("created inventory: %+v", created)
	}

	status, raw = doJSON(t, http.MethodPost, server.URL+"/inventories", map[string]any{"name": ""})
	if status != http.StatusBadRequest {
		t.Errorf("create with blank name: status %d body %s, want 400", status, raw)
	}

	// list-mine includes both the auto-created starter inventory and this one.
	status, raw = doJSON(t, http.MethodGet, server.URL+"/inventories", nil)
	if status != http.StatusOK {
		t.Fatalf("list mine: status %d body %s", status, raw)
	}
	inventories := decodeJSON[[]domain.Inventory](t, raw)
	found := false
	for _, inv := range inventories {
		if inv.ID == created.ID {
			found = true
		}
	}
	if len(inventories) < 2 || !found {
		t.Errorf("list mine = %+v, want the starter inventory plus the new one", inventories)
	}

	invURL := fmt.Sprintf("%s/inventories/%d", server.URL, created.ID)

	status, raw = doJSON(t, http.MethodGet, invURL, nil)
	if status != http.StatusOK {
		t.Fatalf("get: status %d body %s", status, raw)
	}
	if got := decodeJSON[domain.Inventory](t, raw); got.ID != created.ID {
		t.Errorf("get returned %+v", got)
	}

	status, raw = doJSON(t, http.MethodPatch, invURL, map[string]any{"name": "Backline (renamed)"})
	if status != http.StatusOK {
		t.Fatalf("rename: status %d body %s", status, raw)
	}
	if renamed := decodeJSON[domain.Inventory](t, raw); renamed.Name != "Backline (renamed)" {
		t.Errorf("renamed inventory: %+v", renamed)
	}

	// Bind an event to it, then deletion is blocked.
	status, raw = doJSON(t, http.MethodPost, server.URL+"/events", map[string]any{"name": "Uses Backline", "inventoryId": created.ID})
	if status != http.StatusCreated {
		t.Fatalf("create event on new inventory: status %d body %s", status, raw)
	}
	status, raw = doJSON(t, http.MethodDelete, invURL, nil)
	if status != http.StatusConflict {
		t.Fatalf("delete in-use inventory: status %d body %s, want 409", status, raw)
	}

	// An unused inventory deletes cleanly.
	status, raw = doJSON(t, http.MethodPost, server.URL+"/inventories", map[string]any{"name": "Unused"})
	if status != http.StatusCreated {
		t.Fatalf("create unused inventory: status %d body %s", status, raw)
	}
	unused := decodeJSON[domain.Inventory](t, raw)
	unusedURL := fmt.Sprintf("%s/inventories/%d", server.URL, unused.ID)
	if status, _ := doJSON(t, http.MethodDelete, unusedURL, nil); status != http.StatusNoContent {
		t.Errorf("delete unused inventory: status %d, want 204", status)
	}
	if status, _ := doJSON(t, http.MethodGet, unusedURL, nil); status != http.StatusNotFound {
		t.Errorf("get deleted inventory: status %d, want 404", status)
	}
}

// TestDuplicateInventoryEndpoint covers T039: the duplicate endpoint
// returns a new inventory owned by the caller with matching contents.
func TestDuplicateInventoryEndpoint(t *testing.T) {
	server, database := newTestServer(t)
	inventoryID := testOwnerInventoryID(t, server.URL)
	itemID := seedItem(t, database, "Shure SM58", 4, 150)
	var categoryID int64
	if err := database.QueryRow(`SELECT category_id FROM inventory_items WHERE id = ?`, itemID).Scan(&categoryID); err != nil {
		t.Fatalf("category id: %v", err)
	}

	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/inventories/%d/duplicate", server.URL, inventoryID), nil)
	if status != http.StatusCreated {
		t.Fatalf("duplicate: status %d body %s", status, raw)
	}
	duplicated := decodeJSON[domain.Inventory](t, raw)
	if duplicated.ID == inventoryID {
		t.Fatalf("duplicate returned the same inventory id")
	}

	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/inventories/%d/items", server.URL, duplicated.ID), nil)
	if status != http.StatusOK {
		t.Fatalf("list duplicate items: status %d body %s", status, raw)
	}
	items := decodeJSON[[]domain.InventoryItem](t, raw)
	if len(items) != 1 || items[0].Name != "Shure SM58" || items[0].ID == itemID {
		t.Errorf("duplicate items = %+v, want one distinct Shure SM58 item", items)
	}
}

// TestContributorReadsInventoryButCannotManage covers T042/US3: a
// contributor on an event bound to another user's inventory can read it
// through the event-scoped route (RequireEventAccess, any role), but
// gets 404 on every owner-only /inventories/{id}/... management route
// for that same inventory — being on the event never makes them the
// inventory's owner.
func TestContributorReadsInventoryButCannotManage(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	inventoryID := testOwnerInventoryID(t, server.URL)
	seedItem(t, database, "Shure SM58", 4, 150)

	owner, err := db.UpsertUserByGoogleSub(database, "test-google-sub", "test@example.com", "Test User", "")
	if err != nil {
		t.Fatalf("look up seeded owner: %v", err)
	}
	contributor, err := db.UpsertUserByGoogleSub(database, "contributor-sub", "contributor@example.com", "Contributor", "")
	if err != nil {
		t.Fatalf("seed contributor: %v", err)
	}
	if err := db.UpsertEventMembership(database, eventID, contributor.ID, "contributor", owner.ID); err != nil {
		t.Fatalf("invite contributor: %v", err)
	}
	contributorToken, err := db.CreateSession(database, contributor.ID, time.Hour)
	if err != nil {
		t.Fatalf("create contributor session: %v", err)
	}
	contributorClient := clientForSession(t, server.URL, contributorToken)

	response, err := contributorClient.Get(fmt.Sprintf("%s/events/%d/inventory/items", server.URL, eventID))
	if err != nil {
		t.Fatalf("GET event inventory items: %v", err)
	}
	_ = response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Errorf("contributor reading event-scoped inventory: status %d, want 200", response.StatusCode)
	}

	response, err = contributorClient.Get(fmt.Sprintf("%s/inventories/%d", server.URL, inventoryID))
	if err != nil {
		t.Fatalf("GET inventory: %v", err)
	}
	_ = response.Body.Close()
	if response.StatusCode != http.StatusNotFound {
		t.Errorf("contributor on the owner-only inventory route: status %d, want 404", response.StatusCode)
	}
	response, err = contributorClient.Get(fmt.Sprintf("%s/inventories/%d/items", server.URL, inventoryID))
	if err != nil {
		t.Fatalf("GET inventory items (owner-scoped): %v", err)
	}
	_ = response.Body.Close()
	if response.StatusCode != http.StatusNotFound {
		t.Errorf("contributor on the owner-only items route: status %d, want 404", response.StatusCode)
	}
}

// TestInventoriesNonOwnerAccessDenied covers RequireInventoryOwner's 404
// (not 403) response for every management route on an inventory the
// caller doesn't own, including the read-only ones — this whole resource
// is owner-only with no role gradient (T018/US3).
func TestInventoriesNonOwnerAccessDenied(t *testing.T) {
	server, database := newTestServer(t)
	inventoryID := testOwnerInventoryID(t, server.URL)
	itemID := seedItem(t, database, "Shure SM58", 4, 150)
	var categoryID int64
	if err := database.QueryRow(`SELECT category_id FROM inventory_items WHERE id = ?`, itemID).Scan(&categoryID); err != nil {
		t.Fatalf("category id: %v", err)
	}

	stranger, err := db.UpsertUserByGoogleSub(database, "stranger-sub", "stranger@example.com", "Stranger", "")
	if err != nil {
		t.Fatalf("seed stranger: %v", err)
	}
	strangerToken, err := db.CreateSession(database, stranger.ID, time.Hour)
	if err != nil {
		t.Fatalf("create stranger session: %v", err)
	}
	strangerClient := clientForSession(t, server.URL, strangerToken)

	get := func(url string) int {
		t.Helper()
		response, err := strangerClient.Get(url)
		if err != nil {
			t.Fatalf("GET %s: %v", url, err)
		}
		defer func() { _ = response.Body.Close() }()
		return response.StatusCode
	}

	invURL := fmt.Sprintf("%s/inventories/%d", server.URL, inventoryID)
	routes := []string{
		invURL,
		invURL + "/categories",
		invURL + "/items",
		fmt.Sprintf("%s/items/%d/fixture-modes", invURL, itemID),
	}
	for _, route := range routes {
		if status := get(route); status != http.StatusNotFound {
			t.Errorf("GET %s as non-owner: status %d, want 404", route, status)
		}
	}

	patchRoutes := []string{
		invURL,
		fmt.Sprintf("%s/categories/%d", invURL, categoryID),
	}
	for _, route := range patchRoutes {
		request, err := http.NewRequest(http.MethodPatch, route, jsonBody(t, map[string]any{"name": "Hijacked", "picker_role": "cable"}))
		if err != nil {
			t.Fatalf("build request: %v", err)
		}
		request.Header.Set("Content-Type", "application/json")
		response, err := strangerClient.Do(request)
		if err != nil {
			t.Fatalf("PATCH %s: %v", route, err)
		}
		_ = response.Body.Close()
		if response.StatusCode != http.StatusNotFound {
			t.Errorf("PATCH %s as non-owner: status %d, want 404", route, response.StatusCode)
		}
	}

	deleteRequest, err := http.NewRequest(http.MethodDelete, invURL, nil)
	if err != nil {
		t.Fatalf("build delete request: %v", err)
	}
	deleteResponse, err := strangerClient.Do(deleteRequest)
	if err != nil {
		t.Fatalf("DELETE %s: %v", invURL, err)
	}
	_ = deleteResponse.Body.Close()
	if deleteResponse.StatusCode != http.StatusNotFound {
		t.Errorf("DELETE inventory as non-owner: status %d, want 404", deleteResponse.StatusCode)
	}

	postRequest, err := http.NewRequest(http.MethodPost, invURL+"/duplicate", nil)
	if err != nil {
		t.Fatalf("build duplicate request: %v", err)
	}
	postResponse, err := strangerClient.Do(postRequest)
	if err != nil {
		t.Fatalf("POST duplicate: %v", err)
	}
	_ = postResponse.Body.Close()
	if postResponse.StatusCode != http.StatusNotFound {
		t.Errorf("duplicate as non-owner: status %d, want 404", postResponse.StatusCode)
	}
}
