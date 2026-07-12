package db

import (
	"database/sql"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

func importFixture() ([]domain.InventoryCategory, []domain.InventoryItem) {
	categories := []domain.InventoryCategory{
		{Name: "Mikrofoner", CategoryType: "audio"},
		{Name: "Kablar", CategoryType: "audio"},
	}
	items := []domain.InventoryItem{
		{CategoryName: "Mikrofoner", Name: "Shure SM58", QuantityAvailable: 4, PriceExVAT: 150, XLSXRow: 10},
		{CategoryName: "Mikrofoner", Name: "AKG C414", QuantityAvailable: 2, PriceExVAT: 300, XLSXRow: 11},
		{CategoryName: "Kablar", Name: "XLR-kabel", Description: "5 m", QuantityAvailable: 30, PriceExVAT: 10, XLSXRow: 20},
		{CategoryName: "Kablar", Name: "XLR-kabel", Description: "10 m", QuantityAvailable: 20, PriceExVAT: 15, XLSXRow: 21},
	}
	return categories, items
}

func allItemsByName(t *testing.T, database *sql.DB) map[string][]domain.InventoryItem {
	t.Helper()
	items, err := ListInventoryItems(database, nil, "", "", true)
	if err != nil {
		t.Fatalf("list inventory items: %v", err)
	}
	byName := make(map[string][]domain.InventoryItem)
	for _, item := range items {
		byName[item.Name] = append(byName[item.Name], item)
	}
	return byName
}

// TestUpsertInventoryPreservesIdentity verifies FR-007/FR-008: re-import
// updates matched items in place, flags missing items discontinued instead of
// deleting, and revives them when they reappear.
func TestUpsertInventoryPreservesIdentity(t *testing.T) {
	database := openTestDB(t)
	categories, items := importFixture()
	if err := UpsertInventory(database, categories, items); err != nil {
		t.Fatalf("initial import: %v", err)
	}
	before := allItemsByName(t, database)
	micID := before["Shure SM58"][0].ID
	akgID := before["AKG C414"][0].ID

	// A plan references the mic; the reference must survive re-imports.
	eventID := createTestEvent(t, database)
	createMicSource(t, database, eventID, &micID)

	// Second import: price/stock changed, AKG dropped, one new item.
	updated := []domain.InventoryItem{
		{CategoryName: "Mikrofoner", Name: "Shure SM58", QuantityAvailable: 6, PriceExVAT: 175, XLSXRow: 10},
		{CategoryName: "Kablar", Name: "XLR-kabel", Description: "5 m", QuantityAvailable: 30, PriceExVAT: 10, XLSXRow: 20},
		{CategoryName: "Kablar", Name: "XLR-kabel", Description: "10 m", QuantityAvailable: 20, PriceExVAT: 15, XLSXRow: 21},
		{CategoryName: "Mikrofoner", Name: "Sennheiser e935", QuantityAvailable: 3, PriceExVAT: 120, XLSXRow: 12},
	}
	if err := UpsertInventory(database, categories, updated); err != nil {
		t.Fatalf("second import: %v", err)
	}

	mic, err := GetInventoryItem(database, micID)
	if err != nil {
		t.Fatalf("get mic after re-import: %v", err)
	}
	if mic.Name != "Shure SM58" || mic.PriceExVAT != 175 || mic.QuantityAvailable != 6 || mic.Discontinued {
		t.Errorf("mic after re-import: %+v, want same id with updated price/stock", mic)
	}

	akg, err := GetInventoryItem(database, akgID)
	if err != nil {
		t.Fatalf("get dropped item: %v (must be flagged, not deleted)", err)
	}
	if !akg.Discontinued {
		t.Errorf("dropped item not flagged discontinued")
	}

	// The planning reference still resolves and is flagged on the order.
	line := rentalLine(t, database, eventID, micID)
	if line.InventoryItemName != "Shure SM58" || line.QuantityAudio != 1 {
		t.Errorf("plan reference broken after re-import: %+v", line)
	}

	// Discontinued items are hidden from default listings.
	visible, err := ListInventoryItems(database, nil, "", "", false)
	if err != nil {
		t.Fatalf("list visible items: %v", err)
	}
	for _, item := range visible {
		if item.ID == akgID {
			t.Errorf("discontinued item still visible in default listing")
		}
	}

	// Third import: AKG reappears and is revived under its original id.
	revived := append(updated, domain.InventoryItem{CategoryName: "Mikrofoner", Name: "AKG C414", QuantityAvailable: 1, PriceExVAT: 320, XLSXRow: 11})
	if err := UpsertInventory(database, categories, revived); err != nil {
		t.Fatalf("third import: %v", err)
	}
	akg, err = GetInventoryItem(database, akgID)
	if err != nil {
		t.Fatalf("get revived item: %v", err)
	}
	if akg.Discontinued || akg.PriceExVAT != 320 {
		t.Errorf("revived item: %+v, want discontinued=false price=320 under original id", akg)
	}
}

// TestUpsertInventoryDuplicateNamesMatchByPosition verifies the list-position
// fallback: same-named items keep their identity by order of appearance.
func TestUpsertInventoryDuplicateNamesMatchByPosition(t *testing.T) {
	database := openTestDB(t)
	categories, items := importFixture()
	if err := UpsertInventory(database, categories, items); err != nil {
		t.Fatalf("initial import: %v", err)
	}
	before := allItemsByName(t, database)["XLR-kabel"]
	if len(before) != 2 {
		t.Fatalf("got %d XLR-kabel items, want 2", len(before))
	}

	if err := UpsertInventory(database, categories, items); err != nil {
		t.Fatalf("re-import: %v", err)
	}
	after := allItemsByName(t, database)["XLR-kabel"]
	if len(after) != 2 {
		t.Fatalf("after re-import: got %d XLR-kabel items, want 2 (no duplicates inserted)", len(after))
	}
	idByDescription := func(items []domain.InventoryItem) map[string]int64 {
		result := make(map[string]int64, len(items))
		for _, item := range items {
			result[item.Description] = item.ID
		}
		return result
	}
	beforeIDs, afterIDs := idByDescription(before), idByDescription(after)
	for description, id := range beforeIDs {
		if afterIDs[description] != id {
			t.Errorf("XLR-kabel %q changed id: before=%d after=%d", description, id, afterIDs[description])
		}
	}
}

// TestUpsertInventoryRollsBackOnFailure verifies FR-009: a failing import
// leaves the catalog byte-for-byte unchanged, including discontinued flags.
func TestUpsertInventoryRollsBackOnFailure(t *testing.T) {
	database := openTestDB(t)
	categories, items := importFixture()
	if err := UpsertInventory(database, categories, items); err != nil {
		t.Fatalf("initial import: %v", err)
	}

	// A category type violating the schema CHECK constraint fails mid-import,
	// after the transaction has already flagged everything discontinued.
	bad := []domain.InventoryCategory{{Name: "Trasig", CategoryType: "not-a-type"}}
	if err := UpsertInventory(database, bad, nil); err == nil {
		t.Fatalf("import with invalid category type succeeded, want error")
	}

	items2, err := ListInventoryItems(database, nil, "", "", false)
	if err != nil {
		t.Fatalf("list items after failed import: %v", err)
	}
	if len(items2) != len(items) {
		t.Errorf("catalog changed by failed import: %d visible items, want %d", len(items2), len(items))
	}
	for _, item := range items2 {
		if item.Discontinued {
			t.Errorf("item %q left discontinued by rolled-back import", item.Name)
		}
	}
}
