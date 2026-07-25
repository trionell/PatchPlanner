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

const inventoryItemColumns = `i.id, COALESCE(i.inventory_id, 0), COALESCE(i.category_id, 0), COALESCE(c.name, ''), COALESCE(c.category_type, ''), i.name, COALESCE(i.description, ''), COALESCE(i.quantity_available, 0), COALESCE(i.price_ex_vat, 0), COALESCE(i.xlsx_row, 0), i.discontinued, i.is_manual, COALESCE(i.created_at, '')`

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
	var discontinued, isManual int
	if err := row.Scan(&item.ID, &item.InventoryID, &item.CategoryID, &item.CategoryName, &item.CategoryType, &item.Name, &item.Description, &item.QuantityAvailable, &item.PriceExVAT, &item.XLSXRow, &discontinued, &isManual, &item.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return domain.InventoryItem{}, fmt.Errorf("get inventory item: %w", err)
		}
		return domain.InventoryItem{}, fmt.Errorf("scan inventory item: %w", err)
	}
	item.Discontinued = discontinued == 1
	item.IsManual = isManual == 1
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
//
// Hand-entered items (is_manual = 1) are invisible to all of this: an
// import owns the rows it created, not the ones the user typed in. They
// are excluded from both the discontinue sweep and the name-matching pool
// below — see the comments at each site for why both halves are needed.
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

	// Every *imported* item in this inventory starts presumed gone; each
	// incoming row revives or inserts. Manual items are excluded because
	// their absence from the file says nothing about them — without this
	// scope, every import would silently discontinue (and so hide from
	// every planning dropdown) everything the user had entered by hand.
	if _, err := tx.Exec(`UPDATE inventory_items SET discontinued = 1 WHERE inventory_id = ? AND is_manual = 0`, inventoryID); err != nil {
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
//
// Manual items are excluded from the pool. This is the second, easily
// missed half of manual-item safety: were they included, an imported row
// sharing a name with a hand-entered one would *adopt* that row and
// overwrite its price, quantity and description — data loss with no
// warning. Keeping the two populations disjoint means a name collision
// yields two visible rows the user can reconcile instead.
func loadItemIDsByName(tx *sql.Tx, inventoryID int64) (map[string][]int64, error) {
	rows, err := tx.Query(`SELECT id, name FROM inventory_items WHERE inventory_id = ? AND is_manual = 0 ORDER BY COALESCE(xlsx_row, 0) ASC, id ASC`, inventoryID)
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

// itemReferenceSites lists every planning column that can point at an
// inventory item. It is deliberately derived from the same set of arms as
// rentalSummaryQuery (rental.go): the ROADMAP's standing invariant already
// obliges any slice that adds a new equipment-selection site to extend the
// rental aggregation, so keeping these two lists together means delete
// safety stays correct for free as the planning model grows.
//
// join is an extra clause needed when the table has no direct link to the
// item beyond its own column; none is needed today, but the shape matches
// reference.go's usage map so the two read alike.
var itemReferenceSites = []struct{ table, column string }{
	{"input_sources", "mic_item_id"},
	{"input_sources", "stand_item_id"},
	{"input_devices", "inventory_item_id"},
	{"input_cables", "cable_item_id"},
	{"stageboxes", "inventory_item_id"},
	{"stage_multis", "inventory_item_id"},
	{"output_devices", "inventory_item_id"},
	{"output_cables", "cable_item_id"},
	{"lighting_fixtures", "inventory_item_id"},
	{"stage_plot_truss_pieces", "inventory_item_id"},
	{"event_rentals", "inventory_item_id"},
}

// CountItemReferences reports how many planning rows across all events
// point at itemID. Deleting an item with references would leave dangling
// pointers throughout the planning model — several of these columns are
// nullable references without ON DELETE RESTRICT, so the database would
// not stop it.
func CountItemReferences(database *sql.DB, itemID int64) (int, error) {
	total := 0
	for _, site := range itemReferenceSites {
		var count int
		query := fmt.Sprintf(`SELECT COUNT(*) FROM %s WHERE %s = ?`, site.table, site.column)
		if err := database.QueryRow(query, itemID).Scan(&count); err != nil {
			return 0, fmt.Errorf("count %s.%s references: %w", site.table, site.column, err)
		}
		total += count
	}
	return total, nil
}

// ItemInUseError reports how many planning rows reference an item,
// blocking its deletion. errors.Is(err, ErrInUse) matches it, mirroring
// reference.go's InUseError and inventories.go's InventoryInUseError.
type ItemInUseError struct {
	Name  string
	Count int
}

func (e ItemInUseError) Error() string {
	return fmt.Sprintf("%q is used %d time(s) across your events; remove those references first", e.Name, e.Count)
}

func (e ItemInUseError) Is(target error) bool { return target == ErrInUse }

// CategoryInUseError blocks deleting a category that still holds items.
type CategoryInUseError struct {
	Name  string
	Count int
}

func (e CategoryInUseError) Error() string {
	return fmt.Sprintf("category %q still has %d item(s); move or delete them first", e.Name, e.Count)
}

func (e CategoryInUseError) Is(target error) bool { return target == ErrInUse }

// GetInventoryCategory fetches one category scoped to its inventory, so a
// guessed id from another inventory resolves to nothing.
func GetInventoryCategory(database *sql.DB, inventoryID, categoryID int64) (domain.InventoryCategory, error) {
	row := database.QueryRow(`
		SELECT c.id, c.inventory_id, c.name, c.category_type, COALESCE(c.picker_role, ''),
			(SELECT COUNT(*) FROM inventory_items i WHERE i.category_id = c.id AND i.discontinued = 0)
		FROM inventory_categories c WHERE c.id = ? AND c.inventory_id = ?`, categoryID, inventoryID)
	var category domain.InventoryCategory
	if err := row.Scan(&category.ID, &category.InventoryID, &category.Name, &category.CategoryType, &category.PickerRole, &category.ItemCount); err != nil {
		return domain.InventoryCategory{}, err
	}
	return category, nil
}

// CreateInventoryCategory adds a category by hand. Names are unique within
// an inventory case-insensitively, matching how the importers match them —
// otherwise "Mixers" and "mixers" would become two near-identical entries
// in every planning dropdown.
func CreateInventoryCategory(database *sql.DB, inventoryID int64, name, categoryType, pickerRole string) (domain.InventoryCategory, error) {
	taken, err := categoryNameTaken(database, inventoryID, name, 0)
	if err != nil {
		return domain.InventoryCategory{}, err
	}
	if taken {
		return domain.InventoryCategory{}, ErrDuplicate
	}
	result, err := database.Exec(`INSERT INTO inventory_categories (inventory_id, name, category_type, picker_role) VALUES (?, ?, ?, ?)`,
		inventoryID, name, categoryType, nullString(pickerRole))
	if err != nil {
		return domain.InventoryCategory{}, fmt.Errorf("create inventory category: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.InventoryCategory{}, fmt.Errorf("inventory category last insert id: %w", err)
	}
	return GetInventoryCategory(database, inventoryID, id)
}

// UpdateInventoryCategory applies a partial update; nil fields are left as
// they are. Returns sql.ErrNoRows when the category is not in inventoryID.
func UpdateInventoryCategory(database *sql.DB, inventoryID, categoryID int64, name, categoryType, pickerRole *string) (domain.InventoryCategory, error) {
	existing, err := GetInventoryCategory(database, inventoryID, categoryID)
	if err != nil {
		return domain.InventoryCategory{}, err
	}
	if name != nil {
		taken, err := categoryNameTaken(database, inventoryID, *name, categoryID)
		if err != nil {
			return domain.InventoryCategory{}, err
		}
		if taken {
			return domain.InventoryCategory{}, ErrDuplicate
		}
		existing.Name = *name
	}
	if categoryType != nil {
		existing.CategoryType = *categoryType
	}
	if pickerRole != nil {
		existing.PickerRole = *pickerRole
	}
	if _, err := database.Exec(`UPDATE inventory_categories SET name = ?, category_type = ?, picker_role = ? WHERE id = ? AND inventory_id = ?`,
		existing.Name, existing.CategoryType, nullString(existing.PickerRole), categoryID, inventoryID); err != nil {
		return domain.InventoryCategory{}, fmt.Errorf("update inventory category: %w", err)
	}
	return GetInventoryCategory(database, inventoryID, categoryID)
}

// DeleteInventoryCategory refuses while the category still holds items —
// including discontinued ones, which are still referenced by plans.
func DeleteInventoryCategory(database *sql.DB, inventoryID, categoryID int64) error {
	category, err := GetInventoryCategory(database, inventoryID, categoryID)
	if err != nil {
		return err
	}
	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM inventory_items WHERE category_id = ?`, categoryID).Scan(&count); err != nil {
		return fmt.Errorf("count category items: %w", err)
	}
	if count > 0 {
		return CategoryInUseError{Name: category.Name, Count: count}
	}
	if _, err := database.Exec(`DELETE FROM inventory_categories WHERE id = ? AND inventory_id = ?`, categoryID, inventoryID); err != nil {
		return fmt.Errorf("delete inventory category: %w", err)
	}
	return nil
}

func categoryNameTaken(database *sql.DB, inventoryID int64, name string, excludeID int64) (bool, error) {
	var found int
	err := database.QueryRow(
		`SELECT 1 FROM inventory_categories WHERE inventory_id = ? AND LOWER(name) = LOWER(?) AND id <> ? LIMIT 1`,
		inventoryID, strings.TrimSpace(name), excludeID).Scan(&found)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check category name: %w", err)
	}
	return true, nil
}

// CreateInventoryItem adds an item by hand. is_manual is set here and
// nowhere else, and is never accepted from the client: it is the server's
// record of who owns the row, which is what keeps imports off it.
func CreateInventoryItem(database *sql.DB, inventoryID int64, req domain.InventoryItemRequest) (domain.InventoryItem, error) {
	if _, err := GetInventoryCategory(database, inventoryID, req.CategoryID); err != nil {
		return domain.InventoryItem{}, err
	}
	result, err := database.Exec(
		`INSERT INTO inventory_items (inventory_id, category_id, name, description, quantity_available, price_ex_vat, discontinued, is_manual) VALUES (?, ?, ?, ?, ?, ?, 0, 1)`,
		inventoryID, req.CategoryID, req.Name, nullString(req.Description), req.QuantityAvailable, req.PriceExVAT)
	if err != nil {
		return domain.InventoryItem{}, fmt.Errorf("create inventory item: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.InventoryItem{}, fmt.Errorf("inventory item last insert id: %w", err)
	}
	return GetInventoryItem(database, id)
}

// UpdateInventoryItem applies a partial update. It works on imported items
// too — correcting a supplier's price is legitimate — but is_manual is not
// updatable, so a corrected imported row stays subject to the next
// import's sweep rather than quietly becoming the user's.
func UpdateInventoryItem(database *sql.DB, inventoryID, itemID int64, req domain.InventoryItemPatch) (domain.InventoryItem, error) {
	existing, err := GetInventoryItem(database, itemID)
	if err != nil {
		return domain.InventoryItem{}, err
	}
	if existing.InventoryID != inventoryID {
		return domain.InventoryItem{}, sql.ErrNoRows
	}
	if req.CategoryID != nil {
		if _, err := GetInventoryCategory(database, inventoryID, *req.CategoryID); err != nil {
			return domain.InventoryItem{}, err
		}
		existing.CategoryID = *req.CategoryID
	}
	if req.Name != nil {
		existing.Name = *req.Name
	}
	if req.Description != nil {
		existing.Description = *req.Description
	}
	if req.QuantityAvailable != nil {
		existing.QuantityAvailable = *req.QuantityAvailable
	}
	if req.PriceExVAT != nil {
		existing.PriceExVAT = *req.PriceExVAT
	}
	if _, err := database.Exec(
		`UPDATE inventory_items SET category_id = ?, name = ?, description = ?, quantity_available = ?, price_ex_vat = ? WHERE id = ? AND inventory_id = ?`,
		existing.CategoryID, existing.Name, nullString(existing.Description), existing.QuantityAvailable, existing.PriceExVAT, itemID, inventoryID); err != nil {
		return domain.InventoryItem{}, fmt.Errorf("update inventory item: %w", err)
	}
	return GetInventoryItem(database, itemID)
}

// DeleteInventoryItem refuses (ItemInUseError) while any plan references
// the item. Cascading would destroy planning work to satisfy a catalog
// edit, and marking it discontinued instead would corrupt that flag's
// meaning ("gone from the supplier's list") and the export's unplaced-line
// reasoning.
func DeleteInventoryItem(database *sql.DB, inventoryID, itemID int64) error {
	item, err := GetInventoryItem(database, itemID)
	if err != nil {
		return err
	}
	if item.InventoryID != inventoryID {
		return sql.ErrNoRows
	}
	count, err := CountItemReferences(database, itemID)
	if err != nil {
		return err
	}
	if count > 0 {
		return ItemInUseError{Name: item.Name, Count: count}
	}
	if _, err := database.Exec(`DELETE FROM inventory_items WHERE id = ? AND inventory_id = ?`, itemID, inventoryID); err != nil {
		return fmt.Errorf("delete inventory item: %w", err)
	}
	return nil
}
