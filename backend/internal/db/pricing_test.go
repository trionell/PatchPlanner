package db

import (
	"database/sql"
	"errors"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

func TestPricingDefaultsSeedACatalogAtCreation(t *testing.T) {
	database := openTestDB(t)
	owner, err := UpsertUserByGoogleSub(database, "sub", "owner@example.com", "Owner", "")
	if err != nil {
		t.Fatalf("seed owner: %v", err)
	}

	// Every user starts with the migration's constants, whether or not they
	// have ever opened the page.
	defaults, err := GetPricingDefaults(database, owner.ID)
	if err != nil {
		t.Fatalf("get defaults: %v", err)
	}
	if defaults.ChargedDays != domain.ChargedDaysOnsite || defaults.VATPercent != 25 {
		t.Fatalf("defaults = %+v, want onsite/25", defaults)
	}

	if _, err := SetPricingDefaults(database, owner.ID, domain.PricingDefaults{ChargedDays: domain.ChargedDaysShow, VATPercent: 12}); err != nil {
		t.Fatalf("set defaults: %v", err)
	}
	inventory, err := CreateInventory(database, owner.ID, "Bengts Ljud")
	if err != nil {
		t.Fatalf("create inventory: %v", err)
	}
	pricing, err := GetInventoryPricing(database, inventory.ID)
	if err != nil {
		t.Fatalf("get inventory pricing: %v", err)
	}
	if pricing.ChargedDays != domain.ChargedDaysShow || pricing.VATPercent != 12 {
		t.Errorf("catalog pricing = %+v, want the defaults it was created with", pricing)
	}

	// And changing the defaults afterwards reaches nothing that exists.
	if _, err := SetPricingDefaults(database, owner.ID, domain.PricingDefaults{ChargedDays: domain.ChargedDaysOnsite, VATPercent: 25}); err != nil {
		t.Fatalf("set defaults again: %v", err)
	}
	pricing, err = GetInventoryPricing(database, inventory.ID)
	if err != nil {
		t.Fatalf("get inventory pricing: %v", err)
	}
	if pricing.ChargedDays != domain.ChargedDaysShow || pricing.VATPercent != 12 {
		t.Errorf("catalog pricing = %+v, want it unchanged by a later default", pricing)
	}
}

func TestRentFactorCRUD(t *testing.T) {
	database := openTestDB(t)
	inventoryID := testInventory(t, database)

	for _, row := range []struct {
		days   int
		factor float64
	}{{5, 2.2}, {1, 1}, {14, 4}} {
		if _, err := CreateRentFactor(database, inventoryID, row.days, row.factor); err != nil {
			t.Fatalf("create rent factor %d: %v", row.days, err)
		}
	}

	// Ascending by days, whatever order they were entered in:
	// domain.LookupRentFactor assumes it and the drawer renders a curve.
	factors, err := ListRentFactors(database, inventoryID)
	if err != nil {
		t.Fatalf("list rent factors: %v", err)
	}
	if len(factors) != 3 || factors[0].Days != 1 || factors[1].Days != 5 || factors[2].Days != 14 {
		t.Fatalf("factors = %+v, want 1/5/14 ascending", factors)
	}

	if _, err := CreateRentFactor(database, inventoryID, 5, 2.4); !errors.Is(err, ErrDuplicate) {
		t.Errorf("duplicate days error = %v, want ErrDuplicate", err)
	}

	updated, err := UpdateRentFactor(database, inventoryID, factors[1].ID, 6, 2.4)
	if err != nil {
		t.Fatalf("update rent factor: %v", err)
	}
	if updated.Days != 6 || updated.Factor != 2.4 {
		t.Errorf("updated = %+v, want 6 days at 2.4", updated)
	}
	// Updating a row to its own day count is not a duplicate of itself.
	if _, err := UpdateRentFactor(database, inventoryID, factors[1].ID, 6, 2.5); err != nil {
		t.Errorf("update to same days: %v", err)
	}
	if _, err := UpdateRentFactor(database, inventoryID, factors[1].ID, 14, 2.5); !errors.Is(err, ErrDuplicate) {
		t.Errorf("update onto another row's days = %v, want ErrDuplicate", err)
	}

	if err := DeleteRentFactor(database, inventoryID, factors[0].ID); err != nil {
		t.Fatalf("delete rent factor: %v", err)
	}
	if err := DeleteRentFactor(database, inventoryID, factors[0].ID); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("second delete = %v, want sql.ErrNoRows", err)
	}
}

// A row id from another catalog is a miss, not a cross-catalog write.
func TestRentFactorsAreScopedToTheirCatalog(t *testing.T) {
	database := openTestDB(t)
	owner, err := UpsertUserByGoogleSub(database, "sub", "owner@example.com", "Owner", "")
	if err != nil {
		t.Fatalf("seed owner: %v", err)
	}
	mine, err := CreateInventory(database, owner.ID, "Mine")
	if err != nil {
		t.Fatalf("create mine: %v", err)
	}
	theirs, err := CreateInventory(database, owner.ID, "Theirs")
	if err != nil {
		t.Fatalf("create theirs: %v", err)
	}
	row, err := CreateRentFactor(database, theirs.ID, 5, 2.2)
	if err != nil {
		t.Fatalf("create rent factor: %v", err)
	}

	if _, err := UpdateRentFactor(database, mine.ID, row.ID, 5, 9); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("cross-catalog update = %v, want sql.ErrNoRows", err)
	}
	if err := DeleteRentFactor(database, mine.ID, row.ID); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("cross-catalog delete = %v, want sql.ErrNoRows", err)
	}
}

// The table is one curve, so an import that carries one replaces it whole —
// there is no is_manual to protect, unlike inventory_items (research.md R7).
func TestReplaceRentFactorsSwapsTheWholeCard(t *testing.T) {
	database := openTestDB(t)
	inventoryID := testInventory(t, database)

	if _, err := CreateRentFactor(database, inventoryID, 5, 2.0); err != nil {
		t.Fatalf("hand-typed row: %v", err)
	}
	if _, err := CreateRentFactor(database, inventoryID, 45, 8.0); err != nil {
		t.Fatalf("hand-typed row: %v", err)
	}

	if err := ReplaceRentFactors(database, inventoryID, []domain.RentFactor{{Days: 1, Factor: 1}, {Days: 5, Factor: 2.2}}); err != nil {
		t.Fatalf("replace rent factors: %v", err)
	}
	factors, err := ListRentFactors(database, inventoryID)
	if err != nil {
		t.Fatalf("list rent factors: %v", err)
	}
	if len(factors) != 2 {
		t.Fatalf("factors = %+v, want exactly the imported two", factors)
	}
	if factors[1].Days != 5 || factors[1].Factor != 2.2 {
		t.Errorf("factors[1] = %+v, want the imported 5-day row to win", factors[1])
	}
}

// A rate card has no meaning without its catalog.
func TestDeletingACatalogTakesItsRateCard(t *testing.T) {
	database := openTestDB(t)
	owner, err := UpsertUserByGoogleSub(database, "sub", "owner@example.com", "Owner", "")
	if err != nil {
		t.Fatalf("seed owner: %v", err)
	}
	inventory, err := CreateInventory(database, owner.ID, "Doomed")
	if err != nil {
		t.Fatalf("create inventory: %v", err)
	}
	if _, err := CreateRentFactor(database, inventory.ID, 5, 2.2); err != nil {
		t.Fatalf("create rent factor: %v", err)
	}
	if err := DeleteInventory(database, inventory.ID); err != nil {
		t.Fatalf("delete inventory: %v", err)
	}

	var remaining int
	if err := database.QueryRow(`SELECT COUNT(*) FROM inventory_rent_factors WHERE inventory_id = ?`, inventory.ID).Scan(&remaining); err != nil {
		t.Fatalf("count rent factors: %v", err)
	}
	if remaining != 0 {
		t.Errorf("%d rate-card rows survived their catalog", remaining)
	}
}

// NULL means "follow the catalog", so a catalog corrected after the fact
// corrects every event that never disagreed with it — and only those.
func TestEventPricingCascade(t *testing.T) {
	database := openTestDB(t)
	eventID := createTestEvent(t, database)
	event, err := GetEvent(database, eventID)
	if err != nil {
		t.Fatalf("get event: %v", err)
	}
	if err := SetInventoryPricing(database, event.InventoryID, domain.ChargedDaysOnsite, 25); err != nil {
		t.Fatalf("set inventory pricing: %v", err)
	}

	// A fresh event departs from nothing.
	if event.ChargedDays != nil || event.VATPercent != nil || event.RentFactorOverride != nil || event.DiscountPercent != 0 {
		t.Fatalf("a new event should hold no departures: %+v", event)
	}

	show := domain.ChargedDaysShow
	factor := 3.4
	vat := 12.0
	updated, err := UpdateEventPricing(database, eventID, domain.EventPricingRequest{
		ChargedDays: &show, RentFactorOverride: &factor, VATPercent: &vat, DiscountPercent: 25,
	})
	if err != nil {
		t.Fatalf("update event pricing: %v", err)
	}
	if updated.ChargedDays == nil || *updated.ChargedDays != domain.ChargedDaysShow {
		t.Errorf("charged days = %v, want show", updated.ChargedDays)
	}
	if updated.RentFactorOverride == nil || *updated.RentFactorOverride != 3.4 {
		t.Errorf("override = %v, want 3.4", updated.RentFactorOverride)
	}
	if updated.VATPercent == nil || *updated.VATPercent != 12 {
		t.Errorf("vat = %v, want 12", updated.VATPercent)
	}
	if updated.DiscountPercent != 25 {
		t.Errorf("discount = %v, want 25", updated.DiscountPercent)
	}

	// Nothing an event stores reaches its catalog.
	catalogPricing, err := GetInventoryPricing(database, event.InventoryID)
	if err != nil {
		t.Fatalf("get inventory pricing: %v", err)
	}
	if catalogPricing.ChargedDays != domain.ChargedDaysOnsite || catalogPricing.VATPercent != 25 {
		t.Errorf("catalog = %+v, want it untouched by the event's departures", catalogPricing)
	}

	// Clearing a departure returns the event to following the catalog.
	cleared, err := UpdateEventPricing(database, eventID, domain.EventPricingRequest{DiscountPercent: 0})
	if err != nil {
		t.Fatalf("clear event pricing: %v", err)
	}
	if cleared.ChargedDays != nil || cleared.RentFactorOverride != nil || cleared.VATPercent != nil {
		t.Errorf("cleared event still departs: %+v", cleared)
	}
}

// The details drawer sends a name, a venue, four dates and notes. It must not
// be able to wipe an agreed discount — which is what folding pricing into
// UpdateEvent's whole-object replace would have done (research.md R3).
func TestUpdateEventLeavesPricingAlone(t *testing.T) {
	database := openTestDB(t)
	eventID := createTestEvent(t, database)

	if _, err := UpdateEventPricing(database, eventID, domain.EventPricingRequest{DiscountPercent: 25}); err != nil {
		t.Fatalf("set discount: %v", err)
	}
	if _, err := UpdateEvent(database, eventID, domain.Event{Name: "Renamed", StartDate: "2026-08-13"}); err != nil {
		t.Fatalf("update event: %v", err)
	}

	event, err := GetEvent(database, eventID)
	if err != nil {
		t.Fatalf("get event: %v", err)
	}
	if event.DiscountPercent != 25 {
		t.Errorf("discount = %v after a details save, want 25", event.DiscountPercent)
	}
}
