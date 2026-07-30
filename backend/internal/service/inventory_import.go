package service

import (
	"bytes"
	"database/sql"
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
	"github.com/xuri/excelize/v2"
)

type InventoryService struct {
	DB *sql.DB
}

// ImportFromXLSX parses a price-list spreadsheet and upserts its contents
// into inventoryID's catalog, then stores the raw file itself as the
// inventory's template so a later rental export has something to write
// quantities into (research.md R2). Takes an io.Reader (research.md R1) —
// the per-inventory upload replaces the old single-fixed-file-path design.
func (s InventoryService) ImportFromXLSX(inventoryID int64, filename string, r io.Reader) (domain.InventoryImportResult, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return domain.InventoryImportResult{}, fmt.Errorf("read xlsx: %w", err)
	}
	file, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		return domain.InventoryImportResult{}, fmt.Errorf("open xlsx: %w", err)
	}
	defer file.Close()

	// Raw cell values: the price columns are number-formatted ("550.0 kr",
	// "1,750.0 kr"), which formatted reads turn into unparseable strings.
	rows, err := file.GetRows(priceListSheet, excelize.Options{RawCellValue: true})
	if err != nil {
		return domain.InventoryImportResult{}, fmt.Errorf("read %s sheet: %w", priceListSheet, err)
	}

	categories := make([]domain.InventoryCategory, 0)
	items := make([]domain.InventoryItem, 0)
	currentCategory := ""
	seenCategories := map[string]bool{}

	for rowIndex, row := range rows {
		if len(row) == 0 {
			continue
		}
		name := strings.TrimSpace(cell(row, 0))
		if name == "" {
			continue
		}
		if rowIndex == 0 || strings.EqualFold(name, "Beskrivning") {
			continue
		}
		if isCategoryHeader(row) {
			currentCategory = strings.TrimSuffix(name, ":")
			if !seenCategories[currentCategory] {
				categories = append(categories, domain.InventoryCategory{Name: currentCategory, CategoryType: mapCategoryType(currentCategory)})
				seenCategories[currentCategory] = true
			}
			continue
		}
		if currentCategory == "" || strings.EqualFold(name, "Beskrivning") {
			continue
		}
		quantity := atoi(cell(row, 2))
		price := atof(cell(row, 3))
		items = append(items, domain.InventoryItem{
			CategoryName:      currentCategory,
			Name:              name,
			Description:       strings.TrimSpace(cell(row, 1)),
			QuantityAvailable: quantity,
			PriceExVAT:        price,
			XLSXRow:           rowIndex + 1,
		})
	}

	if err := db.UpsertInventory(s.DB, inventoryID, categories, items); err != nil {
		return domain.InventoryImportResult{}, err
	}
	if err := db.SetInventorySource(s.DB, inventoryID, data, filename, domain.SourceFormatLL); err != nil {
		return domain.InventoryImportResult{}, err
	}

	// The price list's other two sheets, which this importer ignored until
	// Slice 31: the rate card, and the VAT rate hidden in a formula.
	warnings, err := s.importPricing(inventoryID, file)
	if err != nil {
		return domain.InventoryImportResult{}, err
	}

	return domain.InventoryImportResult{
		CategoriesImported: len(categories),
		ItemsImported:      len(items),
		Warnings:           warnings,
	}, nil
}

// importPricing applies whatever the file itself said about pricing — its rate
// card and its VAT rate — and nothing else. It never reads a user's defaults:
// those are copied when a catalog is created, and an import that re-applied them
// would silently undo the edit the catalog's own drawer exists to allow.
//
// A file carrying no rate card leaves the existing one alone, which is what
// makes the blank generated template harmless. Every problem is a warning; the
// catalog's items have already been written by the time this runs, and a
// malformed factor row is not worth failing an import over (FR-007).
func (s InventoryService) importPricing(inventoryID int64, file *excelize.File) ([]string, error) {
	sheet := parsePricingSheet(file)
	warnings := sheet.Warnings

	if len(sheet.Factors) > 0 {
		if err := db.ReplaceRentFactors(s.DB, inventoryID, sheet.Factors); err != nil {
			return nil, err
		}
	}

	// The generic format states VAT on the pricing sheet; LL states it only
	// inside a formula. Whichever the file used, the file wins.
	rate, found := sheet.VATPercent, sheet.VATPercent != nil
	if !found {
		if llRate, ok := readLLVATPercent(file); ok {
			rate, found = &llRate, true
		}
	}
	if found {
		if err := db.SetInventoryVATPercent(s.DB, inventoryID, *rate); err != nil {
			return nil, err
		}
		// The only place a catalog's VAT provenance is ever reported. Nothing
		// stores it, so no drawer can go on claiming "from the file" after
		// somebody has edited the field.
		warnings = append(warnings, fmt.Sprintf("VAT %s%% read from the file", trimPercent(*rate)))
	}
	return warnings, nil
}

// trimPercent renders 25 as "25" and 12.5 as "12.5", so the note reads the way a
// person would say it.
func trimPercent(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}

// isCategoryHeader recognizes rows like "Mikrofoner:" — a name ending in a
// colon with no description, stock count, or prices (columns B–E). Columns F
// onward are the order-quantity columns, which may hold leftover values from
// a previously submitted order, so they are deliberately ignored.
func isCategoryHeader(row []string) bool {
	if strings.TrimSpace(cell(row, 0)) == "" || !strings.HasSuffix(strings.TrimSpace(cell(row, 0)), ":") {
		return false
	}
	for idx := 1; idx <= 4; idx++ {
		if strings.TrimSpace(cell(row, idx)) != "" {
			return false
		}
	}
	return true
}

func mapCategoryType(category string) string {
	name := strings.ToLower(category)
	switch {
	case strings.Contains(name, "ljus") ||
		strings.Contains(name, "armatur") ||
		strings.Contains(name, "dmx") ||
		strings.Contains(name, "rök") ||
		strings.Contains(name, "dimmer"):
		return "lighting"
	case strings.Contains(name, "stativ") ||
		strings.Contains(name, "tross") ||
		strings.Contains(name, "lyftutrustning") ||
		strings.Contains(name, "tyger"):
		return "rigging"
	default:
		return "audio"
	}
}

func cell(row []string, index int) string {
	if index >= len(row) {
		return ""
	}
	return row[index]
}

func atoi(value string) int {
	value = strings.TrimSpace(strings.ReplaceAll(value, ",", "."))
	if value == "" {
		return 0
	}
	f, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0
	}
	return int(f)
}

// atof parses price cells defensively: raw values are plain numbers, but
// stray text cells may carry currency suffixes ("550 kr", "550:-"), spaces
// (including non-breaking), or a comma decimal separator.
func atof(value string) float64 {
	value = strings.ToLower(strings.TrimSpace(value))
	for _, junk := range []string{"kr", ":-", " ", " "} {
		value = strings.ReplaceAll(value, junk, "")
	}
	// A comma alongside a dot is a thousands separator; a lone comma is a
	// decimal separator.
	if strings.Contains(value, ",") && strings.Contains(value, ".") {
		value = strings.ReplaceAll(value, ",", "")
	} else {
		value = strings.ReplaceAll(value, ",", ".")
	}
	if value == "" {
		return 0
	}
	f, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0
	}
	return f
}
