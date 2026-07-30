package service

import (
	"bytes"
	"database/sql"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
	"github.com/xuri/excelize/v2"
)

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot resolve caller path")
	}
	migrations := filepath.Join(filepath.Dir(thisFile), "..", "..", "migrations")
	database, err := db.Open(filepath.Join(t.TempDir(), "test.db"), migrations, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	return database
}

// writeFixtureXLSX creates a minimal price list in the renter's layout:
// header row, category rows ("Namn:" in column A only), then item rows with
// name / description / quantity / price.
func writeFixtureXLSX(t *testing.T) string {
	t.Helper()
	file := excelize.NewFile()
	const sheet = "Prislista LL"
	if _, err := file.NewSheet(sheet); err != nil {
		t.Fatalf("create sheet: %v", err)
	}
	rows := [][]any{
		{"Beskrivning", "Kommentar", "Tot. Antal", "Ex Moms", "Ink Moms", "Antal Ljud", "Antal Ljus"},
		{"Mikrofoner:"},
		{"Shure SM58", "Dynamisk sångmikrofon", 4, 150},
		{"AKG C414", "Kondensator", 2, "1,750.0 kr"},
		// Header rows can carry leftover order quantities in the Antal
		// Ljud/Ljus columns from a previously submitted order; they must
		// still be recognized as categories (a real LL.xlsx has these).
		{"Högtalare:", "", "", "", "", 1, ""},
		{"JBL SRX835P", "Aktiv 3-vägs", 4, 500},
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
	path := filepath.Join(t.TempDir(), "LL.xlsx")
	if err := file.SaveAs(path); err != nil {
		t.Fatalf("save fixture xlsx: %v", err)
	}
	return path
}

// importFixture opens path and imports it as inventoryID's catalog — the
// new signature (research.md R1) takes a reader, not a path, so tests open
// the fixture file themselves rather than passing the path straight through.
func importFixture(t *testing.T, svc InventoryService, inventoryID int64, path string) (domain.InventoryImportResult, error) {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatalf("open fixture xlsx: %v", err)
	}
	defer func() { _ = f.Close() }()
	return svc.ImportFromXLSX(inventoryID, filepath.Base(path), f)
}

// TestImportRoundTripPreservesReferences verifies the full import path: parse
// the sheet, plan against the resulting catalog, re-import the same file, and
// confirm every reference still resolves to the same item ids (FR-007).
func TestImportRoundTripPreservesReferences(t *testing.T) {
	database := openTestDB(t)
	path := writeFixtureXLSX(t)
	svc := InventoryService{DB: database}

	owner, err := db.UpsertUserByGoogleSub(database, "test-owner-sub", "owner@example.com", "Test Owner", "")
	if err != nil {
		t.Fatalf("seed test owner: %v", err)
	}
	inventory, err := db.CreateInventory(database, owner.ID, "Test Inventory")
	if err != nil {
		t.Fatalf("create inventory: %v", err)
	}

	result, err := importFixture(t, svc, inventory.ID, path)
	if err != nil {
		t.Fatalf("initial import: %v", err)
	}
	if result.CategoriesImported != 2 || result.ItemsImported != 3 {
		t.Fatalf("imported %d categories / %d items, want 2 / 3", result.CategoriesImported, result.ItemsImported)
	}

	items, err := db.ListInventoryItems(database, inventory.ID, nil, "", "", false)
	if err != nil {
		t.Fatalf("list items: %v", err)
	}
	idsByName := make(map[string]int64, len(items))
	for _, item := range items {
		idsByName[item.Name] = item.ID
	}
	micID := idsByName["Shure SM58"]
	speakerID := idsByName["JBL SRX835P"]
	if micID == 0 || speakerID == 0 {
		t.Fatalf("expected items missing after import: %+v", idsByName)
	}
	for _, item := range items {
		switch item.Name {
		case "Shure SM58":
			if item.PriceExVAT != 150 || item.QuantityAvailable != 4 {
				t.Errorf("SM58 price=%v qty=%d, want 150/4", item.PriceExVAT, item.QuantityAvailable)
			}
		case "AKG C414":
			if item.PriceExVAT != 1750 {
				t.Errorf("C414 price=%v, want 1750 parsed from formatted cell", item.PriceExVAT)
			}
		case "JBL SRX835P":
			if item.CategoryName != "Högtalare" {
				t.Errorf("SRX835P category=%q, want header with leftover quantity recognized", item.CategoryName)
			}
		}
	}

	event, err := db.CreateEvent(database, domain.Event{Name: "Roundtrip"}, owner.ID, inventory.ID)
	if err != nil {
		t.Fatalf("create event: %v", err)
	}
	if _, err := db.CreateInputSource(database, domain.InputSource{EventID: event.ID, Name: "Lead Vox", Kind: "mic", MicItemID: &micID, ConnectorType: "xlr", Width: "mono"}); err != nil {
		t.Fatalf("create input source: %v", err)
	}
	output, err := db.CreateAudioPatchOutput(database, domain.AudioPatchOutput{EventID: event.ID, OutputNumber: 1, OutputType: "foh", Width: "mono"})
	if err != nil {
		t.Fatalf("create output: %v", err)
	}
	speakerDevice, err := db.CreateOutputDevice(database, domain.OutputDevice{EventID: event.ID, Name: "Speaker", InventoryItemID: &speakerID, InputPortCount: 1})
	if err != nil {
		t.Fatalf("create output device: %v", err)
	}
	if _, err := db.CreateOutputCable(database, domain.OutputCable{EventID: event.ID, FromKind: "mixer", FromID: output.ID, FromPort: 0, ToKind: "device", ToID: speakerDevice.ID, ToPort: 0}); err != nil {
		t.Fatalf("create output cable: %v", err)
	}

	if _, err := importFixture(t, svc, inventory.ID, path); err != nil {
		t.Fatalf("re-import: %v", err)
	}

	// Planning rows survived (the old importer deleted outputs wholesale).
	outputs, err := db.ListAudioPatchOutputs(database, event.ID)
	if err != nil {
		t.Fatalf("list outputs: %v", err)
	}
	if len(outputs) != 1 {
		t.Fatalf("output row lost by re-import: %+v", outputs)
	}
	devices, err := db.ListOutputDevices(database, event.ID)
	if err != nil {
		t.Fatalf("list output devices: %v", err)
	}
	if len(devices) != 1 || devices[0].InventoryItemID == nil || *devices[0].InventoryItemID != speakerID {
		t.Fatalf("output device lost or relinked by re-import: %+v", devices)
	}
	cables, err := db.ListOutputCables(database, event.ID)
	if err != nil {
		t.Fatalf("list output cables: %v", err)
	}
	if len(cables) != 1 {
		t.Fatalf("output cable lost by re-import: %+v", cables)
	}

	// Item identity survived.
	summary, err := db.GetRentalSummary(database, event.ID)
	if err != nil {
		t.Fatalf("rental summary: %v", err)
	}
	found := map[int64]bool{}
	for _, line := range summary.Items {
		found[line.InventoryItemID] = true
	}
	if !found[micID] || !found[speakerID] {
		t.Fatalf("references no longer resolve after re-import: %+v", summary.Items)
	}
}

// TestImportRealLLPricesTheCatalog is Slice 31's headline claim, against the
// user's actual price list: importing it produces a priced catalog with nothing
// typed. Sixteen rate-card rows and 25% VAT, neither of which that file states
// anywhere PatchPlanner used to look.
func TestImportRealLLPricesTheCatalog(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "LL.xlsx"))
	if err != nil {
		t.Skipf("real LL.xlsx not available: %v", err)
	}
	database := openTestDB(t)
	svc := InventoryService{DB: database}
	owner, err := db.UpsertUserByGoogleSub(database, "test-owner-sub", "owner@example.com", "Test Owner", "")
	if err != nil {
		t.Fatalf("seed test owner: %v", err)
	}
	// A VAT rate the file will have to overrule, and a rule it must not.
	if _, err := db.SetPricingDefaults(database, owner.ID, domain.PricingDefaults{ChargedDays: domain.ChargedDaysShow, VATPercent: 6}); err != nil {
		t.Fatalf("set defaults: %v", err)
	}
	inventory, err := db.CreateInventory(database, owner.ID, "LL")
	if err != nil {
		t.Fatalf("create inventory: %v", err)
	}

	result, err := svc.Import(inventory.ID, "LL.xlsx", bytes.NewReader(data))
	if err != nil {
		t.Fatalf("import real LL.xlsx: %v", err)
	}

	pricing, err := db.GetInventoryPricing(database, inventory.ID)
	if err != nil {
		t.Fatalf("get inventory pricing: %v", err)
	}
	if len(pricing.Factors) != 16 {
		t.Errorf("rate card has %d rows, want 16", len(pricing.Factors))
	}
	// The file states its own rate, and a file's statement beats a default.
	if pricing.VATPercent != 25 {
		t.Errorf("VAT = %v, want the file's 25 rather than the user's 6", pricing.VATPercent)
	}
	// The charged-days rule is NOT something the file states, so the copy the
	// catalog took at creation stands.
	if pricing.ChargedDays != domain.ChargedDaysShow {
		t.Errorf("charged days = %q, want the %q copied at creation", pricing.ChargedDays, domain.ChargedDaysShow)
	}
	// And the provenance is reported once, here, and stored nowhere.
	var reported bool
	for _, warning := range result.Warnings {
		if strings.Contains(warning, "VAT 25% read from the file") {
			reported = true
		}
	}
	if !reported {
		t.Errorf("warnings = %v, want the VAT provenance reported", result.Warnings)
	}

	// A hand-typed row, then a re-import: the card is one curve, so the import
	// replaces it whole rather than merging (research.md R7).
	if _, err := db.CreateRentFactor(database, inventory.ID, 45, 8); err != nil {
		t.Fatalf("hand-typed row: %v", err)
	}
	if _, err := svc.Import(inventory.ID, "LL.xlsx", bytes.NewReader(data)); err != nil {
		t.Fatalf("re-import: %v", err)
	}
	pricing, err = db.GetInventoryPricing(database, inventory.ID)
	if err != nil {
		t.Fatalf("get inventory pricing: %v", err)
	}
	if len(pricing.Factors) != 16 {
		t.Errorf("rate card has %d rows after a re-import, want the file's 16", len(pricing.Factors))
	}
}

// A file carrying no rate card leaves the catalog's alone — which is what makes
// the blank generated template harmless.
func TestImportWithoutARateCardLeavesItAlone(t *testing.T) {
	database := openTestDB(t)
	svc := InventoryService{DB: database}
	owner, err := db.UpsertUserByGoogleSub(database, "test-owner-sub", "owner@example.com", "Test Owner", "")
	if err != nil {
		t.Fatalf("seed test owner: %v", err)
	}
	inventory, err := db.CreateInventory(database, owner.ID, "Test Inventory")
	if err != nil {
		t.Fatalf("create inventory: %v", err)
	}
	if _, err := db.CreateRentFactor(database, inventory.ID, 5, 2.2); err != nil {
		t.Fatalf("seed rate card: %v", err)
	}

	if _, err := importFixture(t, svc, inventory.ID, writeFixtureXLSX(t)); err != nil {
		t.Fatalf("import: %v", err)
	}

	pricing, err := db.GetInventoryPricing(database, inventory.ID)
	if err != nil {
		t.Fatalf("get inventory pricing: %v", err)
	}
	if len(pricing.Factors) != 1 || pricing.Factors[0].Days != 5 {
		t.Errorf("rate card = %+v, want the existing row untouched", pricing.Factors)
	}
}
