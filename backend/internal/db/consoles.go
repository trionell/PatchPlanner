package db

import (
	"database/sql"
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
)

const consoleColumns = `id, event_id, name, role, inventory_item_id, owned_item_id,
	input_count, output_count, local_input_count, local_output_count,
	position_x, position_y, input_position_x, input_position_y,
	local_position_x, local_position_y, local_input_position_x, local_input_position_y,
	desk_model, bus_mode, recorder, recorder_tracks`

func scanConsole(row scanner) (domain.Console, error) {
	var console domain.Console
	var invID, ownedID sql.NullInt64
	if err := row.Scan(&console.ID, &console.EventID, &console.Name, &console.Role, &invID, &ownedID,
		&console.InputCount, &console.OutputCount, &console.LocalInputCount, &console.LocalOutputCount,
		&console.PositionX, &console.PositionY, &console.InputPositionX, &console.InputPositionY,
		&console.LocalPositionX, &console.LocalPositionY, &console.LocalInputPositionX, &console.LocalInputPositionY,
		&console.DeskModel, &console.BusMode, &console.Recorder, &console.RecorderTracks); err != nil {
		return domain.Console{}, err
	}
	if invID.Valid {
		console.InventoryItemID = &invID.Int64
	}
	if ownedID.Valid {
		console.OwnedItemID = &ownedID.Int64
	}
	return console, nil
}

func ListConsoles(db *sql.DB, eventID int64) ([]domain.Console, error) {
	rows, err := db.Query(`SELECT `+consoleColumns+` FROM event_consoles WHERE event_id = ? ORDER BY id ASC`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list consoles: %w", err)
	}
	defer rows.Close()
	consoles := make([]domain.Console, 0)
	for rows.Next() {
		console, err := scanConsole(rows)
		if err != nil {
			return nil, fmt.Errorf("scan console: %w", err)
		}
		consoles = append(consoles, console)
	}
	return consoles, rows.Err()
}

func GetConsole(db *sql.DB, id int64) (domain.Console, error) {
	return scanConsole(db.QueryRow(`SELECT `+consoleColumns+` FROM event_consoles WHERE id = ?`, id))
}

// localPanelDefaultX/Y start a desk's local jack panel inside the processing
// lane, left of and below where a new stagebox lands (420 / 60), so nothing opens
// stacked. They mirror the DEFAULTs in migration 043, which apply to rows the
// migration and CreateEvent produce — this INSERT names the columns explicitly,
// so a zero would override the default and drop the panel on the canvas origin.
const (
	localPanelDefaultX = 260.0
	localPanelDefaultY = 320.0

	// railDefaultX/Y start a desk's two rails where migration 047 put the existing
	// ones. Before Slice 37 these columns were never read — both canvases pinned the
	// rails to the coordinate space's edges — so a desk created with the zeroes the
	// schema defaults to looked fine. It does not any more: the input canvas draws the
	// channel rail at its stored x, and (0, 0) is on top of the Sources rail at (24, 24).
	busRailDefaultX     = 24.0
	channelRailDefaultX = 1400.0
	railDefaultY        = 24.0
)

func CreateConsole(db *sql.DB, console domain.Console) (domain.Console, error) {
	// A create never means "put it at the origin": the canvas clamps the
	// processing lane away from x = 0, so an all-zero pair is an unset pair.
	if console.LocalPositionX == 0 && console.LocalPositionY == 0 {
		console.LocalPositionX, console.LocalPositionY = localPanelDefaultX, localPanelDefaultY
	}
	if console.LocalInputPositionX == 0 && console.LocalInputPositionY == 0 {
		console.LocalInputPositionX, console.LocalInputPositionY = localPanelDefaultX, localPanelDefaultY
	}
	// The bus rail on the output canvas and the channel rail on the input canvas. Same
	// rule, same reason: an all-zero pair is an unset pair, not a placement at the origin.
	if console.PositionX == 0 && console.PositionY == 0 {
		console.PositionX, console.PositionY = busRailDefaultX, railDefaultY
	}
	if console.InputPositionX == 0 && console.InputPositionY == 0 {
		console.InputPositionX, console.InputPositionY = channelRailDefaultX, railDefaultY
	}
	result, err := db.Exec(`INSERT INTO event_consoles
		(event_id, name, role, inventory_item_id, owned_item_id, input_count, output_count, local_input_count, local_output_count,
		 position_x, position_y, input_position_x, input_position_y,
		 local_position_x, local_position_y, local_input_position_x, local_input_position_y,
		 desk_model, bus_mode)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		console.EventID, console.Name, console.Role, nullInt64(console.InventoryItemID), nullInt64(console.OwnedItemID),
		console.InputCount, console.OutputCount, console.LocalInputCount, console.LocalOutputCount,
		console.PositionX, console.PositionY, console.InputPositionX, console.InputPositionY,
		console.LocalPositionX, console.LocalPositionY, console.LocalInputPositionX, console.LocalInputPositionY,
		deskModelOrGeneric(console.DeskModel), console.BusMode)
	if err != nil {
		return domain.Console{}, fmt.Errorf("create console: %w", err)
	}
	id, _ := result.LastInsertId()
	created, err := GetConsole(db, id)
	if err != nil {
		return domain.Console{}, err
	}
	// Every desk has its mains from the moment it exists (Slice 48 D3).
	if err := EnsureDeskMains(db, created); err != nil {
		return domain.Console{}, err
	}
	return created, nil
}

func UpdateConsole(db *sql.DB, id int64, console domain.Console) (domain.Console, error) {
	_, err := db.Exec(`UPDATE event_consoles SET name = ?, role = ?, inventory_item_id = ?, owned_item_id = ?,
		input_count = ?, output_count = ?, local_input_count = ?, local_output_count = ?,
		position_x = ?, position_y = ?, input_position_x = ?, input_position_y = ?,
		local_position_x = ?, local_position_y = ?, local_input_position_x = ?, local_input_position_y = ?,
		desk_model = ?, bus_mode = ? WHERE id = ?`,
		console.Name, console.Role, nullInt64(console.InventoryItemID), nullInt64(console.OwnedItemID),
		console.InputCount, console.OutputCount, console.LocalInputCount, console.LocalOutputCount,
		console.PositionX, console.PositionY, console.InputPositionX, console.InputPositionY,
		console.LocalPositionX, console.LocalPositionY, console.LocalInputPositionX, console.LocalInputPositionY,
		deskModelOrGeneric(console.DeskModel), console.BusMode, id)
	if err != nil {
		return domain.Console{}, fmt.Errorf("update console: %w", err)
	}
	return GetConsole(db, id)
}

// DeleteConsole removes the desk and clears every cable landing on its local
// jacks, in one transaction, returning how many it cleared — the same shape
// as DeleteStagebox. The channels and outputs planned on it are deliberately
// *not* deleted: their console_id nulls out via ON DELETE SET NULL, because
// removing a desk from the plan must never remove the patch.
func DeleteConsole(db *sql.DB, id int64) (int, error) {
	tx, err := db.Begin()
	if err != nil {
		return 0, fmt.Errorf("delete console: %w", err)
	}
	defer tx.Rollback()

	cleared := 0
	for _, table := range []string{"input_cables", "output_cables"} {
		result, err := tx.Exec(`DELETE FROM `+table+` WHERE (from_kind = 'console_local' AND from_id = ?) OR (to_kind = 'console_local' AND to_id = ?)`, id, id)
		if err != nil {
			return 0, fmt.Errorf("clear %s console references: %w", table, err)
		}
		affected, _ := result.RowsAffected()
		cleared += int(affected)
	}
	if _, err := tx.Exec(`DELETE FROM event_consoles WHERE id = ?`, id); err != nil {
		return 0, fmt.Errorf("delete console: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("delete console: %w", err)
	}
	return cleared, nil
}

// ConsoleUsage is what the Rig drawer and the status rail state about one
// desk: what it can take against what the patch actually puts on it. Every
// figure is derived, never stored — the same rule stageboxes already follow.
type ConsoleUsage struct {
	InputsUsed       int `json:"inputs_used"`
	OutputsUsed      int `json:"outputs_used"`
	LocalInputsUsed  int `json:"local_inputs_used"`
	LocalOutputsUsed int `json:"local_outputs_used"`
}

func GetConsoleUsage(db *sql.DB, id int64) (ConsoleUsage, error) {
	var usage ConsoleUsage
	err := db.QueryRow(`SELECT
		(SELECT COUNT(*) FROM input_channels WHERE console_id = ?),
		(SELECT COUNT(*) FROM audio_patch_outputs WHERE console_id = ?),
		(SELECT COUNT(DISTINCT to_port) FROM input_cables WHERE to_kind = 'console_local' AND to_id = ?),
		(SELECT COUNT(DISTINCT from_port) FROM output_cables WHERE from_kind = 'console_local' AND from_id = ?)`,
		id, id, id, id).Scan(&usage.InputsUsed, &usage.OutputsUsed, &usage.LocalInputsUsed, &usage.LocalOutputsUsed)
	if err != nil {
		return ConsoleUsage{}, fmt.Errorf("console usage: %w", err)
	}
	return usage, nil
}

// ConsoleLocalPortConflicts lists the patched local jacks that a proposed
// count would orphan — the check behind the 409 on shrinking a console
// (FR-024), mirroring the stagebox and device count guards. Jack indices are
// returned one-based, as they are displayed.
func ConsoleLocalPortConflicts(db *sql.DB, id int64, newInputCount, newOutputCount int) ([]string, error) {
	conflicts := make([]string, 0)
	queries := []struct {
		label string
		query string
		limit int
	}{
		{"local in", `SELECT DISTINCT to_port FROM input_cables WHERE to_kind = 'console_local' AND to_id = ? AND to_port >= ? ORDER BY to_port`, newInputCount},
		{"local out", `SELECT DISTINCT from_port FROM output_cables WHERE from_kind = 'console_local' AND from_id = ? AND from_port >= ? ORDER BY from_port`, newOutputCount},
	}
	for _, q := range queries {
		rows, err := db.Query(q.query, id, q.limit)
		if err != nil {
			return nil, fmt.Errorf("console port conflicts: %w", err)
		}
		for rows.Next() {
			var port int
			if err := rows.Scan(&port); err != nil {
				rows.Close()
				return nil, fmt.Errorf("scan console port conflict: %w", err)
			}
			conflicts = append(conflicts, fmt.Sprintf("%s %d", q.label, port+1))
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, fmt.Errorf("console port conflicts: %w", err)
		}
	}
	return conflicts, nil
}

// ConsoleLocalPortCounts sizes the console_local port sides, for validating a
// cable endpoint against the desk's declared jacks.
func ConsoleLocalPortCounts(db *sql.DB, id int64) (inputs, outputs int, err error) {
	err = db.QueryRow(`SELECT local_input_count, local_output_count FROM event_consoles WHERE id = ?`, id).Scan(&inputs, &outputs)
	if err != nil {
		return 0, 0, fmt.Errorf("console local port counts: %w", err)
	}
	return inputs, outputs, nil
}

// DefaultConsoleID is the console a new channel or output belongs to when the
// event has exactly one — the overwhelmingly common case, and the one where
// asking the user to pick would be noise. With none or several declared it
// returns nil and the caller leaves console_id unset.
func DefaultConsoleID(db *sql.DB, eventID int64) (*int64, error) {
	var id int64
	var count int
	err := db.QueryRow(`SELECT COUNT(*), COALESCE(MIN(id), 0) FROM event_consoles WHERE event_id = ?`, eventID).Scan(&count, &id)
	if err != nil {
		return nil, fmt.Errorf("default console: %w", err)
	}
	if count != 1 {
		return nil, nil
	}
	return &id, nil
}

// deskModelOrGeneric keeps a caller that predates Slice 47 — a test fixture,
// CreateEvent's console — from writing an empty model.
func deskModelOrGeneric(key string) string {
	if key == "" {
		return domain.DeskModelGeneric
	}
	return key
}
