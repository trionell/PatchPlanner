package service

import (
	"bytes"
	"fmt"
	"io"
	"strings"

	"github.com/trionell/patchplanner/internal/domain"
	"github.com/xuri/excelize/v2"
)

// Import parses an uploaded spreadsheet into inventoryID's catalog,
// working out for itself which of the supported formats it is. Users
// should not have to classify their own file before uploading it — they
// have one spreadsheet and one Import button.
//
// The detected format is reported back on the result, so the UI can
// confirm what it did rather than leaving the user to guess.
func (s InventoryService) Import(inventoryID int64, filename string, r io.Reader) (domain.InventoryImportResult, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return domain.InventoryImportResult{}, fmt.Errorf("read xlsx: %w", err)
	}

	format, err := detectInventoryFormat(data)
	if err != nil {
		return domain.InventoryImportResult{}, err
	}

	// Re-reading the bytes costs one extra parse of a ~100KB file, which
	// buys keeping both importers exactly as they are — each still owns
	// its whole pipeline, and neither had to grow a "maybe already
	// parsed" branch.
	var result domain.InventoryImportResult
	switch format {
	case domain.SourceFormatLL:
		result, err = s.ImportFromXLSX(inventoryID, filename, bytes.NewReader(data))
	default:
		result, err = s.ImportFromGenericXLSX(inventoryID, filename, bytes.NewReader(data))
	}
	if err != nil {
		return domain.InventoryImportResult{}, err
	}
	result.Format = format
	return result, nil
}

// detectInventoryFormat decides which importer an uploaded workbook
// belongs to.
//
// The price-list check is a sheet-name check because that is precisely
// what the price-list importer requires: it reads the "Prislista LL"
// sheet by name and fails without it. So "has that sheet" and "the LL
// importer can handle this" are the same statement, which is what makes
// this detection honest rather than a guess.
//
// The generic check then asks the generic parser's own column locator
// whether it can find what it needs. Neither check duplicates parsing
// rules that live elsewhere.
func detectInventoryFormat(data []byte) (string, error) {
	file, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		return "", ImportValidationError{Problems: []string{
			"this file could not be read as a spreadsheet - it must be a .xlsx file",
		}}
	}
	defer func() { _ = file.Close() }()

	for _, sheet := range file.GetSheetList() {
		if strings.EqualFold(sheet, priceListSheet) {
			return domain.SourceFormatLL, nil
		}
	}

	sheet, err := resolveGenericSheet(file)
	if err != nil {
		return "", err
	}
	rows, err := file.GetRows(sheet, excelize.Options{RawCellValue: true})
	if err != nil {
		return "", fmt.Errorf("read %s sheet: %w", sheet, err)
	}
	if _, _, err := locateGenericColumns(rows); err == nil {
		return domain.SourceFormatGeneric, nil
	}

	// Neither shape matched. Describe both, since the user cannot see
	// which test failed.
	return "", ImportValidationError{Problems: []string{
		fmt.Sprintf("this file matches neither supported format: an LL price list needs a %q sheet, "+
			"and a generic list needs %q and %q column headings - download the template for the expected layout",
			priceListSheet, "Category", "Name"),
	}}
}
