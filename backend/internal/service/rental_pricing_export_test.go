package service

import (
	"bytes"
	"database/sql"
	"strings"
	"testing"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
	"github.com/xuri/excelize/v2"
)

// The price-list export's whole pricing intervention: two cells per column, and
// nothing else in that sheet touched (Slice 31).
func TestPriceListExportWritesTheTwoTypedCells(t *testing.T) {
	database, _, eventID, ids := exportSetup(t)
	seedPricedOrder(t, database, eventID, ids)

	file, report, err := (ExportService{DB: database}).BuildRentalExport(eventID)
	if err != nil {
		t.Fatalf("build export: %v", err)
	}
	defer func() { _ = file.Close() }()

	if !report.PricingPlaced {
		t.Fatalf("pricing not placed: %v", report.PricingNotes)
	}
	if len(report.PricingNotes) != 0 {
		t.Errorf("notes = %v, want none when the event and the file agree", report.PricingNotes)
	}

	// Both value columns, because Rabatt and Hyresfaktor are per-column in that
	// file and one hire has one of each.
	for _, ref := range []string{"B4", "C4"} {
		if got := mustCellValue(t, file, summarySheet, ref); got != "0.25" {
			t.Errorf("%s = %q, want the discount as the fraction the file multiplies by", ref, got)
		}
	}
	for _, ref := range []string{"B5", "C5"} {
		if got := mustCellValue(t, file, summarySheet, ref); got != "2.2" {
			t.Errorf("%s = %q, want the rent factor", ref, got)
		}
	}

	// And the file's own arithmetic is left to do its job. Writing a total into
	// a cell that holds a formula would be editing somebody else's model.
	for ref, want := range map[string]string{
		"B6": "(B2-(B2*B4))*B5",
		"B7": "B6*1.25",
	} {
		formula, err := file.GetCellFormula(summarySheet, ref)
		if err != nil {
			t.Fatalf("read %s formula: %v", ref, err)
		}
		if formula != want {
			t.Errorf("%s formula = %q, want %q untouched", ref, formula, want)
		}
	}
}

// A file whose labels have been renamed still exports its quantities, and says
// what it could not do — Principle IV's duty is to report, not to refuse.
func TestPriceListExportReportsUnplaceablePricing(t *testing.T) {
	database, _, eventID, ids := exportSetup(t)
	seedPricedOrder(t, database, eventID, ids)

	// Rewrite the stored template with a renamed discount row.
	event, err := db.GetEvent(database, eventID)
	if err != nil {
		t.Fatalf("get event: %v", err)
	}
	source, err := db.GetInventorySourceXLSX(database, event.InventoryID)
	if err != nil {
		t.Fatalf("get source: %v", err)
	}
	stored, err := excelize.OpenReader(bytes.NewReader(source))
	if err != nil {
		t.Fatalf("open source: %v", err)
	}
	if err := stored.SetCellValue(summarySheet, "A4", "Rebate on equipment"); err != nil {
		t.Fatalf("rename label: %v", err)
	}
	var buffer bytes.Buffer
	if err := stored.Write(&buffer); err != nil {
		t.Fatalf("write source: %v", err)
	}
	_ = stored.Close()
	if err := db.SetInventorySource(database, event.InventoryID, buffer.Bytes(), "LL.xlsx", domain.SourceFormatLL); err != nil {
		t.Fatalf("store source: %v", err)
	}

	file, report, err := (ExportService{DB: database}).BuildRentalExport(eventID)
	if err != nil {
		t.Fatalf("build export: %v", err)
	}
	defer func() { _ = file.Close() }()

	if report.PricingPlaced {
		t.Error("pricing reported as placed against a file with a renamed label")
	}
	if len(report.PricingNotes) == 0 {
		t.Fatal("a renamed label must be reported, never silently dropped")
	}
	// The quantities are what the export is chiefly for, and they still arrive.
	if report.PlacedLines == 0 {
		t.Error("no quantities placed; a pricing miss must not cost the order")
	}
}

// The file computes its own inc-VAT column. Where the event disagrees, both
// numbers are named rather than one quietly winning.
func TestPriceListExportNamesAVATDisagreement(t *testing.T) {
	database, _, eventID, ids := exportSetup(t)
	seedPricedOrder(t, database, eventID, ids)

	exempt := 12.0
	if _, err := db.UpdateEventPricing(database, eventID, domain.EventPricingRequest{VATPercent: &exempt, DiscountPercent: 25}); err != nil {
		t.Fatalf("override vat: %v", err)
	}

	file, report, err := (ExportService{DB: database}).BuildRentalExport(eventID)
	if err != nil {
		t.Fatalf("build export: %v", err)
	}
	defer func() { _ = file.Close() }()

	if !report.PricingPlaced {
		t.Fatalf("pricing not placed: %v", report.PricingNotes)
	}
	joined := strings.Join(report.PricingNotes, " ")
	if !strings.Contains(joined, "12") || !strings.Contains(joined, "25") {
		t.Errorf("notes = %v, want both rates named", report.PricingNotes)
	}
	// And the file's formulas are still its own.
	formula, err := file.GetCellFormula(summarySheet, "B7")
	if err != nil || formula != "B6*1.25" {
		t.Errorf("B7 formula = %q (err %v), want it untouched", formula, err)
	}
}

// The generic spreadsheet carries the same ledger, as values in the same
// columns.
func TestGenericXLSXCarriesTheLedger(t *testing.T) {
	database, _, eventID, ids := exportSetup(t)
	seedPricedOrder(t, database, eventID, ids)

	file, _, err := (ExportService{DB: database}).BuildGenericRentalXLSX(eventID)
	if err != nil {
		t.Fatalf("build generic xlsx: %v", err)
	}
	defer func() { _ = file.Close() }()

	rows, err := file.GetRows(rentalSheet, excelize.Options{RawCellValue: true})
	if err != nil {
		t.Fatalf("read rows: %v", err)
	}
	labels := map[string]string{}
	for _, row := range rows {
		if len(row) > 0 {
			labels[row[0]] = strings.Join(row, "|")
		}
	}
	for _, want := range []string{"TOTAL, PER DAY", "Discount", "Billed days", "Rent factor", "TOTAL, 5 DAYS", "VAT", "TOTAL, INC VAT"} {
		if _, ok := labels[want]; !ok {
			t.Errorf("no %q row; rows were %v", want, keysOf(labels))
		}
	}
	if !strings.Contains(labels["TOTAL, INC VAT"], "1031.25") {
		t.Errorf("inc VAT row = %q, want the priced total", labels["TOTAL, INC VAT"])
	}
}

// The PDF renders without error at every pricing shape, and every string it
// draws stays cp1252-representable — no ×, no −, because no font is embedded.
func TestPDFPricingIsCP1252(t *testing.T) {
	database, _, eventID, ids := exportSetup(t)
	seedPricedOrder(t, database, eventID, ids)

	data, _, err := (ExportService{DB: database}).BuildRentalPDF(eventID)
	if err != nil {
		t.Fatalf("build pdf: %v", err)
	}
	if len(data) == 0 {
		t.Fatal("empty pdf")
	}
	for _, forbidden := range []string{"×", "−", "–", "·"} {
		if bytes.Contains(data, []byte(forbidden)) {
			t.Errorf("the pdf contains %q, which cp1252 cannot represent", forbidden)
		}
	}
}

// seedPricedOrder gives the event a five-day span, a rate card and a discount:
// 400 kr/day of gear, -25%, ×2.2 -> 660.00 ex VAT, 825.00 inc.
func seedPricedOrder(t *testing.T, database *sql.DB, eventID int64, ids map[string]int64) {
	t.Helper()
	event, err := db.GetEvent(database, eventID)
	if err != nil {
		t.Fatalf("get event: %v", err)
	}
	if _, err := database.Exec(`UPDATE events SET load_in_date = '2026-08-12', start_date = '2026-08-13', end_date = '2026-08-15', load_out_date = '2026-08-16' WHERE id = ?`, eventID); err != nil {
		t.Fatalf("set dates: %v", err)
	}
	if err := db.ReplaceRentFactors(database, event.InventoryID, []domain.RentFactor{{Days: 1, Factor: 1}, {Days: 5, Factor: 2.2}}); err != nil {
		t.Fatalf("seed rate card: %v", err)
	}
	if _, err := db.UpdateEventPricing(database, eventID, domain.EventPricingRequest{DiscountPercent: 25}); err != nil {
		t.Fatalf("set discount: %v", err)
	}
	// 2 x SM58 at 150 + 1 x JBL at 500 would be 800; keep it simple and use one
	// manual line so the arithmetic in the assertions is obvious.
	if err := db.UpsertManualRental(database, eventID, ids["JBL SRX835P"], domain.ManualRentalRequest{QuantityAudio: 1}); err != nil {
		t.Fatalf("seed manual line: %v", err)
	}
}

func mustCellValue(t *testing.T, file *excelize.File, sheet, ref string) string {
	t.Helper()
	value, err := file.GetCellValue(sheet, ref, excelize.Options{RawCellValue: true})
	if err != nil {
		t.Fatalf("read %s!%s: %v", sheet, ref, err)
	}
	return value
}

func keysOf(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for key := range m {
		out = append(out, key)
	}
	return out
}
