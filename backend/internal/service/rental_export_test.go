package service

import (
	"bytes"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
	"github.com/xuri/excelize/v2"
)

// writeRenterFixtureXLSX builds a workbook in the renter's real layout:
// title row, header row with embedded newlines, category rows (one carrying
// a stale leftover order quantity), and item rows (one with a stale
// quantity), mirroring what actually ships in LL.xlsx.
//
// Sheet rows: 1 title, 2 header, 3 "Mikrofoner:" (stale F=1),
// 4 Shure SM58, 5 AKG C414 (stale G=3), 6 "Högtalare:", 7 JBL SRX835P.
func writeRenterFixtureXLSX(t *testing.T, dir string) string {
	t.Helper()
	file := excelize.NewFile()
	if _, err := file.NewSheet(priceListSheet); err != nil {
		t.Fatalf("create sheet: %v", err)
	}
	rows := [][]any{
		{"LL Ljud"},
		{"Beskrivning", "Kommentar", "Tot. \nAntal", "Ex\nMoms", "Ink\nMoms", "Antal Ljud", "Antal Ljus", "Summa Ljud", "Summa Ljus", "Packat"},
		{"Mikrofoner:", "", "", "", "", 1, ""},
		{"Shure SM58", "Dynamisk sångmikrofon", 4, 150, 187.5},
		{"AKG C414", "Kondensator", 2, 300, 375, "", 3},
		{"Högtalare:"},
		{"JBL SRX835P", "Aktiv 3-vägs", 4, 500, 625},
	}
	for i, row := range rows {
		cellName, err := excelize.CoordinatesToCellName(1, i+1)
		if err != nil {
			t.Fatalf("cell name: %v", err)
		}
		if err := file.SetSheetRow(priceListSheet, cellName, &row); err != nil {
			t.Fatalf("write row %d: %v", i+1, err)
		}
	}
	path := filepath.Join(dir, "LL.xlsx")
	if err := file.SaveAs(path); err != nil {
		t.Fatalf("save fixture: %v", err)
	}
	return path
}

// exportSetup imports the renter fixture, creates an event, and returns
// everything the export tests need.
func exportSetup(t *testing.T) (database *sql.DB, sourcePath string, eventID int64, ids map[string]int64) {
	t.Helper()
	database = openTestDB(t)
	sourcePath = writeRenterFixtureXLSX(t, t.TempDir())
	if _, err := (InventoryService{DB: database}).ImportFromXLSX(sourcePath); err != nil {
		t.Fatalf("import fixture: %v", err)
	}
	items, err := db.ListInventoryItems(database, nil, "", "", true)
	if err != nil {
		t.Fatalf("list items: %v", err)
	}
	ids = make(map[string]int64, len(items))
	for _, item := range items {
		ids[item.Name] = item.ID
	}
	owner, err := db.UpsertUserByGoogleSub(database, "test-owner-sub", "owner@example.com", "Test Owner", "")
	if err != nil {
		t.Fatalf("seed test owner: %v", err)
	}
	event, err := db.CreateEvent(database, domain.Event{Name: "Sommarfest", Date: "2026-08-01"}, owner.ID)
	if err != nil {
		t.Fatalf("create event: %v", err)
	}
	return database, sourcePath, event.ID, ids
}

func exportToRows(t *testing.T, database *sql.DB, eventID int64, sourcePath string) (domain.RentalExportReport, [][]string, []byte) {
	t.Helper()
	file, report, err := (ExportService{DB: database}).BuildRentalExport(eventID, sourcePath)
	if err != nil {
		t.Fatalf("build export: %v", err)
	}
	defer func() { _ = file.Close() }()
	var buffer bytes.Buffer
	if err := file.Write(&buffer); err != nil {
		t.Fatalf("write export: %v", err)
	}
	reopened, err := excelize.OpenReader(bytes.NewReader(buffer.Bytes()))
	if err != nil {
		t.Fatalf("reopen export: %v", err)
	}
	defer func() { _ = reopened.Close() }()
	rows, err := reopened.GetRows(priceListSheet, excelize.Options{RawCellValue: true})
	if err != nil {
		t.Fatalf("read export: %v", err)
	}
	return report, rows, buffer.Bytes()
}

func cellAt(rows [][]string, row1Based, col0Based int) string {
	if row1Based-1 >= len(rows) {
		return ""
	}
	return cell(rows[row1Based-1], col0Based)
}

const (
	colAntalLjud = 5 // 0-based F
	colAntalLjus = 6 // 0-based G
)

// TestExportPlacesQuantities covers FR-001..003, FR-006/007: correct cells,
// stale clearing, nothing else modified, filename, and an untouched source.
func TestExportPlacesQuantities(t *testing.T) {
	database, sourcePath, eventID, ids := exportSetup(t)
	sourceBefore, err := os.ReadFile(sourcePath)
	if err != nil {
		t.Fatalf("read source: %v", err)
	}

	// 2 mic inputs + 1 manual audio → merged 3 audio; JBL 2 lighting manual.
	micID := ids["Shure SM58"]
	for i := 0; i < 2; i++ {
		if _, err := db.CreateInputSource(database, domain.InputSource{EventID: eventID, Name: "Mic", Kind: "mic", MicItemID: &micID, ConnectorType: "xlr", Width: "mono"}); err != nil {
			t.Fatalf("create input source: %v", err)
		}
	}
	if err := db.UpsertManualRental(database, eventID, micID, domain.ManualRentalRequest{QuantityAudio: 1}); err != nil {
		t.Fatalf("manual mic line: %v", err)
	}
	if err := db.UpsertManualRental(database, eventID, ids["JBL SRX835P"], domain.ManualRentalRequest{QuantityLighting: 2}); err != nil {
		t.Fatalf("manual speaker line: %v", err)
	}

	report, rows, _ := exportToRows(t, database, eventID, sourcePath)

	if got := cellAt(rows, 4, colAntalLjud); got != "3" {
		t.Errorf("SM58 Antal Ljud = %q, want 3", got)
	}
	if got := cellAt(rows, 7, colAntalLjus); got != "2" {
		t.Errorf("JBL Antal Ljus = %q, want 2", got)
	}
	// Stale leftovers cleared (category row F, item row G).
	if got := cellAt(rows, 3, colAntalLjud); got != "" {
		t.Errorf("stale category quantity not cleared: %q", got)
	}
	if got := cellAt(rows, 5, colAntalLjus); got != "" {
		t.Errorf("stale item quantity not cleared: %q", got)
	}
	// Nothing outside the two quantity columns changed.
	original, err := excelize.OpenFile(sourcePath)
	if err != nil {
		t.Fatalf("open source: %v", err)
	}
	defer func() { _ = original.Close() }()
	originalRows, err := original.GetRows(priceListSheet, excelize.Options{RawCellValue: true})
	if err != nil {
		t.Fatalf("read source rows: %v", err)
	}
	for rowIndex := range originalRows {
		for colIndex := range originalRows[rowIndex] {
			if colIndex == colAntalLjud || colIndex == colAntalLjus {
				continue
			}
			if got, want := cellAt(rows, rowIndex+1, colIndex), cell(originalRows[rowIndex], colIndex); got != want {
				t.Errorf("cell (%d,%d) changed: %q → %q", rowIndex+1, colIndex, want, got)
			}
		}
	}

	if report.PlacedLines != 2 || len(report.UnplacedLines) != 0 {
		t.Errorf("report: placed=%d unplaced=%v, want 2 placed, none unplaced", report.PlacedLines, report.UnplacedLines)
	}
	if report.Filename != "Hyrorder - Sommarfest - 2026-08-01.xlsx" {
		t.Errorf("filename = %q", report.Filename)
	}

	// The source file on disk is byte-identical.
	sourceAfter, err := os.ReadFile(sourcePath)
	if err != nil {
		t.Fatalf("re-read source: %v", err)
	}
	if !bytes.Equal(sourceBefore, sourceAfter) {
		t.Errorf("source file was modified by the export")
	}
}

// TestExportEmptyOrder covers FR-008: a clean copy with empty quantity
// columns (stale values still cleared).
func TestExportEmptyOrder(t *testing.T) {
	database, sourcePath, eventID, _ := exportSetup(t)
	report, rows, _ := exportToRows(t, database, eventID, sourcePath)
	if report.PlacedLines != 0 || len(report.UnplacedLines) != 0 {
		t.Errorf("report for empty order: %+v", report)
	}
	for rowIndex := 3; rowIndex <= len(rows); rowIndex++ {
		if got := cellAt(rows, rowIndex, colAntalLjud); got != "" {
			t.Errorf("row %d Antal Ljud = %q, want empty", rowIndex, got)
		}
		if got := cellAt(rows, rowIndex, colAntalLjus); got != "" {
			t.Errorf("row %d Antal Ljus = %q, want empty", rowIndex, got)
		}
	}
}

// TestExportRoundTrip covers SC-001 / research R7: an exported file
// re-imports without changing the catalog.
func TestExportRoundTrip(t *testing.T) {
	database, sourcePath, eventID, ids := exportSetup(t)
	micID := ids["Shure SM58"]
	if err := db.UpsertManualRental(database, eventID, micID, domain.ManualRentalRequest{QuantityAudio: 3}); err != nil {
		t.Fatalf("manual line: %v", err)
	}
	_, _, exported := exportToRows(t, database, eventID, sourcePath)

	exportedPath := filepath.Join(t.TempDir(), "exported.xlsx")
	if err := os.WriteFile(exportedPath, exported, 0o644); err != nil {
		t.Fatalf("write exported file: %v", err)
	}
	if _, err := (InventoryService{DB: database}).ImportFromXLSX(exportedPath); err != nil {
		t.Fatalf("re-import exported file: %v", err)
	}
	item, err := db.GetInventoryItem(database, micID)
	if err != nil {
		t.Fatalf("get mic after re-import: %v", err)
	}
	if item.Name != "Shure SM58" || item.PriceExVAT != 150 || item.Discontinued {
		t.Errorf("catalog changed by re-importing an export: %+v", item)
	}
}

// TestExportUnplacedLines covers US2/T009: discontinued, row drift, and
// missing-row lines are reported, everything else still places.
func TestExportUnplacedLines(t *testing.T) {
	database, sourcePath, eventID, ids := exportSetup(t)
	micID, akgID, jblID := ids["Shure SM58"], ids["AKG C414"], ids["JBL SRX835P"]
	for id, req := range map[int64]domain.ManualRentalRequest{
		micID: {QuantityAudio: 2},
		akgID: {QuantityAudio: 1},
		jblID: {QuantityLighting: 1},
	} {
		if err := db.UpsertManualRental(database, eventID, id, req); err != nil {
			t.Fatalf("manual line: %v", err)
		}
	}

	// AKG discontinued; JBL's recorded row drifted to a different name.
	if _, err := database.Exec(`UPDATE inventory_items SET discontinued = 1 WHERE id = ?`, akgID); err != nil {
		t.Fatalf("flag discontinued: %v", err)
	}
	if _, err := database.Exec(`UPDATE inventory_items SET xlsx_row = 4 WHERE id = ?`, jblID); err != nil {
		t.Fatalf("drift row: %v", err)
	}

	report, rows, _ := exportToRows(t, database, eventID, sourcePath)

	if got := cellAt(rows, 4, colAntalLjud); got != "2" {
		t.Errorf("placeable SM58 not written: %q", got)
	}
	if report.PlacedLines != 1 {
		t.Errorf("placed_lines = %d, want 1", report.PlacedLines)
	}
	reasons := make(map[int64]string)
	for _, line := range report.UnplacedLines {
		reasons[line.InventoryItemID] = line.Reason
	}
	if reasons[akgID] != domain.UnplacedDiscontinued {
		t.Errorf("AKG reason = %q, want discontinued", reasons[akgID])
	}
	if reasons[jblID] != domain.UnplacedRowMismatch {
		t.Errorf("JBL reason = %q, want row_mismatch", reasons[jblID])
	}
	// JBL's drifted target row (SM58's row) got only SM58's own quantity.
	if got := cellAt(rows, 4, colAntalLjus); got != "" {
		t.Errorf("mismatched line leaked onto the wrong row: Antal Ljus = %q", got)
	}

	// no_row: an item with no recorded position.
	if _, err := database.Exec(`UPDATE inventory_items SET discontinued = 0, xlsx_row = 0 WHERE id = ?`, akgID); err != nil {
		t.Fatalf("clear row: %v", err)
	}
	report, _, _ = exportToRows(t, database, eventID, sourcePath)
	reasons = make(map[int64]string)
	for _, line := range report.UnplacedLines {
		reasons[line.InventoryItemID] = line.Reason
	}
	if reasons[akgID] != domain.UnplacedNoRow {
		t.Errorf("AKG without row: reason = %q, want no_row", reasons[akgID])
	}
}

// TestExportMissingQuantityColumns covers the header-location failure mode.
func TestExportMissingQuantityColumns(t *testing.T) {
	database, _, eventID, _ := exportSetup(t)

	broken := excelize.NewFile()
	if _, err := broken.NewSheet(priceListSheet); err != nil {
		t.Fatalf("create sheet: %v", err)
	}
	row := []any{"Beskrivning", "Kommentar", "Antal"}
	if err := broken.SetSheetRow(priceListSheet, "A1", &row); err != nil {
		t.Fatalf("write header: %v", err)
	}
	brokenPath := filepath.Join(t.TempDir(), "broken.xlsx")
	if err := broken.SaveAs(brokenPath); err != nil {
		t.Fatalf("save broken fixture: %v", err)
	}

	if _, _, err := (ExportService{DB: database}).BuildRentalExport(eventID, brokenPath); err == nil {
		t.Fatalf("export against a sheet without quantity columns succeeded, want error")
	}
}

// TestExportMissingSourceFile covers FR-009.
func TestExportMissingSourceFile(t *testing.T) {
	database, _, eventID, _ := exportSetup(t)
	if _, _, err := (ExportService{DB: database}).BuildRentalExport(eventID, filepath.Join(t.TempDir(), "nope.xlsx")); err == nil {
		t.Fatalf("export with missing source succeeded, want error")
	}
}
