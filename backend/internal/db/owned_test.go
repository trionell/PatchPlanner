package db

import (
	"database/sql"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

func createTestOwnedItem(t *testing.T, database *sql.DB, name string, quantityOwned int) domain.OwnedItem {
	t.Helper()
	item, err := CreateOwnedItem(database, domain.OwnedItem{Name: name, CategoryType: "audio", QuantityOwned: quantityOwned})
	if err != nil {
		t.Fatalf("create owned item %s: %v", name, err)
	}
	return item
}

// TestOwnedItemCatalog covers US1: CRUD, the planned_on_events count, the
// category CHECK, and independence from price-list imports.
func TestOwnedItemCatalog(t *testing.T) {
	database := openTestDB(t)

	item := createTestOwnedItem(t, database, "Shure SM7B", 1)
	if item.CategoryType != "audio" || item.QuantityOwned != 1 || item.PlannedOnEvents != 0 {
		t.Errorf("created item: %+v", item)
	}

	updated, err := UpdateOwnedItem(database, item.ID, domain.OwnedItem{Name: "Shure SM7B (studio)", CategoryType: "misc", QuantityOwned: 2, Notes: "flight case"})
	if err != nil {
		t.Fatalf("update owned item: %v", err)
	}
	if updated.Name != "Shure SM7B (studio)" || updated.QuantityOwned != 2 || updated.CategoryType != "misc" {
		t.Errorf("updated item: %+v", updated)
	}

	// Invalid category type is rejected by the schema.
	if _, err := CreateOwnedItem(database, domain.OwnedItem{Name: "Bad", CategoryType: "spaceship", QuantityOwned: 1}); err == nil {
		t.Errorf("invalid category_type accepted")
	}

	// planned_on_events counts distinct events.
	eventA, eventB := createTestEvent(t, database), createTestEvent(t, database)
	for _, eventID := range []int64{eventA, eventB} {
		if err := UpsertEventOwnedEquipment(database, eventID, item.ID, domain.OwnedEquipmentRequest{Quantity: 1}); err != nil {
			t.Fatalf("plan owned item: %v", err)
		}
	}
	got, err := GetOwnedItem(database, item.ID)
	if err != nil {
		t.Fatalf("get owned item: %v", err)
	}
	if got.PlannedOnEvents != 2 {
		t.Errorf("planned_on_events = %d, want 2", got.PlannedOnEvents)
	}

	// Price-list import leaves the owned catalog alone.
	categories, items := importFixture()
	if err := UpsertInventory(database, categories, items); err != nil {
		t.Fatalf("import: %v", err)
	}
	after, err := ListOwnedItems(database)
	if err != nil {
		t.Fatalf("list owned items: %v", err)
	}
	if len(after) != 1 || after[0].ID != item.ID || after[0].Name != "Shure SM7B (studio)" {
		t.Errorf("owned catalog changed by import: %+v", after)
	}

	// Delete cascades event lines away.
	if err := DeleteOwnedItem(database, item.ID); err != nil {
		t.Fatalf("delete owned item: %v", err)
	}
	lines, err := ListEventOwnedEquipment(database, eventA)
	if err != nil {
		t.Fatalf("list event lines: %v", err)
	}
	if len(lines) != 0 {
		t.Errorf("event lines survived catalog delete: %+v", lines)
	}
}

// TestEventOwnedEquipmentLines covers US2: upsert semantics, over-owned
// flag, event-delete cascade.
func TestEventOwnedEquipmentLines(t *testing.T) {
	database := openTestDB(t)
	eventID := createTestEvent(t, database)
	item := createTestOwnedItem(t, database, "DI-låda", 2)

	if err := UpsertEventOwnedEquipment(database, eventID, item.ID, domain.OwnedEquipmentRequest{Quantity: 1, Notes: "keys"}); err != nil {
		t.Fatalf("upsert line: %v", err)
	}
	lines, err := ListEventOwnedEquipment(database, eventID)
	if err != nil {
		t.Fatalf("list lines: %v", err)
	}
	if len(lines) != 1 || lines[0].Quantity != 1 || lines[0].Notes != "keys" || lines[0].IsOverOwned {
		t.Errorf("line after create: %+v", lines)
	}

	// Upsert updates the same line; over-owned flag flips.
	if err := UpsertEventOwnedEquipment(database, eventID, item.ID, domain.OwnedEquipmentRequest{Quantity: 3}); err != nil {
		t.Fatalf("upsert update: %v", err)
	}
	line, err := GetEventOwnedEquipment(database, eventID, item.ID)
	if err != nil {
		t.Fatalf("get line: %v", err)
	}
	if line.Quantity != 3 || !line.IsOverOwned || line.QuantityOwned != 2 {
		t.Errorf("line after update: %+v", line)
	}

	// Quantity zero removes.
	if err := UpsertEventOwnedEquipment(database, eventID, item.ID, domain.OwnedEquipmentRequest{}); err != nil {
		t.Fatalf("zero upsert: %v", err)
	}
	if lines, err = ListEventOwnedEquipment(database, eventID); err != nil || len(lines) != 0 {
		t.Errorf("line survived zero-quantity upsert: %v %+v", err, lines)
	}

	// Event delete cascades lines.
	if err := UpsertEventOwnedEquipment(database, eventID, item.ID, domain.OwnedEquipmentRequest{Quantity: 1}); err != nil {
		t.Fatalf("re-add line: %v", err)
	}
	if err := DeleteEvent(database, eventID); err != nil {
		t.Fatalf("delete event: %v", err)
	}
	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM event_owned_equipment WHERE event_id = ?`, eventID).Scan(&count); err != nil {
		t.Fatalf("count lines: %v", err)
	}
	if count != 0 {
		t.Errorf("owned lines not cascaded on event delete: %d remain", count)
	}
}

// TestOwnedGearNeverOnRentalOrder is the isolation contract (FR-003/SC-002):
// planning owned gear changes neither the rental summary nor the export.
func TestOwnedGearNeverOnRentalOrder(t *testing.T) {
	database := openTestDB(t)
	cat := seedCatalog(t, database)
	eventID := createTestEvent(t, database)
	createMicInput(t, database, eventID, 1, &cat.Mic)

	before, err := GetRentalSummary(database, eventID)
	if err != nil {
		t.Fatalf("summary before: %v", err)
	}

	item := createTestOwnedItem(t, database, "Egen SM58", 4)
	if err := UpsertEventOwnedEquipment(database, eventID, item.ID, domain.OwnedEquipmentRequest{Quantity: 4, Notes: "egna mickar"}); err != nil {
		t.Fatalf("plan owned gear: %v", err)
	}

	after, err := GetRentalSummary(database, eventID)
	if err != nil {
		t.Fatalf("summary after: %v", err)
	}
	if len(after.Items) != len(before.Items) || after.TotalQuantity != before.TotalQuantity || after.TotalExVAT != before.TotalExVAT {
		t.Errorf("rental summary changed by owned gear:\nbefore %+v\nafter  %+v", before, after)
	}
}
