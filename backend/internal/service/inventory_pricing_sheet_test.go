package service

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/xuri/excelize/v2"
)

// TestParseRealLLRateCard reads the user's actual price list, not a fixture
// shaped like it. Sixteen rows starting at row 19, under eighteen blank ones —
// which is why the heading is searched for rather than assumed.
func TestParseRealLLRateCard(t *testing.T) {
	file := openRealLLFile(t)
	defer func() { _ = file.Close() }()

	sheet := parsePricingSheet(file)
	if !sheet.Found {
		t.Fatal("the real LL.xlsx has a Hyresfaktor sheet and it was not found")
	}
	if len(sheet.Factors) != 16 {
		t.Fatalf("read %d rows, want 16: %+v", len(sheet.Factors), sheet.Factors)
	}
	if len(sheet.Warnings) != 0 {
		t.Errorf("unexpected warnings from a clean supplier file: %v", sheet.Warnings)
	}

	// Ascending, and the rows the pricing worked example depends on.
	want := map[int]float64{1: 1, 2: 1.5, 5: 2.2, 14: 4, 21: 5.4, 30: 6.6}
	byDays := map[int]float64{}
	previous := 0
	for _, factor := range sheet.Factors {
		if factor.Days <= previous {
			t.Fatalf("rows are not ascending: %d after %d", factor.Days, previous)
		}
		previous = factor.Days
		byDays[factor.Days] = factor.Factor
	}
	for days, factor := range want {
		// The file stores 2.2 as 2.2000000000000002, so compare loosely.
		if diff := byDays[days] - factor; diff > 0.0001 || diff < -0.0001 {
			t.Errorf("%d days = %v, want %v", days, byDays[days], factor)
		}
	}
}

// LL.xlsx never states 25% as a value. It states *1.25 inside seven formulas,
// and this reads the one on the equipment row.
func TestReadRealLLVATPercent(t *testing.T) {
	file := openRealLLFile(t)
	defer func() { _ = file.Close() }()

	rate, ok := readLLVATPercent(file)
	if !ok {
		t.Fatal("no VAT rate read from the real LL.xlsx")
	}
	if rate != 25 {
		t.Errorf("VAT = %v, want 25", rate)
	}
}

// Every failure path means "this file states no rate" — never an error, and
// never a guess from a partial read (research.md R2).
func TestLLVATHeuristicFailsQuietly(t *testing.T) {
	tests := []struct {
		name    string
		build   func(*excelize.File)
		wantAny bool
	}{
		{
			name:  "no summary sheet at all",
			build: func(file *excelize.File) {},
		},
		{
			name: "the row was renamed",
			build: func(file *excelize.File) {
				mustNewSheet(t, file, summarySheet)
				mustSet(t, file, summarySheet, "A7", "Total including tax")
				mustFormula(t, file, summarySheet, "B7", "=B6*1.25")
			},
		},
		{
			name: "the cell holds a value rather than a formula",
			build: func(file *excelize.File) {
				mustNewSheet(t, file, summarySheet)
				mustSet(t, file, summarySheet, "A7", "Summa utrustning ink")
				mustSet(t, file, summarySheet, "B7", 1000)
			},
		},
		{
			name: "the formula has no multiplier",
			build: func(file *excelize.File) {
				mustNewSheet(t, file, summarySheet)
				mustSet(t, file, summarySheet, "A7", "Summa utrustning ink")
				mustFormula(t, file, summarySheet, "B7", "=B6+B5")
			},
		},
		{
			name: "a multiplier that is not a VAT rate",
			build: func(file *excelize.File) {
				mustNewSheet(t, file, summarySheet)
				mustSet(t, file, summarySheet, "A7", "Summa utrustning ink")
				mustFormula(t, file, summarySheet, "B7", "=B6*0.8")
			},
		},
		{
			name: "a rate other than 25, read as stated",
			build: func(file *excelize.File) {
				mustNewSheet(t, file, summarySheet)
				mustSet(t, file, summarySheet, "A7", "Summa utrustning ink")
				mustFormula(t, file, summarySheet, "B7", "=B6*1.12")
			},
			wantAny: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			file := excelize.NewFile()
			defer func() { _ = file.Close() }()
			test.build(file)

			rate, ok := readLLVATPercent(file)
			if ok != test.wantAny {
				t.Fatalf("read = %v (%v), want found=%v", rate, ok, test.wantAny)
			}
			if test.wantAny && rate != 12 {
				t.Errorf("rate = %v, want 12", rate)
			}
		})
	}
}

func TestParsePricingSheetGenericShape(t *testing.T) {
	t.Run("a filled-in Pricing sheet", func(t *testing.T) {
		sheet := parsePricingSheet(buildPricingFixture(t, [][]any{
			{"VAT %", 25},
			{},
			{"Days", "Factor"},
			{1, 1},
			{3, "1,8"}, // a Swedish decimal comma, as a hand-edited file has
			{7, 2.6},
		}))
		if !sheet.Found || len(sheet.Factors) != 3 {
			t.Fatalf("factors = %+v, want three rows", sheet.Factors)
		}
		if sheet.Factors[1].Days != 3 || sheet.Factors[1].Factor != 1.8 {
			t.Errorf("row = %+v, want 3 days at 1.8", sheet.Factors[1])
		}
		if sheet.VATPercent == nil || *sheet.VATPercent != 25 {
			t.Errorf("vat = %v, want 25", sheet.VATPercent)
		}
	})

	t.Run("a percentage-formatted VAT cell reads as a percentage", func(t *testing.T) {
		// Excel stores a cell formatted as 25% as the number 0.25. Nobody
		// filling in that template should have to know which they typed.
		sheet := parsePricingSheet(buildPricingFixture(t, [][]any{{"VAT %", 0.25}, {"Days", "Factor"}, {1, 1}}))
		if sheet.VATPercent == nil || *sheet.VATPercent != 25 {
			t.Errorf("vat = %v, want 25", sheet.VATPercent)
		}
	})

	t.Run("rows out of order are sorted", func(t *testing.T) {
		sheet := parsePricingSheet(buildPricingFixture(t, [][]any{{"Days", "Factor"}, {14, 4}, {1, 1}, {5, 2.2}}))
		if len(sheet.Factors) != 3 || sheet.Factors[0].Days != 1 || sheet.Factors[2].Days != 14 {
			t.Errorf("factors = %+v, want ascending", sheet.Factors)
		}
	})

	t.Run("a malformed row is a warning, never a rejection", func(t *testing.T) {
		sheet := parsePricingSheet(buildPricingFixture(t, [][]any{
			{"Days", "Factor"},
			{1, 1},
			{"tre", 1.8},
			{7, "gratis"},
			{0, 1.2},
			{5, 2.2},
		}))
		if len(sheet.Factors) != 2 {
			t.Fatalf("factors = %+v, want the two usable rows", sheet.Factors)
		}
		if len(sheet.Warnings) != 3 {
			t.Errorf("warnings = %v, want one per skipped row", sheet.Warnings)
		}
	})

	t.Run("a repeated day count is a typo, and the later row wins", func(t *testing.T) {
		sheet := parsePricingSheet(buildPricingFixture(t, [][]any{{"Days", "Factor"}, {5, 2}, {5, 2.2}}))
		if len(sheet.Factors) != 1 || sheet.Factors[0].Factor != 2.2 {
			t.Fatalf("factors = %+v, want one row at 2.2", sheet.Factors)
		}
		if len(sheet.Warnings) != 1 {
			t.Errorf("warnings = %v, want the duplicate reported", sheet.Warnings)
		}
	})

	t.Run("a workbook with no pricing sheet carries nothing", func(t *testing.T) {
		file := excelize.NewFile()
		defer func() { _ = file.Close() }()
		if sheet := parsePricingSheet(file); sheet.Found {
			t.Errorf("found a pricing sheet in a workbook that has none: %+v", sheet)
		}
	})

	t.Run("the blank generated template carries no table", func(t *testing.T) {
		file, err := BuildInventoryTemplate()
		if err != nil {
			t.Fatalf("build template: %v", err)
		}
		defer func() { _ = file.Close() }()

		sheet := parsePricingSheet(file)
		if !sheet.Found {
			t.Fatal("the template has a Pricing sheet and it was not found")
		}
		// Found, but empty — which is what makes uploading it untouched
		// harmless: a sheet carrying no rows cannot replace a rate card.
		if len(sheet.Factors) != 0 {
			t.Errorf("factors = %+v, want none from a blank template", sheet.Factors)
		}
		if len(sheet.Warnings) != 0 {
			t.Errorf("warnings = %v, want none from a blank template", sheet.Warnings)
		}
		if sheet.VATPercent != nil {
			t.Errorf("vat = %v, want none from a blank template", *sheet.VATPercent)
		}
	})
}

func openRealLLFile(t *testing.T) *excelize.File {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "LL.xlsx"))
	if err != nil {
		t.Skipf("real LL.xlsx not available: %v", err)
	}
	file, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("open real LL.xlsx: %v", err)
	}
	return file
}

func buildPricingFixture(t *testing.T, rows [][]any) *excelize.File {
	t.Helper()
	file := excelize.NewFile()
	t.Cleanup(func() { _ = file.Close() })
	mustNewSheet(t, file, "Pricing")
	for index, row := range rows {
		if len(row) == 0 {
			continue
		}
		cellName, err := excelize.CoordinatesToCellName(1, index+1)
		if err != nil {
			t.Fatalf("cell name: %v", err)
		}
		if err := file.SetSheetRow("Pricing", cellName, &row); err != nil {
			t.Fatalf("write row %d: %v", index+1, err)
		}
	}
	return file
}

func mustNewSheet(t *testing.T, file *excelize.File, name string) {
	t.Helper()
	if _, err := file.NewSheet(name); err != nil {
		t.Fatalf("create sheet %q: %v", name, err)
	}
}

func mustSet(t *testing.T, file *excelize.File, sheet, ref string, value any) {
	t.Helper()
	if err := file.SetCellValue(sheet, ref, value); err != nil {
		t.Fatalf("set %s!%s: %v", sheet, ref, err)
	}
}

func mustFormula(t *testing.T, file *excelize.File, sheet, ref, formula string) {
	t.Helper()
	if err := file.SetCellFormula(sheet, ref, formula); err != nil {
		t.Fatalf("set formula %s!%s: %v", sheet, ref, err)
	}
}
