package service

import (
	"bytes"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
	"github.com/xuri/excelize/v2"
)

// priceListSheet is the sheet both the importer and the exporter operate on.
const priceListSheet = "Prislista LL"

// summarySheet is where the price-list file does its own arithmetic: the two
// cells a human types (Rabatt utrustning, Hyresfaktor) and the formulas that
// turn them into a total. Slice 31 both reads it (for the VAT rate, which lives
// only inside a formula) and writes it (the two typed cells).
const summarySheet = "Sammanställning"

// Header texts of the order-quantity columns, compared after normalization
// (the real file's headers contain embedded newlines).
const (
	audioQuantityHeader    = "antal ljud"
	lightingQuantityHeader = "antal ljus"
)

type ExportService struct {
	DB *sql.DB
}

// ErrNoInventoryTemplate signals that the event's bound inventory was not
// populated from an LL price list, so there is no supplier file to write
// quantities into. Slice 22 moved this from "has no stored bytes" to "was
// not imported from a price list": those were the same condition only
// while the LL importer was the only thing that ever stored bytes.
// Fidelity to a supplier's format is earned by having imported it.
var ErrNoInventoryTemplate = errors.New("this inventory was not imported from an LL price list, so it cannot be exported to that format - use the PDF or spreadsheet export instead")

// BuildRentalExport produces a copy of the event's bound inventory's
// stored price-list template with the event's rental quantities written
// into the Antal Ljud / Antal Ljus columns, plus a report of any lines
// that could not be placed. The returned workbook lives in memory until
// written to a response. The caller must Close the returned file.
func (s ExportService) BuildRentalExport(eventID int64) (*excelize.File, domain.RentalExportReport, error) {
	event, err := db.GetEvent(s.DB, eventID)
	if err != nil {
		return nil, domain.RentalExportReport{}, fmt.Errorf("load event: %w", err)
	}
	summary, err := db.GetRentalSummary(s.DB, eventID)
	if err != nil {
		return nil, domain.RentalExportReport{}, err
	}

	inventory, err := db.GetInventory(s.DB, event.InventoryID)
	if err != nil {
		return nil, domain.RentalExportReport{}, fmt.Errorf("load inventory: %w", err)
	}
	sourceXLSX, err := db.GetInventorySourceXLSX(s.DB, event.InventoryID)
	if err != nil {
		return nil, domain.RentalExportReport{}, fmt.Errorf("load inventory template: %w", err)
	}
	// Provenance decides, not the presence of bytes (research.md R1).
	if inventory.SourceFormat != domain.SourceFormatLL || sourceXLSX == nil {
		return nil, domain.RentalExportReport{}, ErrNoInventoryTemplate
	}

	file, err := excelize.OpenReader(bytes.NewReader(sourceXLSX))
	if err != nil {
		return nil, domain.RentalExportReport{}, fmt.Errorf("open price list: %w", err)
	}
	closeOnError := func() { _ = file.Close() }

	rows, err := file.GetRows(priceListSheet, excelize.Options{RawCellValue: true})
	if err != nil {
		closeOnError()
		return nil, domain.RentalExportReport{}, fmt.Errorf("read %s sheet: %w", priceListSheet, err)
	}

	headerRow, audioCol, lightingCol, err := locateQuantityColumns(rows)
	if err != nil {
		closeOnError()
		return nil, domain.RentalExportReport{}, err
	}

	// Clear stale order quantities everywhere below the header so the file
	// carries exactly this event's order (the renter's template ships with
	// leftovers from previously submitted orders).
	for rowIndex := headerRow + 1; rowIndex < len(rows); rowIndex++ {
		for _, col := range []int{audioCol, lightingCol} {
			if strings.TrimSpace(cell(rows[rowIndex], col)) == "" {
				continue
			}
			cellName, err := excelize.CoordinatesToCellName(col+1, rowIndex+1)
			if err != nil {
				closeOnError()
				return nil, domain.RentalExportReport{}, fmt.Errorf("cell name: %w", err)
			}
			if err := file.SetCellValue(priceListSheet, cellName, ""); err != nil {
				closeOnError()
				return nil, domain.RentalExportReport{}, fmt.Errorf("clear stale quantity: %w", err)
			}
		}
	}

	report := domain.RentalExportReport{
		Filename:      exportFilename(event, ".xlsx"),
		UnplacedLines: make([]domain.UnplacedLine, 0),
		PricingNotes:  make([]string, 0),
	}
	for _, line := range summary.Items {
		if line.QuantityAudio == 0 && line.QuantityLighting == 0 {
			continue
		}
		item, err := db.GetInventoryItem(s.DB, line.InventoryItemID)
		if err != nil {
			closeOnError()
			return nil, domain.RentalExportReport{}, err
		}
		if reason := placementProblem(item, rows, headerRow); reason != "" {
			report.UnplacedLines = append(report.UnplacedLines, domain.UnplacedLine{
				InventoryItemID:   line.InventoryItemID,
				InventoryItemName: line.InventoryItemName,
				QuantityAudio:     line.QuantityAudio,
				QuantityLighting:  line.QuantityLighting,
				Reason:            reason,
			})
			continue
		}
		for _, write := range []struct {
			quantity int
			col      int
		}{{line.QuantityAudio, audioCol}, {line.QuantityLighting, lightingCol}} {
			if write.quantity == 0 {
				continue
			}
			cellName, err := excelize.CoordinatesToCellName(write.col+1, item.XLSXRow)
			if err != nil {
				closeOnError()
				return nil, domain.RentalExportReport{}, fmt.Errorf("cell name: %w", err)
			}
			if err := file.SetCellValue(priceListSheet, cellName, write.quantity); err != nil {
				closeOnError()
				return nil, domain.RentalExportReport{}, fmt.Errorf("write quantity: %w", err)
			}
		}
		report.PlacedLines++
	}

	writePricingCells(file, summary.Pricing, &report)
	return file, report, nil
}

// The two cells in Sammanställning that a human types. Everything else on that
// sheet is a formula computing from them.
var (
	discountRowLabel = "rabatt utrustning"
	factorRowLabel   = "hyresfaktor (antal dagar)"
	// The value columns: B is LL Ljud, C is LL Ljus. Both get both values,
	// because Rabatt and Hyresfaktor are per-column in that file and one hire
	// has one of each.
	pricingValueColumns = []int{2, 3}
)

// writePricingCells fills in the discount and the rent factor, and lets the
// supplier's own file compute every figure below them (Slice 31).
//
// This is the whole intervention. We do NOT write a total into someone else's
// spreadsheet, and we do not touch the *1.25 formulas that produce its inc-VAT
// column — filling in the two cells that file was built to have filled is a
// different act from editing its model. If this event's VAT has been overridden
// away from what that file computes, the report says so and names both numbers
// rather than shipping a document that quietly disagrees with the screen.
//
// Failing to place is never fatal: the quantities are already written, the file
// is still worth having, and Principle IV's duty is to REPORT what could not be
// represented, not to refuse.
func writePricingCells(file *excelize.File, pricing domain.RentalPricing, report *domain.RentalExportReport) {
	rows, err := file.GetRows(summarySheet, excelize.Options{RawCellValue: true})
	if err != nil {
		report.PricingNotes = append(report.PricingNotes,
			fmt.Sprintf("this price list has no %q sheet, so the discount and rent factor could not be written into it", summarySheet))
		return
	}

	// Located by row label in column A, never by address — the same rule the
	// quantity columns have followed since Slice 2.
	discountRow, factorRow := 0, 0
	for index, row := range rows {
		switch normalizeHeader(cell(row, 0)) {
		case discountRowLabel:
			discountRow = index + 1
		case factorRowLabel:
			factorRow = index + 1
		}
	}
	if discountRow == 0 || factorRow == 0 {
		report.PricingNotes = append(report.PricingNotes,
			fmt.Sprintf("could not find the %q and %q rows in %q, so this event's pricing was not written into the file - its quantities are correct, but its totals are the file's own",
				"Rabatt utrustning", "Hyresfaktor (Antal dagar)", summarySheet))
		return
	}

	// The file's own formula is `(subtotal - subtotal * B4) * B5`, so the
	// discount goes in as the fraction it multiplies by, not as a percentage.
	for _, column := range pricingValueColumns {
		for _, write := range []struct {
			row   int
			value float64
		}{{discountRow, pricing.DiscountPercent / 100}, {factorRow, pricing.RentFactor}} {
			cellName, err := excelize.CoordinatesToCellName(column, write.row)
			if err != nil {
				report.PricingNotes = append(report.PricingNotes, fmt.Sprintf("could not address a pricing cell: %v", err))
				return
			}
			if err := file.SetCellValue(summarySheet, cellName, write.value); err != nil {
				report.PricingNotes = append(report.PricingNotes, fmt.Sprintf("could not write a pricing cell: %v", err))
				return
			}
		}
	}
	report.PricingPlaced = true

	// The file computes its own inc-VAT column at whatever rate its formulas
	// carry. Where this event says something else, both numbers are named.
	if fileRate, ok := readLLVATPercent(file); ok && !sameRate(fileRate, pricing.VATPercent) {
		report.PricingNotes = append(report.PricingNotes,
			fmt.Sprintf("this event's VAT is %s%%, but the price list computes %s%% - its own formulas are unchanged, so its inc-VAT column follows the file rather than the event",
				trimPercent(pricing.VATPercent), trimPercent(fileRate)))
	}
}

func sameRate(a, b float64) bool {
	diff := a - b
	return diff < 0.005 && diff > -0.005
}

// placementProblem returns the unplaced reason for an item, or "" when its
// quantities can be written safely.
func placementProblem(item domain.InventoryItem, rows [][]string, headerRow int) string {
	if item.Discontinued {
		return domain.UnplacedDiscontinued
	}
	if item.XLSXRow <= headerRow+1 || item.XLSXRow > len(rows) {
		return domain.UnplacedNoRow
	}
	nameInSheet := strings.TrimSpace(cell(rows[item.XLSXRow-1], 0))
	if !strings.EqualFold(nameInSheet, strings.TrimSpace(item.Name)) {
		return domain.UnplacedRowMismatch
	}
	return ""
}

// locateQuantityColumns finds the header row and the 0-based column indices
// of the Antal Ljud / Antal Ljus columns by normalized header text.
func locateQuantityColumns(rows [][]string) (headerRow, audioCol, lightingCol int, err error) {
	audioCol, lightingCol = -1, -1
	for rowIndex, row := range rows {
		for colIndex, value := range row {
			switch normalizeHeader(value) {
			case audioQuantityHeader:
				headerRow, audioCol = rowIndex, colIndex
			case lightingQuantityHeader:
				lightingCol = colIndex
			}
		}
		if audioCol >= 0 && lightingCol >= 0 {
			return headerRow, audioCol, lightingCol, nil
		}
	}
	return 0, 0, 0, fmt.Errorf("price list is missing the %q/%q columns", "Antal Ljud", "Antal Ljus")
}

// normalizeHeader collapses all whitespace (including newlines) to single
// spaces and lowercases, so "Antal \nLjud" matches "antal ljud".
func normalizeHeader(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(value), " "))
}

var unsafeFilenameChars = regexp.MustCompile(`[^\p{L}\p{N} ._-]+`)

// exportFilename builds "Hyrorder - {event}[ - {date}]{suffix}" with
// characters unsafe in filenames replaced. suffix carries the extension and
// any disambiguator, e.g. ".pdf" or " (lista).xlsx" — the generic
// spreadsheet needs the latter so it does not collide with the price-list
// export in a downloads folder when an LL user takes both.
func exportFilename(event domain.Event, suffix string) string {
	name := unsafeFilenameChars.ReplaceAllString(event.Name, "_")
	if name == "" {
		name = fmt.Sprintf("Event %d", event.ID)
	}
	if date := strings.TrimSpace(event.StartDate); date != "" {
		name += " - " + unsafeFilenameChars.ReplaceAllString(date, "_")
	}
	return "Hyrorder - " + name + suffix
}
