package db

import (
	"database/sql"
	"fmt"

	"github.com/trionell/patcherplanner/internal/domain"
)

func ListInventoryCategories(db *sql.DB) ([]domain.InventoryCategory, error) {
	rows, err := db.Query(`
		SELECT c.id, c.name, c.category_type, COUNT(i.id) AS item_count
		FROM inventory_categories c
		LEFT JOIN inventory_items i ON i.category_id = c.id
		GROUP BY c.id, c.name, c.category_type
		ORDER BY c.name ASC`)
	if err != nil {
		return nil, fmt.Errorf("list inventory categories: %w", err)
	}
	defer rows.Close()

	categories := make([]domain.InventoryCategory, 0)
	for rows.Next() {
		var category domain.InventoryCategory
		if err := rows.Scan(&category.ID, &category.Name, &category.CategoryType, &category.ItemCount); err != nil {
			return nil, fmt.Errorf("scan inventory category: %w", err)
		}
		categories = append(categories, category)
	}
	return categories, rows.Err()
}

func ListInventoryItems(db *sql.DB, categoryID *int64, categoryType string) ([]domain.InventoryItem, error) {
	query := `
		SELECT i.id, i.category_id, COALESCE(c.name, ''), COALESCE(c.category_type, ''), i.name, COALESCE(i.description, ''), COALESCE(i.quantity_available, 0), COALESCE(i.price_ex_vat, 0), COALESCE(i.xlsx_row, 0), COALESCE(i.created_at, '')
		FROM inventory_items i
		LEFT JOIN inventory_categories c ON c.id = i.category_id`
	args := make([]any, 0)
	conditions := make([]string, 0)
	if categoryID != nil {
		conditions = append(conditions, "i.category_id = ?")
		args = append(args, *categoryID)
	}
	if categoryType != "" {
		conditions = append(conditions, "c.category_type = ?")
		args = append(args, categoryType)
	}
	if len(conditions) > 0 {
		query += " WHERE " + conditions[0]
		for i := 1; i < len(conditions); i++ {
			query += " AND " + conditions[i]
		}
	}
	query += " ORDER BY c.name ASC, i.name ASC"

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("list inventory items: %w", err)
	}
	defer rows.Close()

	items := make([]domain.InventoryItem, 0)
	for rows.Next() {
		var item domain.InventoryItem
		if err := rows.Scan(&item.ID, &item.CategoryID, &item.CategoryName, &item.CategoryType, &item.Name, &item.Description, &item.QuantityAvailable, &item.PriceExVAT, &item.XLSXRow, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan inventory item: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func ReplaceInventory(db *sql.DB, categories []domain.InventoryCategory, items []domain.InventoryItem) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin inventory replace: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM event_rentals`); err != nil {
		return fmt.Errorf("clear event rentals: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM lighting_fixtures`); err != nil {
		return fmt.Errorf("clear lighting fixtures: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM audio_patch_outputs`); err != nil {
		return fmt.Errorf("clear audio outputs: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM inventory_items`); err != nil {
		return fmt.Errorf("clear inventory items: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM inventory_categories`); err != nil {
		return fmt.Errorf("clear inventory categories: %w", err)
	}

	categoryIDs := make(map[string]int64, len(categories))
	for _, category := range categories {
		result, err := tx.Exec(`INSERT INTO inventory_categories (name, category_type) VALUES (?, ?)`, category.Name, category.CategoryType)
		if err != nil {
			return fmt.Errorf("insert inventory category: %w", err)
		}
		id, err := result.LastInsertId()
		if err != nil {
			return fmt.Errorf("inventory category last insert id: %w", err)
		}
		categoryIDs[category.Name] = id
	}

	for _, item := range items {
		categoryID, ok := categoryIDs[item.CategoryName]
		if !ok {
			continue
		}
		if _, err := tx.Exec(`INSERT INTO inventory_items (category_id, name, description, quantity_available, price_ex_vat, xlsx_row) VALUES (?, ?, ?, ?, ?, ?)`, categoryID, item.Name, nullString(item.Description), item.QuantityAvailable, item.PriceExVAT, item.XLSXRow); err != nil {
			return fmt.Errorf("insert inventory item: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit inventory replace: %w", err)
	}
	return nil
}
