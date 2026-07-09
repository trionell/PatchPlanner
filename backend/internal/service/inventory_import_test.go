package service

import (
	"database/sql"
	"path/filepath"
	"runtime"
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
	database, err := db.Open(filepath.Join(t.TempDir(), "test.db"), migrations)
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

// TestImportRoundTripPreservesReferences verifies the full import path: parse
// the sheet, plan against the resulting catalog, re-import the same file, and
// confirm every reference still resolves to the same item ids (FR-007).
func TestImportRoundTripPreservesReferences(t *testing.T) {
	database := openTestDB(t)
	path := writeFixtureXLSX(t)
	svc := InventoryService{DB: database}

	result, err := svc.ImportFromXLSX(path)
	if err != nil {
		t.Fatalf("initial import: %v", err)
	}
	if result.CategoriesImported != 2 || result.ItemsImported != 3 {
		t.Fatalf("imported %d categories / %d items, want 2 / 3", result.CategoriesImported, result.ItemsImported)
	}

	items, err := db.ListInventoryItems(database, nil, "", "", false)
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

	event, err := db.CreateEvent(database, domain.Event{Name: "Roundtrip"})
	if err != nil {
		t.Fatalf("create event: %v", err)
	}
	if _, err := db.CreateAudioPatchInput(database, domain.AudioPatchInput{EventID: event.ID, ChannelNumber: 1, SignalType: "mic", MicItemID: &micID}); err != nil {
		t.Fatalf("create input: %v", err)
	}
	if _, err := db.CreateAudioPatchOutput(database, domain.AudioPatchOutput{
		EventID: event.ID, OutputNumber: 1, OutputType: "foh",
		Chain: []domain.OutputChainHop{{HopKind: "device", DeviceSource: "inventory", InventoryItemID: &speakerID}},
	}); err != nil {
		t.Fatalf("create output: %v", err)
	}

	if _, err := svc.ImportFromXLSX(path); err != nil {
		t.Fatalf("re-import: %v", err)
	}

	// Planning rows survived (the old importer deleted outputs wholesale).
	outputs, err := db.ListAudioPatchOutputs(database, event.ID)
	if err != nil {
		t.Fatalf("list outputs: %v", err)
	}
	if len(outputs) != 1 || len(outputs[0].Chain) != 1 || outputs[0].Chain[0].InventoryItemID == nil || *outputs[0].Chain[0].InventoryItemID != speakerID {
		t.Fatalf("output row lost or relinked by re-import: %+v", outputs)
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
