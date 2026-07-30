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

// TestLoginProvisionsNoInventory is the 2026-07-30 rule: a new user owns no
// catalog until they create or import one, or reach one through a shared event.
// A freshly migrated database has no inventory row at all — migration 049
// removes 038's empty bootstrap row, so there is nothing to adopt either.
func TestLoginProvisionsNoInventory(t *testing.T) {
	database := openTestDB(t)

	var rows int
	if err := database.QueryRow(`SELECT COUNT(*) FROM inventories`).Scan(&rows); err != nil {
		t.Fatalf("count inventories: %v", err)
	}
	if rows != 0 {
		t.Errorf("a freshly migrated database holds %d inventories, want 0", rows)
	}

	user, _ := UpsertUserByGoogleSub(database, "first-sub", "first@example.com", "First", "")
	claimed, err := ClaimInventoriesForOwnedEvents(database, user.ID)
	if err != nil {
		t.Fatalf("claim inventories: %v", err)
	}
	if claimed != 0 {
		t.Errorf("first login claimed %d inventories, want 0", claimed)
	}
	list, err := ListInventoriesForOwner(database, user.ID)
	if err != nil {
		t.Fatalf("list inventories: %v", err)
	}
	if len(list) != 0 {
		t.Errorf("user owns %d inventories after first login, want 0 (%+v)", len(list), list)
	}
}

// TestClaimInventoriesForOwnedEvents is ROADMAP.md D1: the claim is guarded on
// "is there an ownerless inventory my events read?", not on "do I own none". A
// user who already owned one used to return early and leave the legacy catalog
// ownerless forever — every owner-scoped route 404ing for a catalog its own
// events could still reach. A user with no event bound to it gets nothing.
func TestClaimInventoriesForOwnedEvents(t *testing.T) {
	database := openTestDB(t)
	user, _ := UpsertUserByGoogleSub(database, "owner-sub", "owner@example.com", "Owner", "")
	stranger, _ := UpsertUserByGoogleSub(database, "stranger-sub", "stranger@example.com", "Stranger", "")
	if _, err := CreateInventory(database, user.ID, "My own catalog"); err != nil {
		t.Fatalf("create own inventory: %v", err)
	}
	legacy := seedOwnerlessInventory(t, database, "Legacy catalog")
	if _, err := CreateEvent(database, testEvent("Gig"), user.ID, legacy); err != nil {
		t.Fatalf("create event on the legacy catalog: %v", err)
	}

	// The stranger owns no event bound to it, so a login hands them nothing.
	claimed, err := ClaimInventoriesForOwnedEvents(database, stranger.ID)
	if err != nil {
		t.Fatalf("claim inventories for stranger: %v", err)
	}
	if claimed != 0 {
		t.Errorf("stranger claimed %d inventories, want 0", claimed)
	}

	// The owner of the event bound to it adopts it — even though they
	// already own a catalog of their own, which is what D1 tripped over.
	claimed, err = ClaimInventoriesForOwnedEvents(database, user.ID)
	if err != nil {
		t.Fatalf("claim inventories: %v", err)
	}
	if claimed != 1 {
		t.Errorf("claimed %d inventories, want 1", claimed)
	}
	var owner sql.NullInt64
	if err := database.QueryRow(`SELECT owner_user_id FROM inventories WHERE id = ?`, legacy).Scan(&owner); err != nil {
		t.Fatalf("read legacy catalog owner: %v", err)
	}
	if !owner.Valid || owner.Int64 != user.ID {
		t.Errorf("legacy catalog owner = %+v, want the owner of its event (%d)", owner, user.ID)
	}

	// Idempotent: a claimed row is no longer ownerless, so a repeat login
	// claims nothing and creates nothing.
	claimed, err = ClaimInventoriesForOwnedEvents(database, user.ID)
	if err != nil {
		t.Fatalf("claim inventories again: %v", err)
	}
	if claimed != 0 {
		t.Errorf("repeat login claimed %d inventories, want 0 (idempotent)", claimed)
	}
	list, err := ListInventoriesForOwner(database, user.ID)
	if err != nil {
		t.Fatalf("list inventories: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("user owns %d inventories, want 2 (their own plus the adopted legacy one)", len(list))
	}
}

// TestMigration048AdoptsOrphanedCatalog covers the other half of D1: the
// databases that already hold an orphan. The repair claims it for the owner of
// the earliest event bound to it, and leaves an ownerless inventory with no
// owned event alone — 049 removes that one when it is empty, and a login
// claims it if an owned event is ever bound to it.
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

// TestMigration049DropsEmptyBootstrapInventory covers the sweep that follows
// from a login provisioning nothing: 038's empty bootstrap row has no events to
// follow and nothing to claim it, so it goes — but only when it is genuinely
// empty. A category, an item or a bound event makes it real data.
func TestMigration049DropsEmptyBootstrapInventory(t *testing.T) {
	database := openTestDB(t)
	user, _ := UpsertUserByGoogleSub(database, "owner-sub", "owner@example.com", "Owner", "")

	empty := seedOwnerlessInventory(t, database, "Imported catalog")
	withCategory := seedOwnerlessInventory(t, database, "Has a category")
	if _, err := database.Exec(
		`INSERT INTO inventory_categories (name, category_type, inventory_id) VALUES ('Mics', 'audio', ?)`,
		withCategory); err != nil {
		t.Fatalf("seed category: %v", err)
	}
	withEvent := seedOwnerlessInventory(t, database, "Has an event")
	if _, err := CreateEvent(database, testEvent("Gig"), user.ID, withEvent); err != nil {
		t.Fatalf("seed event: %v", err)
	}
	owned, err := CreateInventory(database, user.ID, "Mine, and empty")
	if err != nil {
		t.Fatalf("create owned inventory: %v", err)
	}

	execMigrationFile(t, database, "049_drop_empty_bootstrap_inventory.up.sql")

	for _, tc := range []struct {
		id      int64
		name    string
		survive bool
	}{
		{empty, "the empty ownerless row", false},
		{withCategory, "an ownerless row with a category", true},
		{withEvent, "an ownerless row with a bound event", true},
		{owned.ID, "an owned but empty inventory", true},
	} {
		var count int
		if err := database.QueryRow(`SELECT COUNT(*) FROM inventories WHERE id = ?`, tc.id).Scan(&count); err != nil {
			t.Fatalf("count %s: %v", tc.name, err)
		}
		if survived := count == 1; survived != tc.survive {
			t.Errorf("%s survived = %v, want %v", tc.name, survived, tc.survive)
		}
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
