package service

import (
	"bytes"
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
	"github.com/xuri/excelize/v2"
)

// genericSheet is the sheet the generic importer prefers. When a workbook
// has no sheet by this name the first sheet is used instead — users paste
// a supplier's list into whatever workbook they have, and its sheet is as
// likely to be called "Sheet1" or "Blad1" as anything else.
const genericSheet = "Inventory"

// Equipment types a category may carry. This is the existing
// inventory_categories.category_type CHECK constraint; planning dropdowns
// key on these values, which is why the set is fixed while category names
// are free-form.
var genericTypes = []string{"audio", "lighting", "rigging", "video", "misc"}

// defaultGenericType is used for rows that leave Type blank. Audio is the
// safe default: it is by far the largest category type in practice, and a
// wrong guess is visible and fixable in the UI rather than silent.
const defaultGenericType = "audio"

// genericColumn identifies one recognised column and the headers that map
// to it. Columns are matched by normalized header text rather than
// position, so users can reorder them and keep working columns of their
// own (FR-002, FR-003).
type genericColumn struct {
	field    string
	label    string // as written in the template, for error messages
	aliases  []string
	required bool
}

var genericColumns = []genericColumn{
	{field: "category", label: "Category", aliases: []string{"category"}, required: true},
	{field: "type", label: "Type", aliases: []string{"type", "category type"}},
	{field: "name", label: "Name", aliases: []string{"name", "item"}, required: true},
	{field: "description", label: "Description", aliases: []string{"description", "comment"}},
	{field: "quantity", label: "Quantity", aliases: []string{"quantity", "qty", "available"}},
	{field: "price", label: "Price (ex VAT)", aliases: []string{"price", "price ex vat", "price (ex vat)"}},
}

// ImportValidationError carries every problem found in an uploaded file,
// so a user fixing a 200-row sheet sees all of them at once instead of
// discovering them one upload at a time. Its presence means nothing was
// written: validation completes before any database work begins (FR-005,
// SC-003).
type ImportValidationError struct {
	Problems []string
}

func (e ImportValidationError) Error() string {
	return strings.Join(e.Problems, "; ")
}

// ImportFromGenericXLSX parses the supplier-agnostic spreadsheet format
// into inventoryID's catalog. It reuses db.UpsertInventory, so it inherits
// the same non-destructive semantics as the price-list import: matched
// items keep their identity and every plan reference, absent items are
// flagged discontinued rather than deleted, and the whole thing is one
// transaction.
//
// Unlike the price-list import it stores no copy of the uploaded file —
// there is no supplier template to write quantities back into, so only the
// filename is kept, for display.
func (s InventoryService) ImportFromGenericXLSX(inventoryID int64, filename string, r io.Reader) (domain.InventoryImportResult, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return domain.InventoryImportResult{}, fmt.Errorf("read xlsx: %w", err)
	}
	file, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		return domain.InventoryImportResult{}, fmt.Errorf("open xlsx: %w", err)
	}
	defer file.Close()

	sheet, err := resolveGenericSheet(file)
	if err != nil {
		return domain.InventoryImportResult{}, err
	}
	rows, err := file.GetRows(sheet, excelize.Options{RawCellValue: true})
	if err != nil {
		return domain.InventoryImportResult{}, fmt.Errorf("read %s sheet: %w", sheet, err)
	}

	headerRow, columns, err := locateGenericColumns(rows)
	if err != nil {
		return domain.InventoryImportResult{}, err
	}

	categories, items, warnings, problems := parseGenericRows(rows, headerRow, columns)
	if len(problems) > 0 {
		return domain.InventoryImportResult{}, ImportValidationError{Problems: problems}
	}

	if err := db.UpsertInventory(s.DB, inventoryID, categories, items); err != nil {
		return domain.InventoryImportResult{}, err
	}
	if err := db.SetInventorySource(s.DB, inventoryID, nil, filename, domain.SourceFormatGeneric); err != nil {
		return domain.InventoryImportResult{}, err
	}

	// The optional Pricing sheet, on the same terms as the LL importer's: the
	// file's own rate card and VAT rate, or nothing at all (Slice 31).
	pricingWarnings, err := s.importPricing(inventoryID, file)
	if err != nil {
		return domain.InventoryImportResult{}, err
	}
	warnings = append(warnings, pricingWarnings...)

	return domain.InventoryImportResult{
		CategoriesImported: len(categories),
		ItemsImported:      len(items),
		Warnings:           warnings,
	}, nil
}

// resolveGenericSheet prefers the "Inventory" sheet and falls back to the
// workbook's first sheet.
func resolveGenericSheet(file *excelize.File) (string, error) {
	for _, name := range file.GetSheetList() {
		if strings.EqualFold(name, genericSheet) {
			return name, nil
		}
	}
	if first := file.GetSheetName(0); first != "" {
		return first, nil
	}
	return "", ImportValidationError{Problems: []string{"the workbook has no sheets"}}
}

// locateGenericColumns finds the header row and maps each recognised field
// to its 0-based column index. The header row is the first row in which
// both required columns appear, so a sheet with a title or notes above the
// table still imports.
func locateGenericColumns(rows [][]string) (int, map[string]int, error) {
	for rowIndex, row := range rows {
		columns := make(map[string]int)
		for colIndex, value := range row {
			header := normalizeHeader(value)
			if header == "" {
				continue
			}
			for _, column := range genericColumns {
				if _, taken := columns[column.field]; taken {
					continue
				}
				for _, alias := range column.aliases {
					if header == alias {
						columns[column.field] = colIndex
						break
					}
				}
			}
		}
		_, hasCategory := columns["category"]
		_, hasName := columns["name"]
		if hasCategory && hasName {
			return rowIndex, columns, nil
		}
	}

	// Nothing usable anywhere. Report which required columns are missing
	// rather than a bare "bad file", since the fix is usually one heading.
	missing := make([]string, 0, 2)
	for _, column := range genericColumns {
		if column.required {
			missing = append(missing, column.label)
		}
	}
	return 0, nil, ImportValidationError{Problems: []string{
		fmt.Sprintf("could not find the required column(s) %s - download the template for the expected layout", strings.Join(missing, " and ")),
	}}
}

// parseGenericRows turns data rows into categories and items, collecting
// fatal problems and non-fatal warnings separately. It never writes; the
// caller aborts on any problem so a bad file changes nothing.
func parseGenericRows(rows [][]string, headerRow int, columns map[string]int) (categories []domain.InventoryCategory, items []domain.InventoryItem, warnings, problems []string) {
	categories = make([]domain.InventoryCategory, 0)
	items = make([]domain.InventoryItem, 0)

	// Category name (lowercased) -> the type its first occurrence declared.
	categoryTypes := make(map[string]string)
	// Preserves the user's original casing for the category name.
	categoryNames := make(map[string]string)
	conflicts := make(map[string]string)

	get := func(row []string, field string) string {
		index, ok := columns[field]
		if !ok {
			return ""
		}
		return strings.TrimSpace(cell(row, index))
	}

	for rowIndex := headerRow + 1; rowIndex < len(rows); rowIndex++ {
		row := rows[rowIndex]
		sheetRow := rowIndex + 1 // 1-based, as the user sees it in Excel

		name := get(row, "name")
		if name == "" {
			// Blank and spacer rows are normal in hand-made sheets.
			continue
		}

		category := get(row, "category")
		if category == "" {
			problems = append(problems, fmt.Sprintf("row %d: %q has no Category", sheetRow, name))
			continue
		}

		itemType := strings.ToLower(get(row, "type"))
		if itemType == "" {
			itemType = defaultGenericType
		}
		if !validGenericType(itemType) {
			problems = append(problems, fmt.Sprintf("row %d: unknown Type %q (expected one of %s)", sheetRow, get(row, "type"), strings.Join(genericTypes, ", ")))
			continue
		}

		key := strings.ToLower(category)
		if existing, seen := categoryTypes[key]; seen {
			if existing != itemType {
				// First occurrence wins; the user is told rather than
				// having half a category silently retyped.
				conflicts[key] = fmt.Sprintf("category %q appears with both %q and %q; using %q", categoryNames[key], existing, itemType, existing)
			}
		} else {
			categoryTypes[key] = itemType
			categoryNames[key] = category
			categories = append(categories, domain.InventoryCategory{Name: category, CategoryType: itemType})
		}

		items = append(items, domain.InventoryItem{
			// Match the category by the name its first occurrence used, so
			// "Mixers" and "mixers" land in one category rather than two.
			CategoryName:      categoryNames[key],
			Name:              name,
			Description:       get(row, "description"),
			QuantityAvailable: atoi(get(row, "quantity")),
			PriceExVAT:        atof(get(row, "price")),
			// No XLSXRow: it is the price-list write-back anchor and has no
			// meaning for a file we never export back into.
		})
	}

	if len(items) == 0 && len(problems) == 0 {
		problems = append(problems, "no items found - check that the sheet has rows below the header")
	}

	for _, message := range conflicts {
		warnings = append(warnings, message)
	}
	sort.Strings(warnings)
	return categories, items, warnings, problems
}

func validGenericType(value string) bool {
	for _, valid := range genericTypes {
		if value == valid {
			return true
		}
	}
	return false
}
