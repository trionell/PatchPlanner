package db

import (
	"database/sql"
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
)

const inventoryColumns = `id, COALESCE(owner_user_id, 0), name, COALESCE(source_filename, ''), COALESCE(source_format, ''), created_at`

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

// ListInventoriesForOwner returns the user's catalogs with the three counts
// the list view is made of (Slice 32): items, categories, and the events
// bound to each catalog.
//
// The counts are correlated sub-selects rather than joins because a join
// fans out and then has to be undone with COUNT(DISTINCT …) three times
// over. They are computed here rather than in the browser for the reason
// Slice 29 settled: the browser derives what it can already see, and the
// database counts what only it can — an event's binding lives in a table
// this user's catalog page never loads. The alternative was what the page
// used to do: fetch all 308 items of every imported catalog to call
// .length on them.
//
// The event count's predicate is DeleteInventory's, so what the column
// shows and what the refusal says cannot disagree.
func ListInventoriesForOwner(database *sql.DB, ownerUserID int64) ([]domain.Inventory, error) {
	rows, err := database.Query(`
		SELECT `+inventoryColumns+`,
			(SELECT COUNT(*) FROM inventory_items WHERE inventory_id = inventories.id),
			(SELECT COUNT(*) FROM inventory_categories WHERE inventory_id = inventories.id),
			(SELECT COUNT(*) FROM events WHERE inventory_id = inventories.id)
		FROM inventories WHERE owner_user_id = ? ORDER BY name ASC`, ownerUserID)
	if err != nil {
		return nil, fmt.Errorf("list inventories: %w", err)
	}
	defer rows.Close()

	inventories := make([]domain.Inventory, 0)
	for rows.Next() {
		// Not scanInventory: this is the one query that carries counts, and
		// the single-inventory readers must keep returning them unset.
		var inventory domain.Inventory
		if err := rows.Scan(
			&inventory.ID, &inventory.OwnerUserID, &inventory.Name,
			&inventory.SourceFilename, &inventory.SourceFormat, &inventory.CreatedAt,
			&inventory.ItemCount, &inventory.CategoryCount, &inventory.EventCount,
		); err != nil {
			return nil, fmt.Errorf("scan inventory: %w", err)
		}
		inventories = append(inventories, inventory)
	}
	return inventories, rows.Err()
}

// ListEventsForInventory returns every event bound to a catalog, oldest
// first, for the manage drawer's "Used on" section (Slice 32).
//
// It carries no membership predicate, unlike ListEventsForUser, and that
// is deliberate: it must return exactly the set ListInventoriesForOwner
// counted, or a section headed 9 renders eight rows. The route is already
// owner-only, and an event can only bind to a catalog its own creator
// owns, so the two sets are the same events by construction rather than
// by coincidence.
func ListEventsForInventory(database *sql.DB, inventoryID int64) ([]domain.Event, error) {
	rows, err := database.Query(`
		SELECT id, name, COALESCE(load_in_date, ''), COALESCE(start_date, ''), COALESCE(end_date, ''),
			COALESCE(load_out_date, ''), COALESCE(venue, ''), COALESCE(notes, ''),
			COALESCE(created_at, ''), COALESCE(updated_at, ''), COALESCE(inventory_id, 0)
		FROM events WHERE inventory_id = ?
		ORDER BY COALESCE(start_date, '') ASC, name ASC`, inventoryID)
	if err != nil {
		return nil, fmt.Errorf("list events for inventory: %w", err)
	}
	defer rows.Close()

	events := make([]domain.Event, 0)
	for rows.Next() {
		var event domain.Event
		if err := rows.Scan(&event.ID, &event.Name, &event.LoadInDate, &event.StartDate, &event.EndDate,
			&event.LoadOutDate, &event.Venue, &event.Notes, &event.CreatedAt, &event.UpdatedAt, &event.InventoryID); err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}
		events = append(events, event)
	}
	return events, rows.Err()
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

// SetInventorySource records what an import left behind: the file's raw
// bytes (LL price lists only, so a later rental export has something to
// write quantities into — research.md R2), its filename for display, and
// which format it was (Slice 22, research.md R1).
//
// Pass data = nil for formats with nothing to write back into; that also
// clears any blob a previous LL import left, so an inventory re-imported
// as generic doesn't keep a stale template it can no longer export to.
func SetInventorySource(database *sql.DB, id int64, data []byte, filename, format string) error {
	if _, err := database.Exec(`UPDATE inventories SET source_xlsx = ?, source_filename = ?, source_format = ? WHERE id = ?`,
		data, nullString(filename), nullString(format), id); err != nil {
		return fmt.Errorf("set inventory source: %w", err)
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

	// source_format comes along so the copy offers exactly the same exports
	// as the original (FR-021) — a duplicated LL catalog stays exportable to
	// LL, a duplicated generic one stays not.
	result, err := tx.Exec(`INSERT INTO inventories (owner_user_id, name, source_xlsx, source_filename, source_format) VALUES (?, ?, ?, ?, ?)`,
		ownerUserID, source.Name+" (copy)", sourceXLSX, nullString(source.SourceFilename), nullString(source.SourceFormat))
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

	itemRows, err := tx.Query(`SELECT id, category_id, name, COALESCE(description, ''), quantity_available, price_ex_vat, COALESCE(xlsx_row, 0), discontinued, is_manual FROM inventory_items WHERE inventory_id = ?`, sourceInventoryID)
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
		isManual          int
	}
	var items []sourceItem
	for itemRows.Next() {
		var it sourceItem
		if err := itemRows.Scan(&it.id, &it.categoryID, &it.name, &it.description, &it.quantityAvailable, &it.priceExVAT, &it.xlsxRow, &it.discontinued, &it.isManual); err != nil {
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
		// is_manual comes along too, so hand-entered items in the copy stay
		// protected from the copy's own future imports (FR-021).
		result, err := tx.Exec(`INSERT INTO inventory_items (inventory_id, category_id, name, description, quantity_available, price_ex_vat, xlsx_row, discontinued, is_manual) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			newInventoryID, newCategoryID, it.name, nullString(it.description), it.quantityAvailable, it.priceExVAT, it.xlsxRow, it.discontinued, it.isManual)
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
	if err := row.Scan(&inventory.ID, &inventory.OwnerUserID, &inventory.Name, &inventory.SourceFilename, &inventory.SourceFormat, &inventory.CreatedAt); err != nil {
		return domain.Inventory{}, fmt.Errorf("scan inventory: %w", err)
	}
	return inventory, nil
}
