package db

import (
	"database/sql"
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
)

const inventoryColumns = `id, COALESCE(owner_user_id, 0), name, COALESCE(source_filename, ''), created_at`

func CreateInventory(database *sql.DB, ownerUserID int64, name string) (domain.Inventory, error) {
	result, err := database.Exec(`INSERT INTO inventories (owner_user_id, name) VALUES (?, ?)`, ownerUserID, name)
	if err != nil {
		return domain.Inventory{}, fmt.Errorf("create inventory: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.Inventory{}, fmt.Errorf("inventory last insert id: %w", err)
	}
	return GetInventory(database, id)
}

func ListInventoriesForOwner(database *sql.DB, ownerUserID int64) ([]domain.Inventory, error) {
	rows, err := database.Query(`SELECT `+inventoryColumns+` FROM inventories WHERE owner_user_id = ? ORDER BY name ASC`, ownerUserID)
	if err != nil {
		return nil, fmt.Errorf("list inventories: %w", err)
	}
	defer rows.Close()

	inventories := make([]domain.Inventory, 0)
	for rows.Next() {
		inventory, err := scanInventory(rows)
		if err != nil {
			return nil, err
		}
		inventories = append(inventories, inventory)
	}
	return inventories, rows.Err()
}

func GetInventory(database *sql.DB, id int64) (domain.Inventory, error) {
	row := database.QueryRow(`SELECT `+inventoryColumns+` FROM inventories WHERE id = ?`, id)
	return scanInventory(row)
}

// GetInventorySourceXLSX returns the stored price-list template's raw
// bytes for rental export (research.md R2) — nil (no error) if the
// inventory exists but has never had a file imported/duplicated into it.
func GetInventorySourceXLSX(database *sql.DB, id int64) ([]byte, error) {
	var data []byte
	if err := database.QueryRow(`SELECT source_xlsx FROM inventories WHERE id = ?`, id).Scan(&data); err != nil {
		return nil, fmt.Errorf("get inventory source xlsx: %w", err)
	}
	return data, nil
}

// SetInventorySourceXLSX stores the raw bytes of an imported price-list
// file as the inventory's template, so a later rental export has something
// to write quantities into (research.md R2).
func SetInventorySourceXLSX(database *sql.DB, id int64, data []byte, filename string) error {
	if _, err := database.Exec(`UPDATE inventories SET source_xlsx = ?, source_filename = ? WHERE id = ?`, data, nullString(filename), id); err != nil {
		return fmt.Errorf("set inventory source xlsx: %w", err)
	}
	return nil
}

func RenameInventory(database *sql.DB, id int64, name string) (domain.Inventory, error) {
	if _, err := database.Exec(`UPDATE inventories SET name = ? WHERE id = ?`, name, id); err != nil {
		return domain.Inventory{}, fmt.Errorf("rename inventory: %w", err)
	}
	return GetInventory(database, id)
}

// DeleteInventory refuses (ErrInUse) while any event still references it —
// FR-010.
func DeleteInventory(database *sql.DB, id int64) error {
	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM events WHERE inventory_id = ?`, id).Scan(&count); err != nil {
		return fmt.Errorf("count events using inventory: %w", err)
	}
	if count > 0 {
		return InventoryInUseError{Count: count}
	}
	if _, err := database.Exec(`DELETE FROM inventories WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete inventory: %w", err)
	}
	return nil
}

// InventoryInUseError reports how many events still use an inventory,
// blocking its deletion. errors.Is(err, ErrInUse) matches it, mirroring
// reference.go's InUseError/ErrInUse pattern.
type InventoryInUseError struct {
	Count int
}

func (e InventoryInUseError) Error() string {
	return fmt.Sprintf("inventory is in use by %d event(s)", e.Count)
}

func (e InventoryInUseError) Is(target error) bool { return target == ErrInUse }

// EnsureUserHasInventory guarantees userID owns at least one inventory:
// a no-op if they already do, otherwise claims one pre-existing ownerless
// inventory if any exists, otherwise creates a fresh empty one for them.
// The claim's WHERE/subquery is itself the atomic guard (research.md R4) —
// safe to call on every login with no separate "am I first" check.
func EnsureUserHasInventory(database *sql.DB, userID int64) error {
	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM inventories WHERE owner_user_id = ?`, userID).Scan(&count); err != nil {
		return fmt.Errorf("count user inventories: %w", err)
	}
	if count > 0 {
		return nil
	}

	result, err := database.Exec(`
		UPDATE inventories SET owner_user_id = ?
		WHERE id = (SELECT id FROM inventories WHERE owner_user_id IS NULL LIMIT 1)`, userID)
	if err != nil {
		return fmt.Errorf("claim ownerless inventory: %w", err)
	}
	claimed, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("claim ownerless inventory: %w", err)
	}
	if claimed > 0 {
		return nil
	}

	if _, err := CreateInventory(database, userID, "My Inventory"); err != nil {
		return fmt.Errorf("create starter inventory: %w", err)
	}
	return nil
}

// DuplicateInventory deep-copies sourceInventoryID's categories, items,
// and each item's fixture_modes into a brand-new inventory owned by
// ownerUserID — including the source's stored template file, so the copy
// can export correctly without an immediate re-upload (research.md R7).
// The original and the copy are fully independent from this point on: no
// stored link between them, editing either never affects the other.
func DuplicateInventory(database *sql.DB, sourceInventoryID, ownerUserID int64) (domain.Inventory, error) {
	source, err := GetInventory(database, sourceInventoryID)
	if err != nil {
		return domain.Inventory{}, fmt.Errorf("get source inventory: %w", err)
	}
	sourceXLSX, err := GetInventorySourceXLSX(database, sourceInventoryID)
	if err != nil {
		return domain.Inventory{}, fmt.Errorf("get source inventory template: %w", err)
	}

	tx, err := database.Begin()
	if err != nil {
		return domain.Inventory{}, fmt.Errorf("begin duplicate inventory: %w", err)
	}
	defer tx.Rollback()

	result, err := tx.Exec(`INSERT INTO inventories (owner_user_id, name, source_xlsx, source_filename) VALUES (?, ?, ?, ?)`,
		ownerUserID, source.Name+" (copy)", sourceXLSX, nullString(source.SourceFilename))
	if err != nil {
		return domain.Inventory{}, fmt.Errorf("create duplicate inventory: %w", err)
	}
	newInventoryID, err := result.LastInsertId()
	if err != nil {
		return domain.Inventory{}, fmt.Errorf("duplicate inventory last insert id: %w", err)
	}

	categoryRows, err := tx.Query(`SELECT id, name, category_type, picker_role FROM inventory_categories WHERE inventory_id = ?`, sourceInventoryID)
	if err != nil {
		return domain.Inventory{}, fmt.Errorf("load source categories: %w", err)
	}
	type sourceCategory struct {
		id                 int64
		name, categoryType string
		pickerRole         sql.NullString
	}
	var categories []sourceCategory
	for categoryRows.Next() {
		var c sourceCategory
		if err := categoryRows.Scan(&c.id, &c.name, &c.categoryType, &c.pickerRole); err != nil {
			categoryRows.Close()
			return domain.Inventory{}, fmt.Errorf("scan source category: %w", err)
		}
		categories = append(categories, c)
	}
	categoryRows.Close()
	if err := categoryRows.Err(); err != nil {
		return domain.Inventory{}, fmt.Errorf("iterate source categories: %w", err)
	}

	categoryIDMap := make(map[int64]int64, len(categories))
	for _, c := range categories {
		result, err := tx.Exec(`INSERT INTO inventory_categories (inventory_id, name, category_type, picker_role) VALUES (?, ?, ?, ?)`,
			newInventoryID, c.name, c.categoryType, c.pickerRole)
		if err != nil {
			return domain.Inventory{}, fmt.Errorf("create duplicate category: %w", err)
		}
		newCategoryID, err := result.LastInsertId()
		if err != nil {
			return domain.Inventory{}, fmt.Errorf("duplicate category last insert id: %w", err)
		}
		categoryIDMap[c.id] = newCategoryID
	}

	itemRows, err := tx.Query(`SELECT id, category_id, name, COALESCE(description, ''), quantity_available, price_ex_vat, COALESCE(xlsx_row, 0), discontinued FROM inventory_items WHERE inventory_id = ?`, sourceInventoryID)
	if err != nil {
		return domain.Inventory{}, fmt.Errorf("load source items: %w", err)
	}
	type sourceItem struct {
		id, categoryID    int64
		name, description string
		quantityAvailable int
		priceExVAT        float64
		xlsxRow           int
		discontinued      int
	}
	var items []sourceItem
	for itemRows.Next() {
		var it sourceItem
		if err := itemRows.Scan(&it.id, &it.categoryID, &it.name, &it.description, &it.quantityAvailable, &it.priceExVAT, &it.xlsxRow, &it.discontinued); err != nil {
			itemRows.Close()
			return domain.Inventory{}, fmt.Errorf("scan source item: %w", err)
		}
		items = append(items, it)
	}
	itemRows.Close()
	if err := itemRows.Err(); err != nil {
		return domain.Inventory{}, fmt.Errorf("iterate source items: %w", err)
	}

	for _, it := range items {
		newCategoryID := categoryIDMap[it.categoryID]
		result, err := tx.Exec(`INSERT INTO inventory_items (inventory_id, category_id, name, description, quantity_available, price_ex_vat, xlsx_row, discontinued) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			newInventoryID, newCategoryID, it.name, nullString(it.description), it.quantityAvailable, it.priceExVAT, it.xlsxRow, it.discontinued)
		if err != nil {
			return domain.Inventory{}, fmt.Errorf("create duplicate item: %w", err)
		}
		newItemID, err := result.LastInsertId()
		if err != nil {
			return domain.Inventory{}, fmt.Errorf("duplicate item last insert id: %w", err)
		}

		modeRows, err := tx.Query(`SELECT name, channel_count FROM fixture_modes WHERE inventory_item_id = ?`, it.id)
		if err != nil {
			return domain.Inventory{}, fmt.Errorf("load source fixture modes: %w", err)
		}
		type sourceMode struct {
			name         string
			channelCount int
		}
		var modes []sourceMode
		for modeRows.Next() {
			var m sourceMode
			if err := modeRows.Scan(&m.name, &m.channelCount); err != nil {
				modeRows.Close()
				return domain.Inventory{}, fmt.Errorf("scan source fixture mode: %w", err)
			}
			modes = append(modes, m)
		}
		modeRows.Close()
		if err := modeRows.Err(); err != nil {
			return domain.Inventory{}, fmt.Errorf("iterate source fixture modes: %w", err)
		}
		for _, m := range modes {
			if _, err := tx.Exec(`INSERT INTO fixture_modes (inventory_item_id, name, channel_count) VALUES (?, ?, ?)`, newItemID, m.name, m.channelCount); err != nil {
				return domain.Inventory{}, fmt.Errorf("create duplicate fixture mode: %w", err)
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return domain.Inventory{}, fmt.Errorf("commit duplicate inventory: %w", err)
	}
	return GetInventory(database, newInventoryID)
}

// ItemBelongsToInventory reports whether itemID exists and belongs to
// inventoryID — the cross-inventory validation check (research.md R6)
// called from every handler that accepts a picked catalog item id.
func ItemBelongsToInventory(database *sql.DB, itemID, inventoryID int64) (bool, error) {
	var found int
	err := database.QueryRow(`SELECT 1 FROM inventory_items WHERE id = ? AND inventory_id = ?`, itemID, inventoryID).Scan(&found)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check item belongs to inventory: %w", err)
	}
	return true, nil
}

func scanInventory(row scanner) (domain.Inventory, error) {
	var inventory domain.Inventory
	if err := row.Scan(&inventory.ID, &inventory.OwnerUserID, &inventory.Name, &inventory.SourceFilename, &inventory.CreatedAt); err != nil {
		return domain.Inventory{}, fmt.Errorf("scan inventory: %w", err)
	}
	return inventory, nil
}
