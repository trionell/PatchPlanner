package service

import (
	"database/sql"
	"fmt"
	"strconv"
	"strings"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
	"github.com/xuri/excelize/v2"
)

type InventoryService struct {
	DB *sql.DB
}

func (s InventoryService) ImportFromXLSX(path string) (domain.InventoryImportResult, error) {
	file, err := excelize.OpenFile(path)
	if err != nil {
		return domain.InventoryImportResult{}, fmt.Errorf("open xlsx: %w", err)
	}
	defer file.Close()

	rows, err := file.GetRows("Prislista LL")
	if err != nil {
		return domain.InventoryImportResult{}, fmt.Errorf("read Prislista LL sheet: %w", err)
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

	if err := db.ReplaceInventory(s.DB, categories, items); err != nil {
		return domain.InventoryImportResult{}, err
	}

	return domain.InventoryImportResult{CategoriesImported: len(categories), ItemsImported: len(items)}, nil
}

func isCategoryHeader(row []string) bool {
	if strings.TrimSpace(cell(row, 0)) == "" || !strings.HasSuffix(strings.TrimSpace(cell(row, 0)), ":") {
		return false
	}
	for idx := 1; idx < len(row); idx++ {
		if strings.TrimSpace(row[idx]) != "" {
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

func atof(value string) float64 {
	value = strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(value, " ", ""), ",", "."))
	if value == "" {
		return 0
	}
	f, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0
	}
	return f
}
