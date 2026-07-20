package db

import (
	"errors"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

func TestInventoryCRUD(t *testing.T) {
	database := openTestDB(t)
	owner, err := UpsertUserByGoogleSub(database, "owner-sub", "owner@example.com", "Owner", "")
	if err != nil {
		t.Fatalf("seed owner: %v", err)
	}

	created, err := CreateInventory(database, owner.ID, "My Inventory")
	if err != nil {
		t.Fatalf("create inventory: %v", err)
	}
	if created.Name != "My Inventory" {
		t.Errorf("created inventory: %+v", created)
	}

	list, err := ListInventoriesForOwner(database, owner.ID)
	if err != nil {
		t.Fatalf("list inventories: %v", err)
	}
	if len(list) != 1 || list[0].ID != created.ID {
		t.Fatalf("list = %+v, want just the created inventory", list)
	}

	renamed, err := RenameInventory(database, created.ID, "Renamed")
	if err != nil {
		t.Fatalf("rename inventory: %v", err)
	}
	if renamed.Name != "Renamed" {
		t.Errorf("renamed inventory: %+v", renamed)
	}

	if err := DeleteInventory(database, created.ID); err != nil {
		t.Fatalf("delete inventory: %v", err)
	}
	if _, err := GetInventory(database, created.ID); err == nil {
		t.Fatal("expected an error getting a deleted inventory")
	}
}

func TestDeleteInventoryBlockedWhileInUse(t *testing.T) {
	database := openTestDB(t)
	owner, _ := UpsertUserByGoogleSub(database, "owner-sub", "owner@example.com", "Owner", "")
	inventory, err := CreateInventory(database, owner.ID, "My Inventory")
	if err != nil {
		t.Fatalf("create inventory: %v", err)
	}
	if _, err := CreateEvent(database, testEvent("Gig"), owner.ID, inventory.ID); err != nil {
		t.Fatalf("create event: %v", err)
	}

	if err := DeleteInventory(database, inventory.ID); !errors.Is(err, ErrInUse) {
		t.Errorf("expected ErrInUse, got %v", err)
	}
}

func TestEnsureUserHasInventory(t *testing.T) {
	database := openTestDB(t)

	// A brand-new database's bootstrap-free state: no ownerless row exists
	// (openTestDB runs every migration from scratch, with no legacy data),
	// so the first user simply gets a fresh empty inventory.
	first, _ := UpsertUserByGoogleSub(database, "first-sub", "first@example.com", "First", "")
	if err := EnsureUserHasInventory(database, first.ID); err != nil {
		t.Fatalf("ensure inventory for first user: %v", err)
	}
	firstList, err := ListInventoriesForOwner(database, first.ID)
	if err != nil {
		t.Fatalf("list first user's inventories: %v", err)
	}
	if len(firstList) != 1 {
		t.Fatalf("first user owns %d inventories, want 1", len(firstList))
	}

	// Calling again is a no-op — no second inventory created.
	if err := EnsureUserHasInventory(database, first.ID); err != nil {
		t.Fatalf("ensure inventory again: %v", err)
	}
	firstListAgain, err := ListInventoriesForOwner(database, first.ID)
	if err != nil {
		t.Fatalf("list first user's inventories again: %v", err)
	}
	if len(firstListAgain) != 1 {
		t.Fatalf("first user owns %d inventories after repeat call, want 1 (idempotent)", len(firstListAgain))
	}

	// A genuinely ownerless inventory (simulating the legacy bootstrap
	// row) is claimed by the next user to call this, instead of getting
	// them a second, redundant fresh one.
	if _, err := database.Exec(`INSERT INTO inventories (name) VALUES ('Legacy catalog')`); err != nil {
		t.Fatalf("seed ownerless inventory: %v", err)
	}
	second, _ := UpsertUserByGoogleSub(database, "second-sub", "second@example.com", "Second", "")
	if err := EnsureUserHasInventory(database, second.ID); err != nil {
		t.Fatalf("ensure inventory for second user: %v", err)
	}
	secondList, err := ListInventoriesForOwner(database, second.ID)
	if err != nil {
		t.Fatalf("list second user's inventories: %v", err)
	}
	if len(secondList) != 1 || secondList[0].Name != "Legacy catalog" {
		t.Fatalf("second user's inventories = %+v, want the claimed legacy catalog", secondList)
	}
}

// TestDuplicateInventory covers US2: duplicating produces a fully
// independent copy — editing an item in either the original or the copy
// never affects the other — and fixture modes carry over under the
// copy's own new item ids.
func TestDuplicateInventory(t *testing.T) {
	database := openTestDB(t)
	owner, _ := UpsertUserByGoogleSub(database, "owner-sub", "owner@example.com", "Owner", "")
	source, err := CreateInventory(database, owner.ID, "Original")
	if err != nil {
		t.Fatalf("create source inventory: %v", err)
	}
	if err := SetInventorySourceXLSX(database, source.ID, []byte("fake xlsx bytes"), "LL.xlsx"); err != nil {
		t.Fatalf("set source template: %v", err)
	}

	categories, items := importFixture()
	if err := UpsertInventory(database, source.ID, categories, items); err != nil {
		t.Fatalf("seed source catalog: %v", err)
	}
	sourceItems := allItemsByName(t, database, source.ID)
	sourceMicID := sourceItems["Shure SM58"][0].ID
	if _, err := CreateFixtureMode(database, sourceMicID, domain.FixtureModeRequest{Name: "Loud", ChannelCount: 1}); err != nil {
		t.Fatalf("create fixture mode on source item: %v", err)
	}

	duplicate, err := DuplicateInventory(database, source.ID, owner.ID)
	if err != nil {
		t.Fatalf("duplicate inventory: %v", err)
	}
	if duplicate.ID == source.ID {
		t.Fatalf("duplicate returned the same inventory id")
	}
	if duplicate.SourceFilename != "LL.xlsx" {
		t.Errorf("duplicate source filename = %q, want LL.xlsx", duplicate.SourceFilename)
	}
	copyXLSX, err := GetInventorySourceXLSX(database, duplicate.ID)
	if err != nil || string(copyXLSX) != "fake xlsx bytes" {
		t.Errorf("duplicate source xlsx = %q, err %v, want the original bytes", copyXLSX, err)
	}

	copyItems := allItemsByName(t, database, duplicate.ID)
	copyMic := copyItems["Shure SM58"][0]
	if copyMic.ID == sourceMicID {
		t.Fatalf("duplicate item shares the source's id")
	}
	if copyMic.PriceExVAT != sourceItems["Shure SM58"][0].PriceExVAT {
		t.Errorf("duplicate item data mismatch: %+v", copyMic)
	}
	copyModes, err := ListFixtureModes(database, copyMic.ID)
	if err != nil {
		t.Fatalf("list duplicate fixture modes: %v", err)
	}
	if len(copyModes) != 1 || copyModes[0].Name != "Loud" {
		t.Fatalf("duplicate fixture modes = %+v, want [Loud] carried over under the new item id", copyModes)
	}

	// Editing the copy never touches the original, and vice versa.
	if _, err := database.Exec(`UPDATE inventory_items SET price_ex_vat = 999 WHERE id = ?`, copyMic.ID); err != nil {
		t.Fatalf("edit copy item: %v", err)
	}
	originalMicAfter, err := GetInventoryItem(database, sourceMicID)
	if err != nil {
		t.Fatalf("get original item after editing copy: %v", err)
	}
	if originalMicAfter.PriceExVAT == 999 {
		t.Errorf("editing the copy changed the original item")
	}
	if _, err := database.Exec(`UPDATE inventory_items SET price_ex_vat = 111 WHERE id = ?`, sourceMicID); err != nil {
		t.Fatalf("edit original item: %v", err)
	}
	copyMicAfter, err := GetInventoryItem(database, copyMic.ID)
	if err != nil {
		t.Fatalf("get copy item after editing original: %v", err)
	}
	if copyMicAfter.PriceExVAT == 111 {
		t.Errorf("editing the original changed the copy")
	}
}

func TestItemBelongsToInventory(t *testing.T) {
	database := openTestDB(t)
	owner, _ := UpsertUserByGoogleSub(database, "owner-sub", "owner@example.com", "Owner", "")
	inventoryA, _ := CreateInventory(database, owner.ID, "A")
	inventoryB, _ := CreateInventory(database, owner.ID, "B")

	result, err := database.Exec(`INSERT INTO inventory_categories (inventory_id, name, category_type) VALUES (?, 'Mics', 'audio')`, inventoryA.ID)
	if err != nil {
		t.Fatalf("seed category: %v", err)
	}
	categoryID, _ := result.LastInsertId()
	itemResult, err := database.Exec(`INSERT INTO inventory_items (inventory_id, category_id, name, quantity_available, price_ex_vat) VALUES (?, ?, 'SM58', 5, 100)`, inventoryA.ID, categoryID)
	if err != nil {
		t.Fatalf("seed item: %v", err)
	}
	itemID, _ := itemResult.LastInsertId()

	if belongs, err := ItemBelongsToInventory(database, itemID, inventoryA.ID); err != nil || !belongs {
		t.Errorf("item in its own inventory: belongs=%v err=%v", belongs, err)
	}
	if belongs, err := ItemBelongsToInventory(database, itemID, inventoryB.ID); err != nil || belongs {
		t.Errorf("item in a different inventory: belongs=%v err=%v, want false", belongs, err)
	}
	if belongs, err := ItemBelongsToInventory(database, 999999, inventoryA.ID); err != nil || belongs {
		t.Errorf("nonexistent item: belongs=%v err=%v, want false", belongs, err)
	}
}
