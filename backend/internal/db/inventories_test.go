package db

import (
	"database/sql"
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

	// Migration 038 inserts its bootstrap 'Imported catalog' ownerless in
	// every database, including a freshly migrated one, so the first user to
	// log in adopts that rather than getting a created inventory. Either way
	// they end up owning exactly one.
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

// TestEnsureUserHasInventoryAdoptsWhileAlreadyOwning is ROADMAP.md D1: the
// adoption is guarded on "an ownerless inventory exists", not on "this user
// owns none". A user who already owns one used to return early and leave the
// legacy catalog ownerless forever — every owner-scoped route 404ing for a
// catalog its events could still reach.
func TestEnsureUserHasInventoryAdoptsWhileAlreadyOwning(t *testing.T) {
	database := openTestDB(t)
	user, _ := UpsertUserByGoogleSub(database, "owner-sub", "owner@example.com", "Owner", "")
	if _, err := CreateInventory(database, user.ID, "My Inventory"); err != nil {
		t.Fatalf("create own inventory: %v", err)
	}
	if _, err := database.Exec(`INSERT INTO inventories (name) VALUES ('Legacy catalog')`); err != nil {
		t.Fatalf("seed ownerless inventory: %v", err)
	}

	if err := EnsureUserHasInventory(database, user.ID); err != nil {
		t.Fatalf("ensure inventory: %v", err)
	}

	var ownerless int
	if err := database.QueryRow(`SELECT COUNT(*) FROM inventories WHERE owner_user_id IS NULL`).Scan(&ownerless); err != nil {
		t.Fatalf("count ownerless inventories: %v", err)
	}
	if ownerless != 0 {
		t.Errorf("%d inventories still ownerless, want 0 (an ownerless catalog must be adopted)", ownerless)
	}
	var owner sql.NullInt64
	if err := database.QueryRow(`SELECT owner_user_id FROM inventories WHERE name = 'Legacy catalog'`).Scan(&owner); err != nil {
		t.Fatalf("read legacy catalog owner: %v", err)
	}
	if !owner.Valid || owner.Int64 != user.ID {
		t.Errorf("legacy catalog owner = %+v, want the user who logged in (%d)", owner, user.ID)
	}

	// Still idempotent: with nothing left to adopt and one already owned,
	// a repeat login neither claims nor creates anything.
	before, err := ListInventoriesForOwner(database, user.ID)
	if err != nil {
		t.Fatalf("list inventories: %v", err)
	}
	if err := EnsureUserHasInventory(database, user.ID); err != nil {
		t.Fatalf("ensure inventory again: %v", err)
	}
	after, err := ListInventoriesForOwner(database, user.ID)
	if err != nil {
		t.Fatalf("list inventories again: %v", err)
	}
	if len(after) != len(before) {
		t.Errorf("user owns %d inventories after repeat call, want %d (idempotent)", len(after), len(before))
	}
}

// TestMigration048AdoptsOrphanedCatalog covers the other half of D1: the
// databases that already hold an orphan. The repair claims it for the owner of
// the earliest event bound to it, and leaves an ownerless inventory with no
// owned event alone for the fixed login path to pick up.
func TestMigration048AdoptsOrphanedCatalog(t *testing.T) {
	database := openTestDB(t)
	first, _ := UpsertUserByGoogleSub(database, "first-sub", "first@example.com", "First", "")
	second, _ := UpsertUserByGoogleSub(database, "second-sub", "second@example.com", "Second", "")

	orphan := seedOwnerlessInventory(t, database, "Orphaned catalog")
	if _, err := CreateEvent(database, testEvent("Older gig"), second.ID, orphan); err != nil {
		t.Fatalf("create older event: %v", err)
	}
	if _, err := CreateEvent(database, testEvent("Newer gig"), first.ID, orphan); err != nil {
		t.Fatalf("create newer event: %v", err)
	}
	unbound := seedOwnerlessInventory(t, database, "Never used")

	execMigrationFile(t, database, "048_adopt_ownerless_inventory.up.sql")

	var owner sql.NullInt64
	if err := database.QueryRow(`SELECT owner_user_id FROM inventories WHERE id = ?`, orphan).Scan(&owner); err != nil {
		t.Fatalf("read repaired owner: %v", err)
	}
	if !owner.Valid || owner.Int64 != second.ID {
		t.Errorf("repaired owner = %+v, want the owner of the earliest bound event (%d)", owner, second.ID)
	}

	if err := database.QueryRow(`SELECT owner_user_id FROM inventories WHERE id = ?`, unbound).Scan(&owner); err != nil {
		t.Fatalf("read unbound owner: %v", err)
	}
	if owner.Valid {
		t.Errorf("unbound inventory owner = %d, want NULL (no event to derive one from)", owner.Int64)
	}

	// Re-running is a no-op on rows it already repaired.
	execMigrationFile(t, database, "048_adopt_ownerless_inventory.up.sql")
	if err := database.QueryRow(`SELECT owner_user_id FROM inventories WHERE id = ?`, orphan).Scan(&owner); err != nil {
		t.Fatalf("read owner after re-run: %v", err)
	}
	if !owner.Valid || owner.Int64 != second.ID {
		t.Errorf("owner after re-run = %+v, want %d unchanged", owner, second.ID)
	}
}

func seedOwnerlessInventory(t *testing.T, database *sql.DB, name string) int64 {
	t.Helper()
	result, err := database.Exec(`INSERT INTO inventories (name) VALUES (?)`, name)
	if err != nil {
		t.Fatalf("seed ownerless inventory: %v", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		t.Fatalf("seed ownerless inventory id: %v", err)
	}
	return id
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
	if err := SetInventorySource(database, source.ID, []byte("fake xlsx bytes"), "LL.xlsx", domain.SourceFormatLL); err != nil {
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
	// Slice 22 (FR-021): the copy must offer the same exports as the
	// original, which means carrying source_format, not just the blob.
	if duplicate.SourceFormat != domain.SourceFormatLL {
		t.Errorf("duplicate source format = %q, want %q so the copy keeps the LL export", duplicate.SourceFormat, domain.SourceFormatLL)
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

// TestDuplicateInventoryCarriesManualFlag covers the other half of FR-021:
// a hand-entered item must arrive in the copy still marked manual. If the
// flag were dropped, the copy's next import would discontinue it — the
// exact data loss is_manual exists to prevent, resurfacing one duplicate
// later.
func TestDuplicateInventoryCarriesManualFlag(t *testing.T) {
	database := openTestDB(t)
	owner, _ := UpsertUserByGoogleSub(database, "owner-sub", "owner@example.com", "Owner", "")
	source, err := CreateInventory(database, owner.ID, "Original")
	if err != nil {
		t.Fatalf("create source inventory: %v", err)
	}
	categories, items := importFixture()
	if err := UpsertInventory(database, source.ID, categories, items); err != nil {
		t.Fatalf("seed source catalog: %v", err)
	}

	var categoryID int64
	if err := database.QueryRow(`SELECT id FROM inventory_categories WHERE inventory_id = ? LIMIT 1`, source.ID).Scan(&categoryID); err != nil {
		t.Fatalf("find seeded category: %v", err)
	}
	if _, err := database.Exec(
		`INSERT INTO inventory_items (inventory_id, category_id, name, quantity_available, price_ex_vat, is_manual) VALUES (?, ?, 'Hand-entered DI box', 3, 75, 1)`,
		source.ID, categoryID); err != nil {
		t.Fatalf("seed manual item: %v", err)
	}

	duplicate, err := DuplicateInventory(database, source.ID, owner.ID)
	if err != nil {
		t.Fatalf("duplicate inventory: %v", err)
	}

	copies := allItemsByName(t, database, duplicate.ID)
	manual, ok := copies["Hand-entered DI box"]
	if !ok || len(manual) != 1 {
		t.Fatalf("manual item missing from the copy: %+v", copies)
	}
	if !manual[0].IsManual {
		t.Errorf("copied manual item has is_manual = false; the copy's next import would discontinue it")
	}
	if imported := copies["Shure SM58"]; len(imported) == 0 || imported[0].IsManual {
		t.Errorf("copied imported item should stay is_manual = false, got %+v", imported)
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

// The three counts the list view is made of (Slice 32). Seeded by hand
// rather than through the import path, so the numbers in the assertions
// are the numbers in the fixture.
func TestListInventoriesCarriesCounts(t *testing.T) {
	database := openTestDB(t)
	owner, _ := UpsertUserByGoogleSub(database, "owner-sub", "owner@example.com", "Owner", "")
	stranger, _ := UpsertUserByGoogleSub(database, "stranger-sub", "stranger@example.com", "Stranger", "")

	catalog, err := CreateInventory(database, owner.ID, "A catalog")
	if err != nil {
		t.Fatalf("create inventory: %v", err)
	}
	if _, err := CreateInventory(database, owner.ID, "B empty"); err != nil {
		t.Fatalf("create empty inventory: %v", err)
	}
	if _, err := CreateInventory(database, stranger.ID, "C someone else's"); err != nil {
		t.Fatalf("create stranger inventory: %v", err)
	}

	result, err := database.Exec(`INSERT INTO inventory_categories (inventory_id, name, category_type) VALUES (?, 'Mics', 'audio')`, catalog.ID)
	if err != nil {
		t.Fatalf("seed category: %v", err)
	}
	categoryID, _ := result.LastInsertId()
	if _, err := database.Exec(`INSERT INTO inventory_categories (inventory_id, name, category_type) VALUES (?, 'Stands', 'audio')`, catalog.ID); err != nil {
		t.Fatalf("seed second category: %v", err)
	}
	for _, name := range []string{"SM58", "SM57", "Beta 91"} {
		if _, err := database.Exec(`INSERT INTO inventory_items (inventory_id, category_id, name, quantity_available, price_ex_vat) VALUES (?, ?, ?, 1, 10)`, catalog.ID, categoryID, name); err != nil {
			t.Fatalf("seed item %s: %v", name, err)
		}
	}
	for _, name := range []string{"Gig one", "Gig two"} {
		if _, err := CreateEvent(database, testEvent(name), owner.ID, catalog.ID); err != nil {
			t.Fatalf("seed event %s: %v", name, err)
		}
	}

	list, err := ListInventoriesForOwner(database, owner.ID)
	if err != nil {
		t.Fatalf("list inventories: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("list = %+v, want only the owner's two catalogs", list)
	}

	// ORDER BY name ASC: "A catalog" then "B empty".
	if got := list[0]; got.ItemCount != 3 || got.CategoryCount != 2 || got.EventCount != 2 {
		t.Errorf("counts on the seeded catalog = items %d categories %d events %d, want 3/2/2",
			got.ItemCount, got.CategoryCount, got.EventCount)
	}
	if got := list[1]; got.ItemCount != 0 || got.CategoryCount != 0 || got.EventCount != 0 {
		t.Errorf("counts on the empty catalog = items %d categories %d events %d, want zeroes",
			got.ItemCount, got.CategoryCount, got.EventCount)
	}

	// The single-inventory readers stay uncounted: a GET of one catalog has
	// never counted anything and must not start reporting zeroes as facts.
	single, err := GetInventory(database, catalog.ID)
	if err != nil {
		t.Fatalf("get inventory: %v", err)
	}
	if single.ItemCount != 0 || single.CategoryCount != 0 || single.EventCount != 0 {
		t.Errorf("GetInventory returned counts %+v, want all zero", single)
	}
}

// The drawer's "Used on" section: every bound event, oldest first, and the
// same set the count counted.
func TestListEventsForInventory(t *testing.T) {
	database := openTestDB(t)
	owner, _ := UpsertUserByGoogleSub(database, "owner-sub", "owner@example.com", "Owner", "")
	catalog, _ := CreateInventory(database, owner.ID, "Bound")
	other, _ := CreateInventory(database, owner.ID, "Unbound")

	late := testEvent("Later show")
	late.StartDate = "2026-09-18"
	early := testEvent("Earlier show")
	early.StartDate = "2026-02-07"
	undated := testEvent("Undated sketch")
	for _, event := range []domain.Event{late, early, undated} {
		if _, err := CreateEvent(database, event, owner.ID, catalog.ID); err != nil {
			t.Fatalf("seed event %s: %v", event.Name, err)
		}
	}

	events, err := ListEventsForInventory(database, catalog.ID)
	if err != nil {
		t.Fatalf("list events for inventory: %v", err)
	}
	if len(events) != 3 {
		t.Fatalf("events = %+v, want three", events)
	}
	// Undated sorts first under COALESCE(start_date, ''), then chronological.
	want := []string{"Undated sketch", "Earlier show", "Later show"}
	for i, name := range want {
		if events[i].Name != name {
			t.Errorf("events[%d] = %q, want %q (order: %+v)", i, events[i].Name, name, events)
		}
	}

	unbound, err := ListEventsForInventory(database, other.ID)
	if err != nil {
		t.Fatalf("list events for unbound inventory: %v", err)
	}
	if len(unbound) != 0 {
		t.Errorf("unbound catalog returned %+v, want an empty slice", unbound)
	}
}
