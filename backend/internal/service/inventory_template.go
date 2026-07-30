package service

import (
	"fmt"

	"github.com/xuri/excelize/v2"
)

// TemplateFilename is what the browser saves the blank template as.
const TemplateFilename = "PatchPlanner inventory template.xlsx"

// templateExampleSheet holds worked examples and instructions. It is a
// separate sheet on purpose: ImportFromGenericXLSX prefers the "Inventory"
// sheet, so sample rows here can never be imported as real catalog items
// if a user uploads the template untouched.
const templateExampleSheet = "Example"

// templatePricingSheet is the optional third sheet (Slice 31): a supplier's rate
// card, and their VAT rate.
//
// It ships with its labels and NO VALUES, which is what makes uploading the
// template untouched harmless — a sheet carrying no rows carries no table, and a
// table it does not carry it cannot replace. Unlike the Example sheet, this one
// IS read, which is exactly why it must not contain sample numbers.
const templatePricingSheet = "Pricing"

// templateExamples are the sample rows, chosen to cover all three common
// equipment types and to show a stagebox description in the "32/16" shape
// the stagebox channel parser understands.
var templateExamples = [][]any{
	{"Microphones", "audio", "Shure SM58", "Dynamic vocal mic", 12, 120},
	{"Microphones", "audio", "Shure Beta 91A", "Boundary kick mic", 2, 250},
	{"Mixers", "audio", "Behringer X32", "32ch digital", 1, 1800},
	{"Stageboxes", "audio", "Behringer S32", "32/16 stagebox", 2, 600},
	{"Moving heads", "lighting", "Robe Pointe", "20ch / 24ch modes", 8, 900},
	{"Truss", "rigging", "Prolyte H30V 2m", "Triangle truss 2m", 10, 150},
}

var templateInstructions = []string{
	"How to use this template",
	"",
	"1. Fill in the \"Inventory\" sheet, one piece of equipment per row.",
	"2. Category is your own grouping (e.g. Microphones, Moving heads).",
	"   It is created automatically the first time you use it.",
	"3. Type must be one of: audio, lighting, rigging, video, misc.",
	"   It decides which planning dropdowns the item shows up in.",
	"4. Quantity is how many the supplier has. Price is per item, excluding VAT.",
	"5. Category and Name are required. Everything else is optional.",
	"6. Extra columns of your own are ignored - keep whatever notes you like.",
	"7. Upload the file on the inventory page. Re-uploading updates the catalog",
	"   without breaking anything you have already planned.",
	"",
	"The rows above are examples only. This sheet is never imported -",
	"only the \"Inventory\" and \"Pricing\" sheets are read.",
	"",
	"The \"Pricing\" sheet is optional.",
	"",
	"1. VAT % is the rate this supplier charges, e.g. 25.",
	"2. Days / Factor is the supplier's rate card: hire for that many days",
	"   and the day rate is multiplied by that much. A five-day hire at 2.2",
	"   costs 2.2 times the one-day price, not five times.",
	"3. Gaps are fine. A hire longer than a row but shorter than the next one",
	"   is charged at the row below it - 17 days on a card that jumps 14 to 21",
	"   is charged at the 14-day factor.",
	"4. Filling in nothing leaves your existing pricing exactly as it is.",
	"   Filling in any Days/Factor rows replaces the whole card.",
}

// templateColumnWidths sizes each column to its content so the file is
// usable the moment it opens, without the user dragging column edges.
var templateColumnWidths = []float64{18, 12, 28, 32, 10, 14}

// BuildInventoryTemplate generates the blank generic-format template.
//
// It is generated rather than checked in so it cannot drift away from what
// ImportFromGenericXLSX accepts (FR-014) — a static fixture would silently
// become invalid the first time a header alias changed, and nobody would
// notice until a user's upload was rejected. TestTemplateRoundTrip is what
// actually enforces this.
//
// The caller must Close the returned file.
func BuildInventoryTemplate() (*excelize.File, error) {
	file := excelize.NewFile()

	// NewFile starts with "Sheet1"; rename it rather than adding a sheet
	// and deleting the default, so the template has exactly two sheets in
	// a predictable order.
	if err := file.SetSheetName(file.GetSheetName(0), genericSheet); err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("name inventory sheet: %w", err)
	}
	if _, err := file.NewSheet(templatePricingSheet); err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("create pricing sheet: %w", err)
	}
	if _, err := file.NewSheet(templateExampleSheet); err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("create example sheet: %w", err)
	}

	headerStyle, err := file.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	if err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("create header style: %w", err)
	}

	for _, sheet := range []string{genericSheet, templateExampleSheet} {
		if err := writeTemplateHeader(file, sheet, headerStyle); err != nil {
			_ = file.Close()
			return nil, err
		}
	}

	// A drop-list on Type removes the single most likely user error — a
	// mistyped equipment type — at the point of entry rather than at
	// upload time. Column B, rows 2..1000.
	validation := excelize.NewDataValidation(true)
	validation.Sqref = "B2:B1000"
	if err := validation.SetDropList(genericTypes); err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("build type drop-list: %w", err)
	}
	validation.SetError(excelize.DataValidationErrorStyleStop, "Invalid type",
		"Type must be one of: "+joinTypes())
	if err := file.AddDataValidation(genericSheet, validation); err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("add type drop-list: %w", err)
	}

	// Freeze the header row so it stays visible while scrolling a long list.
	if err := file.SetPanes(genericSheet, &excelize.Panes{
		Freeze:      true,
		Split:       false,
		XSplit:      0,
		YSplit:      1,
		TopLeftCell: "A2",
		ActivePane:  "bottomLeft",
	}); err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("freeze header row: %w", err)
	}

	for rowIndex, example := range templateExamples {
		for colIndex, value := range example {
			cellName, err := excelize.CoordinatesToCellName(colIndex+1, rowIndex+2)
			if err != nil {
				_ = file.Close()
				return nil, fmt.Errorf("example cell name: %w", err)
			}
			if err := file.SetCellValue(templateExampleSheet, cellName, value); err != nil {
				_ = file.Close()
				return nil, fmt.Errorf("write example cell: %w", err)
			}
		}
	}

	if err := writePricingSheet(file, headerStyle); err != nil {
		_ = file.Close()
		return nil, err
	}

	instructionsStart := len(templateExamples) + 4
	for offset, line := range templateInstructions {
		cellName, err := excelize.CoordinatesToCellName(1, instructionsStart+offset)
		if err != nil {
			_ = file.Close()
			return nil, fmt.Errorf("instruction cell name: %w", err)
		}
		if err := file.SetCellValue(templateExampleSheet, cellName, line); err != nil {
			_ = file.Close()
			return nil, fmt.Errorf("write instruction line: %w", err)
		}
	}

	file.SetActiveSheet(0)
	return file, nil
}

// writePricingSheet lays out the optional rate card: a labelled VAT row, a blank
// line, and the Days/Factor heading with nothing under it.
//
// Labels and no values, deliberately. The parser finds both by their text rather
// than by position, so a user may add rows, widen columns or write notes beside
// them and the file still reads — and an untouched upload changes no pricing at
// all.
func writePricingSheet(file *excelize.File, headerStyle int) error {
	// Every explanatory line goes ABOVE the Days/Factor heading, and nothing at
	// all goes below it. Everything under that heading is read as a rate-card
	// row, so a helpful note written there would import as a malformed one —
	// which is what TestTemplateRoundTrip caught the first time this was
	// written, and the reason that test exists.
	cells := []struct {
		ref   string
		value any
		bold  bool
	}{
		{"A1", "VAT %", true},
		{"A3", "Fill nothing in here and this sheet changes no pricing.", false},
		{"A4", "Days / Factor is the rate card: hire that many days, multiply the day rate by that much.", false},
		{"A5", "Rows may be in any order. Anything you enter below replaces the whole card.", false},
		{"A7", "Days", true},
		{"B7", "Factor", true},
	}
	for _, item := range cells {
		if err := file.SetCellValue(templatePricingSheet, item.ref, item.value); err != nil {
			return fmt.Errorf("write pricing cell %s: %w", item.ref, err)
		}
		if item.bold {
			if err := file.SetCellStyle(templatePricingSheet, item.ref, item.ref, headerStyle); err != nil {
				return fmt.Errorf("style pricing cell %s: %w", item.ref, err)
			}
		}
	}
	for _, column := range []string{"A", "B"} {
		if err := file.SetColWidth(templatePricingSheet, column, column, 22); err != nil {
			return fmt.Errorf("set pricing column width: %w", err)
		}
	}
	return nil
}

func writeTemplateHeader(file *excelize.File, sheet string, headerStyle int) error {
	for index, column := range genericColumns {
		cellName, err := excelize.CoordinatesToCellName(index+1, 1)
		if err != nil {
			return fmt.Errorf("header cell name: %w", err)
		}
		if err := file.SetCellValue(sheet, cellName, column.label); err != nil {
			return fmt.Errorf("write header: %w", err)
		}
		if err := file.SetCellStyle(sheet, cellName, cellName, headerStyle); err != nil {
			return fmt.Errorf("style header: %w", err)
		}
		columnName, err := excelize.ColumnNumberToName(index + 1)
		if err != nil {
			return fmt.Errorf("column name: %w", err)
		}
		if err := file.SetColWidth(sheet, columnName, columnName, templateColumnWidths[index]); err != nil {
			return fmt.Errorf("set column width: %w", err)
		}
	}
	return nil
}

func joinTypes() string {
	out := ""
	for i, t := range genericTypes {
		if i > 0 {
			out += ", "
		}
		out += t
	}
	return out
}
