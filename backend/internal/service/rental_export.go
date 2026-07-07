package service

import (
	"database/sql"
	"fmt"
	"regexp"
	"strings"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
	"github.com/xuri/excelize/v2"
)

// priceListSheet is the sheet both the importer and the exporter operate on.
const priceListSheet = "Prislista LL"

// Header texts of the order-quantity columns, compared after normalization
// (the real file's headers contain embedded newlines).
const (
	audioQuantityHeader    = "antal ljud"
	lightingQuantityHeader = "antal ljus"
)

type ExportService struct {
	DB *sql.DB
}

// BuildRentalExport produces a copy of the price-list workbook at sourcePath
// with the event's rental quantities written into the Antal Ljud / Antal
// Ljus columns, plus a report of any lines that could not be placed. The
// source file is opened read-only; the returned workbook lives in memory
// until written to a response. The caller must Close the returned file.
func (s ExportService) BuildRentalExport(eventID int64, sourcePath string) (*excelize.File, domain.RentalExportReport, error) {
	event, err := db.GetEvent(s.DB, eventID)
	if err != nil {
		return nil, domain.RentalExportReport{}, fmt.Errorf("load event: %w", err)
	}
	summary, err := db.GetRentalSummary(s.DB, eventID)
	if err != nil {
		return nil, domain.RentalExportReport{}, err
	}

	file, err := excelize.OpenFile(sourcePath)
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
		Filename:      exportFilename(event),
		UnplacedLines: make([]domain.UnplacedLine, 0),
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

	return file, report, nil
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

// exportFilename builds "Hyrorder - {event}[ - {date}].xlsx" with characters
// unsafe in filenames replaced.
func exportFilename(event domain.Event) string {
	name := unsafeFilenameChars.ReplaceAllString(event.Name, "_")
	if name == "" {
		name = fmt.Sprintf("Event %d", event.ID)
	}
	if date := strings.TrimSpace(event.Date); date != "" {
		name += " - " + unsafeFilenameChars.ReplaceAllString(date, "_")
	}
	return "Hyrorder - " + name + ".xlsx"
}
