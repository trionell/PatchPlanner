package db

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
)

// eventColumns is the one place an event's column list lives, prefixed for
// whichever query needs it. Two hand-maintained SELECT lists that must agree is
// how a column added to one and forgotten in the other becomes a field that is
// populated on one screen and zero on another — which is what Slice 31's four
// pricing columns would have risked.
func eventColumns(prefix string) string {
	return prefix + "id, " + prefix + "name, " +
		"COALESCE(" + prefix + "load_in_date, ''), COALESCE(" + prefix + "start_date, ''), " +
		"COALESCE(" + prefix + "end_date, ''), COALESCE(" + prefix + "load_out_date, ''), " +
		"COALESCE(" + prefix + "venue, ''), COALESCE(" + prefix + "notes, ''), " +
		"COALESCE(" + prefix + "created_at, ''), COALESCE(" + prefix + "updated_at, ''), " +
		"COALESCE(" + prefix + "inventory_id, 0), " +
		prefix + "charged_days, " + prefix + "rent_factor_override, " + prefix + "vat_percent, " +
		"COALESCE(" + prefix + "discount_percent, 0)"
}

// scanEvent reads eventColumns in order, plus whatever a query selected after
// them — ListEventsForUser appends the caller's role to the same row.
//
// The three pricing pointers stay nullable through the scan because NULL is a
// meaning here, "follow the catalog", and COALESCE-ing them to zero would turn
// every inheriting event into one charging nothing.
func scanEvent(row scanner, event *domain.Event, extra ...any) error {
	var chargedDays sql.NullString
	var rentFactorOverride, vatPercent sql.NullFloat64
	targets := append([]any{
		&event.ID, &event.Name, &event.LoadInDate, &event.StartDate, &event.EndDate,
		&event.LoadOutDate, &event.Venue, &event.Notes, &event.CreatedAt, &event.UpdatedAt,
		&event.InventoryID, &chargedDays, &rentFactorOverride, &vatPercent, &event.DiscountPercent,
	}, extra...)
	if err := row.Scan(targets...); err != nil {
		return err
	}
	event.ChargedDays = stringPtrFromNull(chargedDays)
	event.RentFactorOverride = floatPtrFromNull(rentFactorOverride)
	event.VATPercent = floatPtrFromNull(vatPercent)
	return nil
}

// ListEventsForUser returns only events the user owns or is a member of,
// each annotated with that user's role (FR-008 — an event the user has no
// role on is completely absent, not just unlisted).
func ListEventsForUser(db *sql.DB, userID int64) ([]domain.Event, error) {
	rows, err := db.Query(`
		SELECT `+eventColumns("e.")+`,
			CASE WHEN e.owner_user_id = ? THEN 'owner' ELSE m.role END AS your_role
		FROM events e
		LEFT JOIN event_memberships m ON m.event_id = e.id AND m.user_id = ?
		WHERE e.owner_user_id = ? OR m.user_id IS NOT NULL
		ORDER BY e.start_date IS NULL, e.start_date ASC, e.id DESC`, userID, userID, userID)
	if err != nil {
		return nil, fmt.Errorf("list events for user: %w", err)
	}
	defer rows.Close()

	events := make([]domain.Event, 0)
	for rows.Next() {
		var event domain.Event
		// The role rides along on the same row, after the shared columns.
		if err := scanEvent(rows, &event, &event.YourRole); err != nil {
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
	if err := scanEvent(db.QueryRow(`SELECT `+eventColumns("")+` FROM events WHERE id = ?`, id), &event); err != nil {
		return domain.Event{}, err
	}
	return event, nil
}

// UpdateEventPricing writes only this event's four pricing columns.
//
// Its own statement, and its own route, because UpdateEvent is a whole-object
// replace: folding pricing into it would mean the details drawer's Save — which
// sends a name, a venue, four dates and notes — silently wiped an agreed
// discount (research.md R3).
func UpdateEventPricing(db *sql.DB, id int64, req domain.EventPricingRequest) (domain.Event, error) {
	_, err := db.Exec(`UPDATE events SET charged_days = ?, rent_factor_override = ?, vat_percent = ?, discount_percent = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		nullStringPtr(req.ChargedDays), nullFloat(req.RentFactorOverride), nullFloat(req.VATPercent), req.DiscountPercent, id)
	if err != nil {
		return domain.Event{}, fmt.Errorf("update event pricing: %w", err)
	}
	return GetEvent(db, id)
}

func CreateEvent(db *sql.DB, event domain.Event, ownerUserID, inventoryID int64) (domain.Event, error) {
	tx, err := db.Begin()
	if err != nil {
		return domain.Event{}, fmt.Errorf("create event: %w", err)
	}
	defer tx.Rollback()

	result, err := tx.Exec(`INSERT INTO events (name, load_in_date, start_date, end_date, load_out_date, venue, notes, owner_user_id, inventory_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
		event.Name, nullString(event.LoadInDate), nullString(event.StartDate), nullString(event.EndDate), nullString(event.LoadOutDate), nullString(event.Venue), nullString(event.Notes), ownerUserID, inventoryID)
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
	// And one console, unnamed with no item and no declared capacity (Slice
	// 23) — the same state migration 042 backfilled onto every existing
	// event, so the new-event and migrated-event paths are identical. It adds
	// no rental line and raises no capacity warning until a user fills it in,
	// but it gives both graphs a desk node from the start and lets a channel
	// know which desk it is a strip on without anyone picking.
	// The rail positions are named rather than left to the schema's zeroes: since
	// Slice 37 both canvases draw a rail where its columns say, and (0, 0) is on top of
	// the node beside it. Same constants CreateConsole falls back to.
	if _, err := tx.Exec(`INSERT INTO event_consoles (event_id, name, role, position_x, position_y, input_position_x, input_position_y)
		VALUES (?, '', 'foh', ?, ?, ?, ?)`, id, busRailDefaultX, railDefaultY, channelRailDefaultX, railDefaultY); err != nil {
		return domain.Event{}, fmt.Errorf("seed console: %w", err)
	}
	// The event's vocabulary starts as a one-time snapshot of the
	// creator's current personal template — a flat copy with no
	// id-remapping, since nothing references reference_values.id by
	// foreign key (Slice 17 research.md R1).
	if _, err := tx.Exec(`
		INSERT INTO reference_values (event_id, vocabulary, value, label)
		SELECT ?, vocabulary, value, label FROM reference_templates WHERE owner_user_id = ?`, id, ownerUserID); err != nil {
		return domain.Event{}, fmt.Errorf("seed event vocabulary from template: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return domain.Event{}, fmt.Errorf("create event: %w", err)
	}
	return GetEvent(db, id)
}

func UpdateEvent(db *sql.DB, id int64, event domain.Event) (domain.Event, error) {
	_, err := db.Exec(`UPDATE events SET name = ?, load_in_date = ?, start_date = ?, end_date = ?, load_out_date = ?, venue = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		event.Name, nullString(event.LoadInDate), nullString(event.StartDate), nullString(event.EndDate), nullString(event.LoadOutDate), nullString(event.Venue), nullString(event.Notes), id)
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
