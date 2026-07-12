package db

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
)

// ErrBuiltin signals an attempt to rename or delete a built-in bus (the LR
// main group); handlers map it to HTTP 400. Recoloring built-ins is allowed.
var ErrBuiltin = errors.New("built-in bus")

// ListMixerGroups returns an event's groups, LR first, then name-sorted.
func ListMixerGroups(database *sql.DB, eventID int64) ([]domain.MixerGroup, error) {
	rows, err := database.Query(`SELECT id, event_id, name, is_builtin, COALESCE(color, '') FROM mixer_groups WHERE event_id = ? ORDER BY is_builtin DESC, name COLLATE NOCASE`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list mixer groups: %w", err)
	}
	defer rows.Close()
	groups := make([]domain.MixerGroup, 0)
	for rows.Next() {
		var g domain.MixerGroup
		var builtin int
		if err := rows.Scan(&g.ID, &g.EventID, &g.Name, &builtin, &g.Color); err != nil {
			return nil, fmt.Errorf("scan mixer group: %w", err)
		}
		g.IsBuiltin = builtin == 1
		groups = append(groups, g)
	}
	return groups, rows.Err()
}

// ListMixerDCAs returns an event's DCAs, name-sorted.
func ListMixerDCAs(database *sql.DB, eventID int64) ([]domain.MixerDCA, error) {
	rows, err := database.Query(`SELECT id, event_id, name, COALESCE(color, '') FROM mixer_dcas WHERE event_id = ? ORDER BY name COLLATE NOCASE`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list mixer dcas: %w", err)
	}
	defer rows.Close()
	dcas := make([]domain.MixerDCA, 0)
	for rows.Next() {
		var d domain.MixerDCA
		if err := rows.Scan(&d.ID, &d.EventID, &d.Name, &d.Color); err != nil {
			return nil, fmt.Errorf("scan mixer dca: %w", err)
		}
		dcas = append(dcas, d)
	}
	return dcas, rows.Err()
}

// CreateMixerGroup adds a group; a name already on the event (the NOCASE
// index makes the check case-insensitive) yields ErrDuplicate. Uniqueness is
// pre-checked rather than derived from the driver's constraint error:
// single-user tool, no races.
func CreateMixerGroup(database *sql.DB, eventID int64, name, color string) (domain.MixerGroup, error) {
	if err := checkBusNameFree(database, "mixer_groups", eventID, name, 0); err != nil {
		return domain.MixerGroup{}, err
	}
	result, err := database.Exec(`INSERT INTO mixer_groups (event_id, name, color) VALUES (?, ?, ?)`, eventID, name, nullString(color))
	if err != nil {
		return domain.MixerGroup{}, fmt.Errorf("create mixer group: %w", err)
	}
	id, _ := result.LastInsertId()
	return domain.MixerGroup{ID: id, EventID: eventID, Name: name, Color: color}, nil
}

// CreateMixerDCA adds a DCA; duplicate names yield ErrDuplicate.
func CreateMixerDCA(database *sql.DB, eventID int64, name, color string) (domain.MixerDCA, error) {
	if err := checkBusNameFree(database, "mixer_dcas", eventID, name, 0); err != nil {
		return domain.MixerDCA{}, err
	}
	result, err := database.Exec(`INSERT INTO mixer_dcas (event_id, name, color) VALUES (?, ?, ?)`, eventID, name, nullString(color))
	if err != nil {
		return domain.MixerDCA{}, fmt.Errorf("create mixer dca: %w", err)
	}
	id, _ := result.LastInsertId()
	return domain.MixerDCA{ID: id, EventID: eventID, Name: name, Color: color}, nil
}

// UpdateMixerGroup replaces a group's name and color. Renaming a built-in
// group yields ErrBuiltin (recoloring it is fine); name collisions yield
// ErrDuplicate; unknown or foreign-event ids yield sql.ErrNoRows.
func UpdateMixerGroup(database *sql.DB, eventID, groupID int64, name, color string) (domain.MixerGroup, error) {
	var currentName string
	var builtin int
	err := database.QueryRow(`SELECT name, is_builtin FROM mixer_groups WHERE id = ? AND event_id = ?`, groupID, eventID).Scan(&currentName, &builtin)
	if err != nil {
		return domain.MixerGroup{}, err
	}
	if builtin == 1 && name != currentName {
		return domain.MixerGroup{}, fmt.Errorf("%w: %q cannot be renamed", ErrBuiltin, currentName)
	}
	if err := checkBusNameFree(database, "mixer_groups", eventID, name, groupID); err != nil {
		return domain.MixerGroup{}, err
	}
	if _, err := database.Exec(`UPDATE mixer_groups SET name = ?, color = ? WHERE id = ?`, name, nullString(color), groupID); err != nil {
		return domain.MixerGroup{}, fmt.Errorf("update mixer group: %w", err)
	}
	return domain.MixerGroup{ID: groupID, EventID: eventID, Name: name, IsBuiltin: builtin == 1, Color: color}, nil
}

// UpdateMixerDCA replaces a DCA's name and color; same contract as groups
// minus the built-in rule.
func UpdateMixerDCA(database *sql.DB, eventID, dcaID int64, name, color string) (domain.MixerDCA, error) {
	var exists bool
	if err := database.QueryRow(`SELECT EXISTS(SELECT 1 FROM mixer_dcas WHERE id = ? AND event_id = ?)`, dcaID, eventID).Scan(&exists); err != nil {
		return domain.MixerDCA{}, fmt.Errorf("check mixer dca: %w", err)
	}
	if !exists {
		return domain.MixerDCA{}, sql.ErrNoRows
	}
	if err := checkBusNameFree(database, "mixer_dcas", eventID, name, dcaID); err != nil {
		return domain.MixerDCA{}, err
	}
	if _, err := database.Exec(`UPDATE mixer_dcas SET name = ?, color = ? WHERE id = ?`, name, nullString(color), dcaID); err != nil {
		return domain.MixerDCA{}, fmt.Errorf("update mixer dca: %w", err)
	}
	return domain.MixerDCA{ID: dcaID, EventID: eventID, Name: name, Color: color}, nil
}

// DeleteMixerGroup removes a group; its channel assignments cascade away.
// Built-in groups yield ErrBuiltin, unknown/foreign ids sql.ErrNoRows.
func DeleteMixerGroup(database *sql.DB, eventID, groupID int64) error {
	var builtin int
	err := database.QueryRow(`SELECT is_builtin FROM mixer_groups WHERE id = ? AND event_id = ?`, groupID, eventID).Scan(&builtin)
	if err != nil {
		return err
	}
	if builtin == 1 {
		return fmt.Errorf("%w: cannot be deleted", ErrBuiltin)
	}
	if _, err := database.Exec(`DELETE FROM mixer_groups WHERE id = ?`, groupID); err != nil {
		return fmt.Errorf("delete mixer group: %w", err)
	}
	return nil
}

// DeleteMixerDCA removes a DCA; its channel assignments cascade away.
func DeleteMixerDCA(database *sql.DB, eventID, dcaID int64) error {
	result, err := database.Exec(`DELETE FROM mixer_dcas WHERE id = ? AND event_id = ?`, dcaID, eventID)
	if err != nil {
		return fmt.Errorf("delete mixer dca: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("delete mixer dca result: %w", err)
	}
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// BusesBelongToEvent reports whether every id is a group (kind "group") or
// DCA (kind "dca") of the event. Empty/nil id sets trivially pass.
func BusesBelongToEvent(database *sql.DB, eventID int64, kind string, ids []int64) (bool, error) {
	unique := dedupeIDs(ids)
	if len(unique) == 0 {
		return true, nil
	}
	table := "mixer_groups"
	if kind == "dca" {
		table = "mixer_dcas"
	}
	query := `SELECT COUNT(*) FROM ` + table + ` WHERE event_id = ? AND id IN (`
	args := make([]any, 0, len(unique)+1)
	args = append(args, eventID)
	for i, id := range unique {
		if i > 0 {
			query += ", "
		}
		query += "?"
		args = append(args, id)
	}
	query += ")"
	var count int
	if err := database.QueryRow(query, args...).Scan(&count); err != nil {
		return false, fmt.Errorf("check %s ownership: %w", table, err)
	}
	return count == len(unique), nil
}

// loadInputGroupIDs returns every input channel's group memberships for
// one event. audio_input_groups still targets input_id — audio_patch_
// inputs was renamed to input_channels in place (Slice 12, research.md
// R4), so every existing row's id/membership survives untouched.
func loadInputGroupIDs(database *sql.DB, eventID int64) (map[int64][]int64, error) {
	return loadInputBusIDs(database, eventID, `SELECT ig.input_id, ig.group_id FROM audio_input_groups ig JOIN input_channels i ON i.id = ig.input_id WHERE i.event_id = ? ORDER BY ig.input_id, ig.group_id`)
}

// loadInputDCAIDs returns every input channel's DCA memberships for one event.
func loadInputDCAIDs(database *sql.DB, eventID int64) (map[int64][]int64, error) {
	return loadInputBusIDs(database, eventID, `SELECT id.input_id, id.dca_id FROM audio_input_dcas id JOIN input_channels i ON i.id = id.input_id WHERE i.event_id = ? ORDER BY id.input_id, id.dca_id`)
}

func loadInputBusIDs(database *sql.DB, eventID int64, query string) (map[int64][]int64, error) {
	rows, err := database.Query(query, eventID)
	if err != nil {
		return nil, fmt.Errorf("load input bus ids: %w", err)
	}
	defer rows.Close()
	byInput := make(map[int64][]int64)
	for rows.Next() {
		var inputID, busID int64
		if err := rows.Scan(&inputID, &busID); err != nil {
			return nil, fmt.Errorf("scan input bus id: %w", err)
		}
		byInput[inputID] = append(byInput[inputID], busID)
	}
	return byInput, rows.Err()
}

// replaceInputGroups rewrites one input's group memberships wholesale.
func replaceInputGroups(tx *sql.Tx, inputID int64, groupIDs []int64) error {
	return replaceInputBuses(tx, "audio_input_groups", "group_id", inputID, groupIDs)
}

// replaceInputDCAs rewrites one input's DCA memberships wholesale.
func replaceInputDCAs(tx *sql.Tx, inputID int64, dcaIDs []int64) error {
	return replaceInputBuses(tx, "audio_input_dcas", "dca_id", inputID, dcaIDs)
}

func replaceInputBuses(tx *sql.Tx, table, column string, inputID int64, ids []int64) error {
	if _, err := tx.Exec(`DELETE FROM `+table+` WHERE input_id = ?`, inputID); err != nil {
		return fmt.Errorf("clear %s: %w", table, err)
	}
	for _, id := range dedupeIDs(ids) {
		if _, err := tx.Exec(`INSERT INTO `+table+` (input_id, `+column+`) VALUES (?, ?)`, inputID, id); err != nil {
			return fmt.Errorf("insert %s: %w", table, err)
		}
	}
	return nil
}

// lrGroupID looks up the event's built-in LR group.
func lrGroupID(q interface {
	QueryRow(query string, args ...any) *sql.Row
}, eventID int64) (int64, error) {
	var id int64
	err := q.QueryRow(`SELECT id FROM mixer_groups WHERE event_id = ? AND is_builtin = 1`, eventID).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("look up LR group: %w", err)
	}
	return id, nil
}

// checkBusNameFree rejects an empty name or one already used on the event by
// another row of the same table (excludeID skips the row being renamed). The
// name columns collate NOCASE, so the comparison is case-insensitive.
func checkBusNameFree(database *sql.DB, table string, eventID int64, name string, excludeID int64) error {
	var exists bool
	err := database.QueryRow(`SELECT EXISTS(SELECT 1 FROM `+table+` WHERE event_id = ? AND name = ? AND id != ?)`, eventID, name, excludeID).Scan(&exists)
	if err != nil {
		return fmt.Errorf("check duplicate bus name: %w", err)
	}
	if exists {
		return fmt.Errorf("%w: name %q already exists on this event", ErrDuplicate, name)
	}
	return nil
}

func dedupeIDs(ids []int64) []int64 {
	seen := make(map[int64]bool, len(ids))
	unique := make([]int64, 0, len(ids))
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			unique = append(unique, id)
		}
	}
	return unique
}
