package db

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
)

// ListEventsForUser returns only events the user owns or is a member of,
// each annotated with that user's role (FR-008 — an event the user has no
// role on is completely absent, not just unlisted).
func ListEventsForUser(db *sql.DB, userID int64) ([]domain.Event, error) {
	rows, err := db.Query(`
		SELECT e.id, e.name, COALESCE(e.date, ''), COALESCE(e.venue, ''), COALESCE(e.notes, ''), COALESCE(e.created_at, ''), COALESCE(e.updated_at, ''), COALESCE(e.inventory_id, 0),
			CASE WHEN e.owner_user_id = ? THEN 'owner' ELSE m.role END AS your_role
		FROM events e
		LEFT JOIN event_memberships m ON m.event_id = e.id AND m.user_id = ?
		WHERE e.owner_user_id = ? OR m.user_id IS NOT NULL
		ORDER BY e.date IS NULL, e.date ASC, e.id DESC`, userID, userID, userID)
	if err != nil {
		return nil, fmt.Errorf("list events for user: %w", err)
	}
	defer rows.Close()

	events := make([]domain.Event, 0)
	for rows.Next() {
		var event domain.Event
		if err := rows.Scan(&event.ID, &event.Name, &event.Date, &event.Venue, &event.Notes, &event.CreatedAt, &event.UpdatedAt, &event.InventoryID, &event.YourRole); err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

// GetEventRole reports the given user's role on eventID: "owner", a
// membership role ("contributor"/"viewer"), or found=false if the user
// has no role on the event at all (including a nonexistent event) — the
// caller (middleware.RequireEventAccess) treats not-found as a 404, since
// the event must be completely invisible to non-members (FR-008).
func GetEventRole(db *sql.DB, eventID, userID int64) (string, bool, error) {
	var ownerID sql.NullInt64
	err := db.QueryRow(`SELECT owner_user_id FROM events WHERE id = ?`, eventID).Scan(&ownerID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("get event owner: %w", err)
	}
	if ownerID.Valid && ownerID.Int64 == userID {
		return "owner", true, nil
	}

	var role string
	err = db.QueryRow(`SELECT role FROM event_memberships WHERE event_id = ? AND user_id = ?`, eventID, userID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("get event role: %w", err)
	}
	return role, true, nil
}

// ClaimOwnerlessEvents assigns userID as owner of every event that
// predates this feature (owner_user_id still NULL). The WHERE clause is
// itself the atomic guard (research.md R3): calling this on every login
// is safe and correct with no separate "am I the first user" check —
// whoever logs in first after this ships claims every such event, and
// the same call is a no-op for everyone after that.
func ClaimOwnerlessEvents(db *sql.DB, userID int64) (int64, error) {
	result, err := db.Exec(`UPDATE events SET owner_user_id = ? WHERE owner_user_id IS NULL`, userID)
	if err != nil {
		return 0, fmt.Errorf("claim ownerless events: %w", err)
	}
	n, _ := result.RowsAffected()
	return n, nil
}

func GetEvent(db *sql.DB, id int64) (domain.Event, error) {
	var event domain.Event
	err := db.QueryRow(`SELECT id, name, COALESCE(date, ''), COALESCE(venue, ''), COALESCE(notes, ''), COALESCE(created_at, ''), COALESCE(updated_at, ''), COALESCE(inventory_id, 0) FROM events WHERE id = ?`, id).
		Scan(&event.ID, &event.Name, &event.Date, &event.Venue, &event.Notes, &event.CreatedAt, &event.UpdatedAt, &event.InventoryID)
	if err != nil {
		return domain.Event{}, err
	}
	return event, nil
}

func CreateEvent(db *sql.DB, event domain.Event, ownerUserID, inventoryID int64) (domain.Event, error) {
	tx, err := db.Begin()
	if err != nil {
		return domain.Event{}, fmt.Errorf("create event: %w", err)
	}
	defer tx.Rollback()

	result, err := tx.Exec(`INSERT INTO events (name, date, venue, notes, owner_user_id, inventory_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, event.Name, nullString(event.Date), nullString(event.Venue), nullString(event.Notes), ownerUserID, inventoryID)
	if err != nil {
		return domain.Event{}, fmt.Errorf("create event: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.Event{}, fmt.Errorf("event last insert id: %w", err)
	}
	// Every event carries the built-in LR main group from birth.
	if _, err := tx.Exec(`INSERT INTO mixer_groups (event_id, name, is_builtin) VALUES (?, 'LR', 1)`, id); err != nil {
		return domain.Event{}, fmt.Errorf("seed LR group: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return domain.Event{}, fmt.Errorf("create event: %w", err)
	}
	return GetEvent(db, id)
}

func UpdateEvent(db *sql.DB, id int64, event domain.Event) (domain.Event, error) {
	_, err := db.Exec(`UPDATE events SET name = ?, date = ?, venue = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, event.Name, nullString(event.Date), nullString(event.Venue), nullString(event.Notes), id)
	if err != nil {
		return domain.Event{}, fmt.Errorf("update event: %w", err)
	}
	return GetEvent(db, id)
}

func DeleteEvent(db *sql.DB, id int64) error {
	_, err := db.Exec(`DELETE FROM events WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete event: %w", err)
	}
	return nil
}
