package db

import (
	"database/sql"
	"fmt"

	"github.com/trionell/patcherplanner/internal/domain"
)

func ListEvents(db *sql.DB) ([]domain.Event, error) {
	rows, err := db.Query(`SELECT id, name, COALESCE(date, ''), COALESCE(venue, ''), COALESCE(notes, ''), COALESCE(created_at, ''), COALESCE(updated_at, '') FROM events ORDER BY date IS NULL, date ASC, id DESC`)
	if err != nil {
		return nil, fmt.Errorf("list events: %w", err)
	}
	defer rows.Close()

	events := make([]domain.Event, 0)
	for rows.Next() {
		var event domain.Event
		if err := rows.Scan(&event.ID, &event.Name, &event.Date, &event.Venue, &event.Notes, &event.CreatedAt, &event.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

func GetEvent(db *sql.DB, id int64) (domain.Event, error) {
	var event domain.Event
	err := db.QueryRow(`SELECT id, name, COALESCE(date, ''), COALESCE(venue, ''), COALESCE(notes, ''), COALESCE(created_at, ''), COALESCE(updated_at, '') FROM events WHERE id = ?`, id).
		Scan(&event.ID, &event.Name, &event.Date, &event.Venue, &event.Notes, &event.CreatedAt, &event.UpdatedAt)
	if err != nil {
		return domain.Event{}, err
	}
	return event, nil
}

func CreateEvent(db *sql.DB, event domain.Event) (domain.Event, error) {
	result, err := db.Exec(`INSERT INTO events (name, date, venue, notes, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`, event.Name, nullString(event.Date), nullString(event.Venue), nullString(event.Notes))
	if err != nil {
		return domain.Event{}, fmt.Errorf("create event: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.Event{}, fmt.Errorf("event last insert id: %w", err)
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
