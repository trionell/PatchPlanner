package service

import (
	"fmt"
	"strings"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
	"github.com/xuri/excelize/v2"
)

// rentalSheet is the sheet the generic rental order is written to.
const rentalSheet = "Rental order"

var rentalXLSXHeaders = []string{
	"Category", "Item", "Description", "Audio", "Lighting", "Total", "Unit price", "Subtotal",
}

var rentalXLSXWidths = []float64{20, 30, 34, 10, 10, 10, 14, 14}

// BuildGenericRentalXLSX writes the event's rental order as a plain
// spreadsheet, grouped by category with a totals row. Available for any
// inventory however it was populated, for suppliers who would rather edit
// numbers than read a document.
//
// This is an order document, not a catalog format: it deliberately does
// not round-trip through ImportFromGenericXLSX, whose columns mean
// something else entirely.
//
// The caller must Close the returned file.
func (s ExportService) BuildGenericRentalXLSX(eventID int64) (*excelize.File, string, error) {
	event, err := db.GetEvent(s.DB, eventID)
	if err != nil {
		return nil, "", fmt.Errorf("load event: %w", err)
	}
	summary, err := db.GetRentalSummary(s.DB, eventID)
	if err != nil {
		return nil, "", err
	}

	file := excelize.NewFile()
	if err := file.SetSheetName(file.GetSheetName(0), rentalSheet); err != nil {
		_ = file.Close()
		return nil, "", fmt.Errorf("name rental sheet: %w", err)
	}

	headerStyle, err := file.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	if err != nil {
		_ = file.Close()
		return nil, "", fmt.Errorf("create header style: %w", err)
	}

	for index, header := range rentalXLSXHeaders {
		cell, err := excelize.CoordinatesToCellName(index+1, 1)
		if err != nil {
			_ = file.Close()
			return nil, "", fmt.Errorf("header cell name: %w", err)
		}
		if err := file.SetCellValue(rentalSheet, cell, header); err != nil {
			_ = file.Close()
			return nil, "", fmt.Errorf("write header: %w", err)
		}
		if err := file.SetCellStyle(rentalSheet, cell, cell, headerStyle); err != nil {
			_ = file.Close()
			return nil, "", fmt.Errorf("style header: %w", err)
		}
		column, err := excelize.ColumnNumberToName(index + 1)
		if err != nil {
			_ = file.Close()
			return nil, "", fmt.Errorf("column name: %w", err)
		}
		if err := file.SetColWidth(rentalSheet, column, column, rentalXLSXWidths[index]); err != nil {
			_ = file.Close()
			return nil, "", fmt.Errorf("set column width: %w", err)
		}
	}
	if err := file.SetPanes(rentalSheet, &excelize.Panes{
		Freeze: true, YSplit: 1, TopLeftCell: "A2", ActivePane: "bottomLeft",
	}); err != nil {
		_ = file.Close()
		return nil, "", fmt.Errorf("freeze header row: %w", err)
	}

	// Grouped by category to match the PDF, so the two documents describe
	// the same order in the same order.
	row := 2
	for _, group := range groupRentalByCategory(summary.Items) {
		for _, line := range group.Lines {
			values := []any{
				group.Name,
				line.InventoryItemName,
				line.Description,
				blankIfZero(line.QuantityAudio),
				blankIfZero(line.QuantityLighting),
				line.TotalQuantity,
				line.PriceExVAT,
				line.SubtotalExVAT,
			}
			if err := writeRentalRow(file, row, values); err != nil {
				_ = file.Close()
				return nil, "", err
			}
			row++
		}
	}

	totalRow := row + 1
	totals := []any{"TOTAL, PER DAY", "", "", "", "", summary.TotalQuantity, "", summary.SubtotalExVAT}
	if err := writeRentalRow(file, totalRow, totals); err != nil {
		_ = file.Close()
		return nil, "", err
	}
	if err := boldRentalRow(file, totalRow, headerStyle); err != nil {
		_ = file.Close()
		return nil, "", err
	}

	// The ledger (Slice 31), as rows in the same columns — values rather than
	// formulas, because this is an order document and a supplier who edits the
	// quantities is editing a list, not running a model.
	pricing := summary.Pricing
	ledger := [][]any{}
	if pricing.DiscountPercent > 0 {
		ledger = append(ledger, []any{"Discount", trimPercent(pricing.DiscountPercent) + "%", "", "", "", "", "", -pricing.DiscountAmount})
	}
	ledger = append(ledger,
		[]any{"Billed days", pricing.BilledDays, xlsxBilledDaysNote(pricing), "", "", "", "", ""},
		[]any{"Rent factor", pricing.RentFactor, xlsxFactorNote(pricing), "", "", "", "", ""},
		[]any{fmt.Sprintf("TOTAL, %s", plural(pricing.BilledDays, "DAY", "DAYS")), "", "", "", "", "", "", pricing.TotalExVAT},
		[]any{"VAT", trimPercent(pricing.VATPercent) + "%", "", "", "", "", "", pricing.VATAmount},
		[]any{"TOTAL, INC VAT", "", "", "", "", "", "", pricing.TotalIncVAT},
	)
	for index, values := range ledger {
		ledgerRow := totalRow + 1 + index
		if err := writeRentalRow(file, ledgerRow, values); err != nil {
			_ = file.Close()
			return nil, "", err
		}
		if label, _ := values[0].(string); strings.HasPrefix(label, "TOTAL") {
			if err := boldRentalRow(file, ledgerRow, headerStyle); err != nil {
				_ = file.Close()
				return nil, "", err
			}
		}
	}

	// " (lista)" keeps this from colliding with the price-list export in a
	// downloads folder when an LL user takes both.
	return file, exportFilename(event, " (lista).xlsx"), nil
}

func boldRentalRow(file *excelize.File, row, headerStyle int) error {
	first, err := excelize.CoordinatesToCellName(1, row)
	if err != nil {
		return fmt.Errorf("total cell name: %w", err)
	}
	last, err := excelize.CoordinatesToCellName(len(rentalXLSXHeaders), row)
	if err != nil {
		return fmt.Errorf("total cell name: %w", err)
	}
	if err := file.SetCellStyle(rentalSheet, first, last, headerStyle); err != nil {
		return fmt.Errorf("style totals row: %w", err)
	}
	return nil
}

// The two notes name where the numbers came from, so a supplier can check them
// against their own rate card rather than taking them on trust.
func xlsxBilledDaysNote(pricing domain.RentalPricing) string {
	rule := "on-site days"
	if pricing.ChargedDays == domain.ChargedDaysShow {
		rule = "show days"
	}
	if pricing.FirstDay == "" || pricing.LastDay == "" {
		return rule
	}
	return fmt.Sprintf("%s, %s → %s", rule, pricing.FirstDay, pricing.LastDay)
}

func xlsxFactorNote(pricing domain.RentalPricing) string {
	switch pricing.RentFactorSource {
	case domain.SourceOverride:
		return "agreed for this hire"
	case domain.SourceNone:
		return "no rate card"
	default:
		if pricing.RentFactorDays == pricing.BilledDays {
			return fmt.Sprintf("the %d-day rate", pricing.RentFactorDays)
		}
		return fmt.Sprintf("the %d-day rate, for %d days", pricing.RentFactorDays, pricing.BilledDays)
	}
}

func writeRentalRow(file *excelize.File, row int, values []any) error {
	for index, value := range values {
		cell, err := excelize.CoordinatesToCellName(index+1, row)
		if err != nil {
			return fmt.Errorf("cell name: %w", err)
		}
		if err := file.SetCellValue(rentalSheet, cell, value); err != nil {
			return fmt.Errorf("write cell: %w", err)
		}
	}
	return nil
}

// blankIfZero leaves the audio/lighting split readable at a glance rather
// than filling both columns with zeros.
func blankIfZero(quantity int) any {
	if quantity == 0 {
		return ""
	}
	return quantity
}
