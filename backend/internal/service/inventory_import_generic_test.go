package service

import (
	"bytes"
	"errors"
	"strings"
	"testing"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
	"github.com/xuri/excelize/v2"
)

// genericFixture builds an in-memory workbook from raw rows so each test
// can express exactly the sheet shape it is about.
func genericFixture(t *testing.T, sheet string, rows [][]any) *bytes.Reader {
	t.Helper()
	file := excelize.NewFile()
	defer func() { _ = file.Close() }()
	if err := file.SetSheetName(file.GetSheetName(0), sheet); err != nil {
		t.Fatalf("name sheet: %v", err)
	}
	for i, row := range rows {
		cell, err := excelize.CoordinatesToCellName(1, i+1)
		if err != nil {
			t.Fatalf("cell name: %v", err)
		}
		if err := file.SetSheetRow(sheet, cell, &row); err != nil {
			t.Fatalf("write row %d: %v", i+1, err)
		}
	}
	buf, err := file.WriteToBuffer()
	if err != nil {
		t.Fatalf("write fixture to buffer: %v", err)
	}
	return bytes.NewReader(buf.Bytes())
}

// newGenericInventory creates an owner and an empty inventory to import into.
func newGenericInventory(t *testing.T) (InventoryService, int64) {
	t.Helper()
	database := openTestDB(t)
	owner, err := db.UpsertUserByGoogleSub(database, "generic-owner-sub", "generic@example.com", "Generic Owner", "")
	if err != nil {
		t.Fatalf("seed owner: %v", err)
	}
	inventory, err := db.CreateInventory(database, owner.ID, "Generic Inventory")
	if err != nil {
		t.Fatalf("create inventory: %v", err)
	}
	return InventoryService{DB: database}, inventory.ID
}

var genericHeader = []any{"Category", "Type", "Name", "Description", "Quantity", "Price (ex VAT)"}

func TestImportGenericHappyPath(t *testing.T) {
	svc, inventoryID := newGenericInventory(t)
	fixture := genericFixture(t, genericSheet, [][]any{
		genericHeader,
		{"Microphones", "audio", "Shure SM58", "Dynamic vocal mic", 12, 120},
		{"Microphones", "audio", "Shure Beta 91A", "Boundary kick", 2, 250},
		{"Moving heads", "lighting", "Robe Pointe", "20/24ch", 8, 900},
		{"Truss", "rigging", "Prolyte H30V 2m", "Triangle 2m", 10, 150},
	})

	result, err := svc.ImportFromGenericXLSX(inventoryID, "my-gear.xlsx", fixture)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if result.CategoriesImported != 3 || result.ItemsImported != 4 {
		t.Errorf("result = %+v, want 3 categories and 4 items", result)
	}

	categories, err := db.ListInventoryCategories(svc.DB, inventoryID)
	if err != nil {
		t.Fatalf("list categories: %v", err)
	}
	types := map[string]string{}
	for _, c := range categories {
		types[c.Name] = c.CategoryType
	}
	if types["Moving heads"] != "lighting" || types["Truss"] != "rigging" || types["Microphones"] != "audio" {
		t.Errorf("category types = %v, want the types declared per row", types)
	}

	items, err := db.ListInventoryItems(svc.DB, inventoryID, nil, "", "", true)
	if err != nil {
		t.Fatalf("list items: %v", err)
	}
	if len(items) != 4 {
		t.Fatalf("items = %d, want 4", len(items))
	}
	for _, item := range items {
		if item.IsManual {
			t.Errorf("imported item %q marked manual", item.Name)
		}
		if item.Name == "Shure SM58" && (item.QuantityAvailable != 12 || item.PriceExVAT != 120) {
			t.Errorf("SM58 = qty %d price %v, want 12 / 120", item.QuantityAvailable, item.PriceExVAT)
		}
	}

	// The generic format has no file to write quantities back into, so the
	// inventory records the format but stores no blob.
	inventory, err := db.GetInventory(svc.DB, inventoryID)
	if err != nil {
		t.Fatalf("get inventory: %v", err)
	}
	if inventory.SourceFormat != domain.SourceFormatGeneric {
		t.Errorf("source format = %q, want %q", inventory.SourceFormat, domain.SourceFormatGeneric)
	}
	if inventory.SourceFilename != "my-gear.xlsx" {
		t.Errorf("source filename = %q, want my-gear.xlsx", inventory.SourceFilename)
	}
	blob, err := db.GetInventorySourceXLSX(svc.DB, inventoryID)
	if err != nil {
		t.Fatalf("get source xlsx: %v", err)
	}
	if blob != nil {
		t.Errorf("generic import stored %d bytes; it should store no template", len(blob))
	}
}

// Columns are found by heading, so reordering them and adding the user's
// own working columns must both be harmless (FR-002, FR-003).
func TestImportGenericReorderedAndExtraColumns(t *testing.T) {
	svc, inventoryID := newGenericInventory(t)
	fixture := genericFixture(t, genericSheet, [][]any{
		{"Name", "My own notes", "Price", "Category", "Qty", "Type"},
		{"Shure SM58", "ask for the new ones", 120, "Microphones", 12, "audio"},
		{"Robe Pointe", "", 900, "Moving heads", 8, "lighting"},
	})

	result, err := svc.ImportFromGenericXLSX(inventoryID, "reordered.xlsx", fixture)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if result.ItemsImported != 2 {
		t.Fatalf("items = %d, want 2", result.ItemsImported)
	}
	items, _ := db.ListInventoryItems(svc.DB, inventoryID, nil, "", "", true)
	for _, item := range items {
		if item.Name == "Shure SM58" && item.PriceExVAT != 120 {
			t.Errorf("SM58 price = %v, want 120 from the reordered Price column", item.PriceExVAT)
		}
	}
}

// A workbook whose sheet is not called "Inventory" still imports — users
// paste supplier lists into whatever workbook they already have.
func TestImportGenericFirstSheetFallback(t *testing.T) {
	svc, inventoryID := newGenericInventory(t)
	fixture := genericFixture(t, "Blad1", [][]any{
		genericHeader,
		{"Microphones", "audio", "Shure SM58", "", 12, 120},
	})
	if _, err := svc.ImportFromGenericXLSX(inventoryID, "blad1.xlsx", fixture); err != nil {
		t.Fatalf("import from non-Inventory sheet: %v", err)
	}
}

// Hand-made sheets are full of spacer rows; they must not be errors.
func TestImportGenericSkipsBlankRows(t *testing.T) {
	svc, inventoryID := newGenericInventory(t)
	fixture := genericFixture(t, genericSheet, [][]any{
		genericHeader,
		{"Microphones", "audio", "Shure SM58", "", 12, 120},
		{},
		{"", "", "", "", "", ""},
		{"Mixers", "audio", "Behringer X32", "", 1, 1800},
	})
	result, err := svc.ImportFromGenericXLSX(inventoryID, "spacers.xlsx", fixture)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if result.ItemsImported != 2 {
		t.Errorf("items = %d, want 2 (blank rows skipped silently)", result.ItemsImported)
	}
}

// Prices arrive in whatever shape the user's spreadsheet produced.
func TestImportGenericTolerantNumbers(t *testing.T) {
	svc, inventoryID := newGenericInventory(t)
	fixture := genericFixture(t, genericSheet, [][]any{
		genericHeader,
		{"Microphones", "audio", "Comma decimal", "", "3", "1750,50"},
		{"Microphones", "audio", "Currency suffix", "", "2", "550 kr"},
		{"Microphones", "audio", "Thousands", "", "1", "1,750.0"},
	})
	if _, err := svc.ImportFromGenericXLSX(inventoryID, "numbers.xlsx", fixture); err != nil {
		t.Fatalf("import: %v", err)
	}
	items, _ := db.ListInventoryItems(svc.DB, inventoryID, nil, "", "", true)
	prices := map[string]float64{}
	for _, item := range items {
		prices[item.Name] = item.PriceExVAT
	}
	if prices["Comma decimal"] != 1750.50 {
		t.Errorf("comma decimal = %v, want 1750.50", prices["Comma decimal"])
	}
	if prices["Currency suffix"] != 550 {
		t.Errorf("currency suffix = %v, want 550", prices["Currency suffix"])
	}
	if prices["Thousands"] != 1750 {
		t.Errorf("thousands separator = %v, want 1750", prices["Thousands"])
	}
}

// A missing Type is a reasonable omission; an unrecognised one is a typo
// that would silently hide the item from its planning dropdowns.
func TestImportGenericTypeHandling(t *testing.T) {
	svc, inventoryID := newGenericInventory(t)
	fixture := genericFixture(t, genericSheet, [][]any{
		genericHeader,
		{"Microphones", "", "Shure SM58", "", 12, 120},
	})
	if _, err := svc.ImportFromGenericXLSX(inventoryID, "no-type.xlsx", fixture); err != nil {
		t.Fatalf("import with blank Type: %v", err)
	}
	categories, _ := db.ListInventoryCategories(svc.DB, inventoryID)
	if len(categories) != 1 || categories[0].CategoryType != defaultGenericType {
		t.Errorf("categories = %+v, want a single %s category", categories, defaultGenericType)
	}

	svc2, inventory2 := newGenericInventory(t)
	bad := genericFixture(t, genericSheet, [][]any{
		genericHeader,
		{"Moving heads", "lights", "Robe Pointe", "", 8, 900},
	})
	_, err := svc2.ImportFromGenericXLSX(inventory2, "bad-type.xlsx", bad)
	assertValidationProblem(t, err, "row 2", "unknown Type", "lights")
}

// FR-005 / SC-003: every bad row is reported at once, with the sheet row
// number the user sees in Excel, and nothing is written.
func TestImportGenericReportsAllBadRowsAndWritesNothing(t *testing.T) {
	svc, inventoryID := newGenericInventory(t)

	// Seed a good catalog first, so "nothing was written" is observable.
	seed := genericFixture(t, genericSheet, [][]any{
		genericHeader,
		{"Microphones", "audio", "Shure SM58", "", 12, 120},
	})
	if _, err := svc.ImportFromGenericXLSX(inventoryID, "seed.xlsx", seed); err != nil {
		t.Fatalf("seed import: %v", err)
	}

	broken := genericFixture(t, genericSheet, [][]any{
		genericHeader,
		{"Microphones", "audio", "Shure SM58", "", 12, 120},
		{"", "audio", "Orphan with no category", "", 1, 10},
		{"Moving heads", "lights", "Robe Pointe", "", 8, 900},
	})
	_, err := svc.ImportFromGenericXLSX(inventoryID, "broken.xlsx", broken)
	assertValidationProblem(t, err, "row 3", "row 4")

	items, _ := db.ListInventoryItems(svc.DB, inventoryID, nil, "", "", true)
	if len(items) != 1 || items[0].Name != "Shure SM58" {
		t.Errorf("catalog changed by a rejected import: %+v", items)
	}
}

func TestImportGenericMissingRequiredColumn(t *testing.T) {
	svc, inventoryID := newGenericInventory(t)
	fixture := genericFixture(t, genericSheet, [][]any{
		{"Type", "Name", "Description", "Quantity", "Price (ex VAT)"},
		{"audio", "Shure SM58", "", 12, 120},
	})
	_, err := svc.ImportFromGenericXLSX(inventoryID, "no-category.xlsx", fixture)
	assertValidationProblem(t, err, "Category", "template")
}

// Rejecting an LL price list here (rather than importing garbage) is the
// point of matching on required headers.
func TestImportGenericRejectsPriceListLayout(t *testing.T) {
	svc, inventoryID := newGenericInventory(t)
	fixture := genericFixture(t, priceListSheet, [][]any{
		{"Beskrivning", "Kommentar", "Tot. Antal", "Ex Moms", "Ink Moms", "Antal Ljud", "Antal Ljus"},
		{"Mikrofoner:"},
		{"Shure SM58", "Dynamisk sångmikrofon", 4, 150},
	})
	_, err := svc.ImportFromGenericXLSX(inventoryID, "LL.xlsx", fixture)
	assertValidationProblem(t, err, "Category")
}

// A category declared with two different types is recoverable: first one
// wins and the user is told, rather than half the category being retyped.
func TestImportGenericWarnsOnConflictingCategoryType(t *testing.T) {
	svc, inventoryID := newGenericInventory(t)
	fixture := genericFixture(t, genericSheet, [][]any{
		genericHeader,
		{"Truss", "rigging", "Prolyte H30V 2m", "", 10, 150},
		{"Truss", "lighting", "Prolyte H30V 3m", "", 6, 200},
	})
	result, err := svc.ImportFromGenericXLSX(inventoryID, "conflict.xlsx", fixture)
	if err != nil {
		t.Fatalf("conflicting types should warn, not fail: %v", err)
	}
	if len(result.Warnings) != 1 || !strings.Contains(result.Warnings[0], "Truss") {
		t.Fatalf("warnings = %v, want one mentioning Truss", result.Warnings)
	}
	categories, _ := db.ListInventoryCategories(svc.DB, inventoryID)
	if len(categories) != 1 || categories[0].CategoryType != "rigging" {
		t.Errorf("categories = %+v, want one rigging category (first occurrence wins)", categories)
	}
}

// Category matching is case-insensitive, so "Mixers" and "mixers" are one
// category rather than two near-duplicates in every dropdown.
func TestImportGenericCategoryNamesAreCaseInsensitive(t *testing.T) {
	svc, inventoryID := newGenericInventory(t)
	fixture := genericFixture(t, genericSheet, [][]any{
		genericHeader,
		{"Mixers", "audio", "Behringer X32", "", 1, 1800},
		{"mixers", "audio", "Yamaha QL5", "", 1, 4000},
	})
	result, err := svc.ImportFromGenericXLSX(inventoryID, "case.xlsx", fixture)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if result.CategoriesImported != 1 {
		t.Errorf("categories = %d, want 1", result.CategoriesImported)
	}
}

// The generic import reuses UpsertInventory, so it must inherit its
// non-destructive semantics.
func TestImportGenericReimportPreservesIdentity(t *testing.T) {
	svc, inventoryID := newGenericInventory(t)
	first := genericFixture(t, genericSheet, [][]any{
		genericHeader,
		{"Microphones", "audio", "Shure SM58", "", 12, 120},
		{"Microphones", "audio", "AKG C414", "", 2, 300},
	})
	if _, err := svc.ImportFromGenericXLSX(inventoryID, "v1.xlsx", first); err != nil {
		t.Fatalf("first import: %v", err)
	}
	before, _ := db.ListInventoryItems(svc.DB, inventoryID, nil, "", "", true)
	ids := map[string]int64{}
	for _, item := range before {
		ids[item.Name] = item.ID
	}

	second := genericFixture(t, genericSheet, [][]any{
		genericHeader,
		{"Microphones", "audio", "Shure SM58", "", 20, 130},
	})
	if _, err := svc.ImportFromGenericXLSX(inventoryID, "v2.xlsx", second); err != nil {
		t.Fatalf("re-import: %v", err)
	}

	after, _ := db.ListInventoryItems(svc.DB, inventoryID, nil, "", "", true)
	byName := map[string]domain.InventoryItem{}
	for _, item := range after {
		byName[item.Name] = item
	}
	if byName["Shure SM58"].ID != ids["Shure SM58"] {
		t.Errorf("re-import changed the SM58's id, breaking every plan reference to it")
	}
	if byName["Shure SM58"].QuantityAvailable != 20 {
		t.Errorf("re-import did not update quantity: %+v", byName["Shure SM58"])
	}
	if akg, ok := byName["AKG C414"]; !ok || !akg.Discontinued {
		t.Errorf("item absent from the new file should be discontinued, not deleted: %+v", akg)
	}
}

// assertValidationProblem checks that err is an ImportValidationError whose
// message mentions each expected fragment.
func assertValidationProblem(t *testing.T, err error, fragments ...string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected a validation error, got nil")
	}
	var validation ImportValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("error %v is not an ImportValidationError", err)
	}
	message := validation.Error()
	for _, fragment := range fragments {
		if !strings.Contains(message, fragment) {
			t.Errorf("validation message %q does not mention %q", message, fragment)
		}
	}
}
