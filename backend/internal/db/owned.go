package db

import (
	"database/sql"
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
)

const ownedItemColumns = `o.id, o.name, COALESCE(o.description, ''), o.category_type, o.quantity_owned, COALESCE(o.notes, ''), COALESCE(o.created_at, ''),
	(SELECT COUNT(DISTINCT e.event_id) FROM event_owned_equipment e WHERE e.owned_item_id = o.id)`

func ListOwnedItems(db *sql.DB) ([]domain.OwnedItem, error) {
	rows, err := db.Query(`SELECT ` + ownedItemColumns + ` FROM owned_items o ORDER BY o.category_type ASC, o.name ASC`)
	if err != nil {
		return nil, fmt.Errorf("list owned items: %w", err)
	}
	defer rows.Close()
	items := make([]domain.OwnedItem, 0)
	for rows.Next() {
		item, err := scanOwnedItem(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func GetOwnedItem(db *sql.DB, id int64) (domain.OwnedItem, error) {
	row := db.QueryRow(`SELECT `+ownedItemColumns+` FROM owned_items o WHERE o.id = ?`, id)
	return scanOwnedItem(row)
}

func CreateOwnedItem(db *sql.DB, item domain.OwnedItem) (domain.OwnedItem, error) {
	result, err := db.Exec(`INSERT INTO owned_items (name, description, category_type, quantity_owned, notes) VALUES (?, ?, ?, ?, ?)`,
		item.Name, nullString(item.Description), item.CategoryType, item.QuantityOwned, nullString(item.Notes))
	if err != nil {
		return domain.OwnedItem{}, fmt.Errorf("create owned item: %w", err)
	}
	id, _ := result.LastInsertId()
	return GetOwnedItem(db, id)
}

func UpdateOwnedItem(db *sql.DB, id int64, item domain.OwnedItem) (domain.OwnedItem, error) {
	_, err := db.Exec(`UPDATE owned_items SET name = ?, description = ?, category_type = ?, quantity_owned = ?, notes = ? WHERE id = ?`,
		item.Name, nullString(item.Description), item.CategoryType, item.QuantityOwned, nullString(item.Notes), id)
	if err != nil {
		return domain.OwnedItem{}, fmt.Errorf("update owned item: %w", err)
	}
	return GetOwnedItem(db, id)
}

// DeleteOwnedItem removes the catalog entry; event lines referencing it are
// removed by the ON DELETE CASCADE constraint.
func DeleteOwnedItem(db *sql.DB, id int64) error {
	if _, err := db.Exec(`DELETE FROM owned_items WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete owned item: %w", err)
	}
	return nil
}

func scanOwnedItem(row scanner) (domain.OwnedItem, error) {
	var item domain.OwnedItem
	if err := row.Scan(&item.ID, &item.Name, &item.Description, &item.CategoryType, &item.QuantityOwned, &item.Notes, &item.CreatedAt, &item.PlannedOnEvents); err != nil {
		return domain.OwnedItem{}, fmt.Errorf("scan owned item: %w", err)
	}
	return item, nil
}

const eventOwnedEquipmentQuery = `
	SELECT e.owned_item_id, o.name, o.category_type, e.quantity, o.quantity_owned, COALESCE(e.notes, '')
	FROM event_owned_equipment e
	JOIN owned_items o ON o.id = e.owned_item_id
	WHERE e.event_id = ?
	ORDER BY o.category_type ASC, o.name ASC`

func ListEventOwnedEquipment(db *sql.DB, eventID int64) ([]domain.EventOwnedEquipment, error) {
	rows, err := db.Query(eventOwnedEquipmentQuery, eventID)
	if err != nil {
		return nil, fmt.Errorf("list event owned equipment: %w", err)
	}
	defer rows.Close()
	lines := make([]domain.EventOwnedEquipment, 0)
	for rows.Next() {
		line, err := scanEventOwnedEquipment(rows)
		if err != nil {
			return nil, err
		}
		lines = append(lines, line)
	}
	return lines, rows.Err()
}

// GetEventOwnedEquipment returns one event line; sql.ErrNoRows (wrapped)
// when the event has no line for the item.
func GetEventOwnedEquipment(db *sql.DB, eventID, ownedItemID int64) (domain.EventOwnedEquipment, error) {
	row := db.QueryRow(`
		SELECT e.owned_item_id, o.name, o.category_type, e.quantity, o.quantity_owned, COALESCE(e.notes, '')
		FROM event_owned_equipment e
		JOIN owned_items o ON o.id = e.owned_item_id
		WHERE e.event_id = ? AND e.owned_item_id = ?`, eventID, ownedItemID)
	return scanEventOwnedEquipment(row)
}

// UpsertEventOwnedEquipment sets the owned-gear line for an item on an
// event; quantity zero removes the line (idempotent with delete).
func UpsertEventOwnedEquipment(db *sql.DB, eventID, ownedItemID int64, req domain.OwnedEquipmentRequest) error {
	if req.Quantity == 0 {
		return DeleteEventOwnedEquipment(db, eventID, ownedItemID)
	}
	_, err := db.Exec(`INSERT INTO event_owned_equipment (event_id, owned_item_id, quantity, notes)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(event_id, owned_item_id) DO UPDATE SET
			quantity = excluded.quantity,
			notes = excluded.notes`,
		eventID, ownedItemID, req.Quantity, nullString(req.Notes))
	if err != nil {
		return fmt.Errorf("upsert event owned equipment: %w", err)
	}
	return nil
}

func DeleteEventOwnedEquipment(db *sql.DB, eventID, ownedItemID int64) error {
	if _, err := db.Exec(`DELETE FROM event_owned_equipment WHERE event_id = ? AND owned_item_id = ?`, eventID, ownedItemID); err != nil {
		return fmt.Errorf("delete event owned equipment: %w", err)
	}
	return nil
}

func scanEventOwnedEquipment(row scanner) (domain.EventOwnedEquipment, error) {
	var line domain.EventOwnedEquipment
	if err := row.Scan(&line.OwnedItemID, &line.OwnedItemName, &line.CategoryType, &line.Quantity, &line.QuantityOwned, &line.Notes); err != nil {
		return domain.EventOwnedEquipment{}, fmt.Errorf("scan event owned equipment: %w", err)
	}
	line.IsOverOwned = line.Quantity > line.QuantityOwned
	return line, nil
}
