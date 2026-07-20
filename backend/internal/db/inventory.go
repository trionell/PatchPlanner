package db

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/trionell/patchplanner/internal/domain"
)

func ListInventoryCategories(db *sql.DB, inventoryID int64) ([]domain.InventoryCategory, error) {
	rows, err := db.Query(`
		SELECT c.id, c.inventory_id, c.name, c.category_type, COALESCE(c.picker_role, ''), COUNT(i.id) AS item_count
		FROM inventory_categories c
		LEFT JOIN inventory_items i ON i.category_id = c.id AND i.discontinued = 0
		WHERE c.inventory_id = ?
		GROUP BY c.id, c.name, c.category_type, c.picker_role
		ORDER BY c.name ASC`, inventoryID)
	if err != nil {
		return nil, fmt.Errorf("list inventory categories: %w", err)
	}
	defer rows.Close()

	categories := make([]domain.InventoryCategory, 0)
	for rows.Next() {
		var category domain.InventoryCategory
		if err := rows.Scan(&category.ID, &category.InventoryID, &category.Name, &category.CategoryType, &category.PickerRole, &category.ItemCount); err != nil {
			return nil, fmt.Errorf("scan inventory category: %w", err)
		}
		categories = append(categories, category)
	}
	return categories, rows.Err()
}

// UpdateCategoryPickerRole sets or clears (empty role) a category's picker
// role and returns the updated category. Scoped to inventoryID so an owner
// can't touch a category belonging to a different inventory by guessing an
// id. Returns sql.ErrNoRows if the category does not exist in that
// inventory.
func UpdateCategoryPickerRole(db *sql.DB, inventoryID, id int64, role string) (domain.InventoryCategory, error) {
	result, err := db.Exec(`UPDATE inventory_categories SET picker_role = ? WHERE id = ? AND inventory_id = ?`, nullString(role), id, inventoryID)
	if err != nil {
		return domain.InventoryCategory{}, fmt.Errorf("update category picker role: %w", err)
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return domain.InventoryCategory{}, sql.ErrNoRows
	}
	row := db.QueryRow(`
		SELECT c.id, c.inventory_id, c.name, c.category_type, COALESCE(c.picker_role, ''),
			(SELECT COUNT(*) FROM inventory_items i WHERE i.category_id = c.id AND i.discontinued = 0)
		FROM inventory_categories c WHERE c.id = ?`, id)
	var category domain.InventoryCategory
	if err := row.Scan(&category.ID, &category.InventoryID, &category.Name, &category.CategoryType, &category.PickerRole, &category.ItemCount); err != nil {
		return domain.InventoryCategory{}, fmt.Errorf("get inventory category: %w", err)
	}
	return category, nil
}

const inventoryItemColumns = `i.id, COALESCE(i.inventory_id, 0), COALESCE(i.category_id, 0), COALESCE(c.name, ''), COALESCE(c.category_type, ''), i.name, COALESCE(i.description, ''), COALESCE(i.quantity_available, 0), COALESCE(i.price_ex_vat, 0), COALESCE(i.xlsx_row, 0), i.discontinued, COALESCE(i.created_at, '')`

func ListInventoryItems(db *sql.DB, inventoryID int64, categoryID *int64, categoryType, pickerRole string, includeDiscontinued bool) ([]domain.InventoryItem, error) {
	query := `
		SELECT ` + inventoryItemColumns + `
		FROM inventory_items i
		LEFT JOIN inventory_categories c ON c.id = i.category_id
		WHERE i.inventory_id = ?`
	args := []any{inventoryID}
	if categoryID != nil {
		query += " AND i.category_id = ?"
		args = append(args, *categoryID)
	}
	if categoryType != "" {
		query += " AND c.category_type = ?"
		args = append(args, categoryType)
	}
	if pickerRole != "" {
		query += " AND c.picker_role = ?"
		args = append(args, pickerRole)
	}
	if !includeDiscontinued {
		query += " AND i.discontinued = 0"
	}
	query += " ORDER BY c.name ASC, i.name ASC"

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("list inventory items: %w", err)
	}
	defer rows.Close()

	items := make([]domain.InventoryItem, 0)
	for rows.Next() {
		item, err := scanInventoryItem(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// GetInventoryItem fetches one item by its global id, unscoped by
// inventory — used project-wide as a simple "does this item exist"
// existence/detail check wherever a handler accepts a picked catalog item.
// Cross-inventory correctness (does this item belong to the event's bound
// inventory) is a separate, additional check: ItemBelongsToInventory.
func GetInventoryItem(db *sql.DB, id int64) (domain.InventoryItem, error) {
	row := db.QueryRow(`
		SELECT `+inventoryItemColumns+`
		FROM inventory_items i
		LEFT JOIN inventory_categories c ON c.id = i.category_id
		WHERE i.id = ?`, id)
	return scanInventoryItem(row)
}

func scanInventoryItem(row scanner) (domain.InventoryItem, error) {
	var item domain.InventoryItem
	var discontinued int
	if err := row.Scan(&item.ID, &item.InventoryID, &item.CategoryID, &item.CategoryName, &item.CategoryType, &item.Name, &item.Description, &item.QuantityAvailable, &item.PriceExVAT, &item.XLSXRow, &discontinued, &item.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return domain.InventoryItem{}, fmt.Errorf("get inventory item: %w", err)
		}
		return domain.InventoryItem{}, fmt.Errorf("scan inventory item: %w", err)
	}
	item.Discontinued = discontinued == 1
	return item, nil
}

// UpsertInventory replaces one inventory's catalog contents without ever
// deleting a row, so planning data referencing inventory items always
// survives a re-import. Incoming items are matched to existing ones (within
// the same inventoryID only) by case-insensitive name; when several items
// share a name, the nth occurrence in the sheet matches the nth existing
// item (in sheet order). Matched items are updated in place (id preserved);
// new items are inserted; existing items missing from the import are
// flagged discontinued. Everything runs in one transaction, so a failed
// import leaves the catalog untouched. Scoped to inventoryID throughout —
// re-importing one user's price list must never touch another user's
// catalog.
func UpsertInventory(db *sql.DB, inventoryID int64, categories []domain.InventoryCategory, items []domain.InventoryItem) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin inventory upsert: %w", err)
	}
	defer tx.Rollback()

	categoryIDs, err := upsertCategories(tx, inventoryID, categories)
	if err != nil {
		return err
	}

	// Every item in this inventory starts presumed gone; each incoming
	// row revives or inserts.
	if _, err := tx.Exec(`UPDATE inventory_items SET discontinued = 1 WHERE inventory_id = ?`, inventoryID); err != nil {
		return fmt.Errorf("flag inventory items: %w", err)
	}

	pool, err := loadItemIDsByName(tx, inventoryID)
	if err != nil {
		return err
	}

	for _, item := range items {
		categoryID, ok := categoryIDs[item.CategoryName]
		if !ok {
			continue
		}
		key := strings.ToLower(item.Name)
		if ids := pool[key]; len(ids) > 0 {
			pool[key] = ids[1:]
			if _, err := tx.Exec(`UPDATE inventory_items SET category_id = ?, name = ?, description = ?, quantity_available = ?, price_ex_vat = ?, xlsx_row = ?, discontinued = 0 WHERE id = ?`,
				categoryID, item.Name, nullString(item.Description), item.QuantityAvailable, item.PriceExVAT, item.XLSXRow, ids[0]); err != nil {
				return fmt.Errorf("update inventory item: %w", err)
			}
			continue
		}
		if _, err := tx.Exec(`INSERT INTO inventory_items (inventory_id, category_id, name, description, quantity_available, price_ex_vat, xlsx_row, discontinued) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
			inventoryID, categoryID, item.Name, nullString(item.Description), item.QuantityAvailable, item.PriceExVAT, item.XLSXRow); err != nil {
			return fmt.Errorf("insert inventory item: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit inventory upsert: %w", err)
	}
	return nil
}

// upsertCategories matches categories (within inventoryID only) by
// case-insensitive name and returns a map from the incoming category name
// to its row id. Categories absent from the import are kept as-is
// (harmless once their items are discontinued).
func upsertCategories(tx *sql.Tx, inventoryID int64, categories []domain.InventoryCategory) (map[string]int64, error) {
	rows, err := tx.Query(`SELECT id, name FROM inventory_categories WHERE inventory_id = ?`, inventoryID)
	if err != nil {
		return nil, fmt.Errorf("load inventory categories: %w", err)
	}
	defer rows.Close()

	existing := make(map[string]int64)
	for rows.Next() {
		var id int64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, fmt.Errorf("scan inventory category: %w", err)
		}
		existing[strings.ToLower(name)] = id
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	categoryIDs := make(map[string]int64, len(categories))
	for _, category := range categories {
		if id, ok := existing[strings.ToLower(category.Name)]; ok {
			if _, err := tx.Exec(`UPDATE inventory_categories SET name = ?, category_type = ? WHERE id = ?`, category.Name, category.CategoryType, id); err != nil {
				return nil, fmt.Errorf("update inventory category: %w", err)
			}
			categoryIDs[category.Name] = id
			continue
		}
		result, err := tx.Exec(`INSERT INTO inventory_categories (inventory_id, name, category_type) VALUES (?, ?, ?)`, inventoryID, category.Name, category.CategoryType)
		if err != nil {
			return nil, fmt.Errorf("insert inventory category: %w", err)
		}
		id, err := result.LastInsertId()
		if err != nil {
			return nil, fmt.Errorf("inventory category last insert id: %w", err)
		}
		categoryIDs[category.Name] = id
		existing[strings.ToLower(category.Name)] = id
	}
	return categoryIDs, nil
}

// loadItemIDsByName returns existing item ids (within inventoryID only)
// keyed by lowercased name, each list ordered by sheet position so
// duplicate names match positionally.
func loadItemIDsByName(tx *sql.Tx, inventoryID int64) (map[string][]int64, error) {
	rows, err := tx.Query(`SELECT id, name FROM inventory_items WHERE inventory_id = ? ORDER BY COALESCE(xlsx_row, 0) ASC, id ASC`, inventoryID)
	if err != nil {
		return nil, fmt.Errorf("load inventory items: %w", err)
	}
	defer rows.Close()

	pool := make(map[string][]int64)
	for rows.Next() {
		var id int64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, fmt.Errorf("scan inventory item id: %w", err)
		}
		key := strings.ToLower(name)
		pool[key] = append(pool[key], id)
	}
	return pool, rows.Err()
}
