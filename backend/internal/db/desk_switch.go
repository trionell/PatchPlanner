package db

import (
	"database/sql"
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
)

// DeskStripRows lists a desk's channels as the strip rules see them.
func DeskStripRows(db *sql.DB, consoleID int64) ([]domain.StripRow, error) {
	return stripRows(db, `WHERE console_id = ?`, consoleID)
}

// DesklessStripRows lists an event's channels that are on no desk.
func DesklessStripRows(db *sql.DB, eventID int64) ([]domain.StripRow, error) {
	return stripRows(db, `WHERE event_id = ? AND console_id IS NULL`, eventID)
}

func stripRows(db *sql.DB, where string, arg int64) ([]domain.StripRow, error) {
	rows, err := db.Query(`SELECT id, channel_number, width, mixer_behavior, strip_pool, COALESCE(channel_name, '')
		FROM input_channels `+where+` ORDER BY channel_number, id`, arg)
	if err != nil {
		return nil, fmt.Errorf("strip rows: %w", err)
	}
	defer rows.Close()
	out := make([]domain.StripRow, 0)
	for rows.Next() {
		var row domain.StripRow
		if err := rows.Scan(&row.ID, &row.Number, &row.Width, &row.MixerBehavior, &row.Pool, &row.Name); err != nil {
			return nil, fmt.Errorf("scan strip row: %w", err)
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// DeskLocalUse lists the desk's local jacks that carry a cable on either side,
// each labelled by the channel or output it serves where there is one.
func DeskLocalUse(db *sql.DB, consoleID int64) (domain.LocalUse, error) {
	var use domain.LocalUse
	var err error
	use.Inputs, err = jackUse(db, `
		SELECT p.port, COALESCE((
			SELECT COALESCE(NULLIF(c.channel_name, ''), 'Ch ' || c.channel_number)
			FROM input_cables k JOIN input_channels c ON c.id = k.to_id
			WHERE k.from_kind = 'console_local' AND k.from_id = ?1 AND k.from_port = p.port AND k.to_kind = 'channel'
			LIMIT 1), 'unpatched')
		FROM (SELECT to_port AS port FROM input_cables WHERE to_kind = 'console_local' AND to_id = ?1
		      UNION SELECT from_port FROM input_cables WHERE from_kind = 'console_local' AND from_id = ?1) p
		ORDER BY p.port`, consoleID)
	if err != nil {
		return use, err
	}
	use.Outputs, err = jackUse(db, `
		SELECT p.port, COALESCE((
			SELECT COALESCE(NULLIF(o.output_name, ''), 'Out ' || o.output_number)
			FROM output_cables k JOIN audio_patch_outputs o ON o.id = k.from_id
			WHERE k.to_kind = 'console_local' AND k.to_id = ?1 AND k.to_port = p.port AND k.from_kind = 'mixer'
			LIMIT 1), 'unpatched')
		FROM (SELECT to_port AS port FROM output_cables WHERE to_kind = 'console_local' AND to_id = ?1
		      UNION SELECT from_port FROM output_cables WHERE from_kind = 'console_local' AND from_id = ?1) p
		ORDER BY p.port`, consoleID)
	return use, err
}

func jackUse(db *sql.DB, query string, consoleID int64) ([]domain.JackUse, error) {
	rows, err := db.Query(query, consoleID)
	if err != nil {
		return nil, fmt.Errorf("local jack use: %w", err)
	}
	defer rows.Close()
	out := make([]domain.JackUse, 0)
	for rows.Next() {
		var jack domain.JackUse
		if err := rows.Scan(&jack.Port, &jack.Label); err != nil {
			return nil, fmt.Errorf("scan jack use: %w", err)
		}
		out = append(out, jack)
	}
	return out, rows.Err()
}

// StripPlacement is where a switch or a placing puts one channel.
type StripPlacement struct {
	ID            int64
	Number        int
	Pool          string
	MixerBehavior string
}

// ApplyDeskSwitch writes a model switch in one transaction: the console's
// model, bus mode and counts, and every channel's new number, pool and
// stereo behaviour. Nothing is deleted.
func ApplyDeskSwitch(db *sql.DB, console domain.Console, rows []StripPlacement) (domain.Console, error) {
	tx, err := db.Begin()
	if err != nil {
		return domain.Console{}, fmt.Errorf("apply desk switch: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE event_consoles SET desk_model = ?, bus_mode = ?, input_count = ?, output_count = ?, local_input_count = ?, local_output_count = ? WHERE id = ?`,
		console.DeskModel, console.BusMode, console.InputCount, console.OutputCount, console.LocalInputCount, console.LocalOutputCount, console.ID); err != nil {
		return domain.Console{}, fmt.Errorf("apply desk switch: %w", err)
	}
	if err := placeChannels(tx, &console.ID, rows); err != nil {
		return domain.Console{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.Console{}, fmt.Errorf("apply desk switch: %w", err)
	}
	return GetConsole(db, console.ID)
}

// PlaceOnDesk puts deskless channels (at the given placements) and deskless
// outputs onto a desk, in one transaction.
func PlaceOnDesk(db *sql.DB, eventID, consoleID int64, channels []StripPlacement, outputIDs []int64) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("place on desk: %w", err)
	}
	defer tx.Rollback()
	if err := placeChannels(tx, &consoleID, channels); err != nil {
		return err
	}
	for _, id := range outputIDs {
		if _, err := tx.Exec(`UPDATE audio_patch_outputs SET console_id = ? WHERE id = ? AND event_id = ? AND console_id IS NULL`, consoleID, id, eventID); err != nil {
			return fmt.Errorf("place output: %w", err)
		}
	}
	return tx.Commit()
}

func placeChannels(tx *sql.Tx, consoleID *int64, rows []StripPlacement) error {
	for _, row := range rows {
		if _, err := tx.Exec(`UPDATE input_channels SET channel_number = ?, strip_pool = ?, mixer_behavior = ?, console_id = ? WHERE id = ?`,
			row.Number, row.Pool, row.MixerBehavior, nullInt64(consoleID), row.ID); err != nil {
			return fmt.Errorf("place channel %d: %w", row.ID, err)
		}
	}
	return nil
}

// DesklessOutputIDs lists an event's outputs that are on no desk.
func DesklessOutputIDs(db *sql.DB, eventID int64) ([]int64, error) {
	rows, err := db.Query(`SELECT id FROM audio_patch_outputs WHERE event_id = ? AND console_id IS NULL ORDER BY output_number, id`, eventID)
	if err != nil {
		return nil, fmt.Errorf("deskless outputs: %w", err)
	}
	defer rows.Close()
	ids := make([]int64, 0)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
