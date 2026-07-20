package db

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
)

// ErrDuplicate signals a uniqueness conflict (vocabulary value or fixture
// mode name) that handlers map to HTTP 409.
var ErrDuplicate = errors.New("duplicate")

// ErrInUse signals that a vocabulary value is referenced by planning rows
// and therefore cannot be deleted; handlers map it to HTTP 409.
var ErrInUse = errors.New("in use")

// vocabularyUsage maps each vocabulary to the planning columns that store
// its values. Delete protection probes exactly these columns; keep in sync
// with data-model.md §Usage map. join and eventIDColumn are only set when
// table has no event_id column of its own — join is an extra JOIN clause
// and eventIDColumn the qualified column to reach event_id through it;
// left empty, countReferenceUsage assumes "<table>.event_id" directly.
var vocabularyUsage = map[string][]struct {
	table, column string
	join          string
	eventIDColumn string
}{
	// signal_types (mic/line/di/return/aux) had no real home left after
	// Slice 12: InputSource.Kind is a Go-validated "mic"/"line" enum, not a
	// reference vocabulary (the input graph's mirror of ValidWidths etc.) —
	// no planning row stores a signal_types value anymore.
	// preamp_connectors moved from audio_patch_inputs.preamp_connector
	// (flat model) to input_sources.connector_type (Slice 12's graph) — a
	// Source's declared connector is this vocabulary's real home today.
	"preamp_connectors": {{table: "input_sources", column: "connector_type"}},
	// signal_cable_types and mic_stands (both audio_patch_inputs legacy
	// pre-catalog fallback text) had no replacement introduced in Slice 12
	// — a cable is now always a catalog input_cables.cable_item_id pick,
	// and a stand is always input_sources.stand_item_id, neither a
	// reference-vocabulary value.
	// speaker_cable_types moved from audio_patch_outputs (flat model) to
	// output_chain_hops.cable_type (Slice 10's hop chain) to, now,
	// output_devices' per-side connector type (Slice 11's graph, research.md
	// R2/R7) — a device's declared input/output connector is this
	// vocabulary's real home today.
	"speaker_cable_types": {{table: "output_devices", column: "input_connector_type"}, {table: "output_devices", column: "output_connector_type"}},
	"output_types":        {{table: "audio_patch_outputs", column: "output_type"}},
	// lighting_fixtures carries no event_id column of its own — only its
	// parent lighting_rigs does — so this entry needs a join (Slice 17
	// research.md R6), unlike every other entry above.
	"power_connectors": {
		{table: "lighting_fixtures", column: "power_connector_in", join: "JOIN lighting_rigs g ON g.id = lighting_fixtures.rig_id", eventIDColumn: "g.event_id"},
		{table: "lighting_fixtures", column: "power_connector_out", join: "JOIN lighting_rigs g ON g.id = lighting_fixtures.rig_id", eventIDColumn: "g.event_id"},
	},
	// truss_types lost its consuming column when Slice 13 dropped
	// truss_sections (plot truss pieces are catalog picks, not typed) —
	// the vocabulary remains, untracked, like signal_types before it.
}

// InUseError reports how many planning rows reference a vocabulary value,
// blocking its deletion. errors.Is(err, ErrInUse) matches it.
type InUseError struct {
	Value string
	Count int
}

func (e InUseError) Error() string {
	return fmt.Sprintf("value %q is in use by %d planning row(s)", e.Value, e.Count)
}

func (e InUseError) Is(target error) bool { return target == ErrInUse }

// ListReferenceData returns every vocabulary with its values label-sorted,
// scoped to one event. All vocabularies from domain.Vocabularies are always
// present, empty ones as empty slices, so consumers never need existence
// checks.
func ListReferenceData(database *sql.DB, eventID int64) (domain.ReferenceData, error) {
	data := make(domain.ReferenceData, len(domain.Vocabularies))
	for _, vocabulary := range domain.Vocabularies {
		data[vocabulary] = []domain.ReferenceValue{}
	}

	rows, err := database.Query(`SELECT id, event_id, vocabulary, value, label FROM reference_values WHERE event_id = ? ORDER BY vocabulary, label COLLATE NOCASE`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list reference values: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var v domain.ReferenceValue
		if err := rows.Scan(&v.ID, &v.EventID, &v.Vocabulary, &v.Value, &v.Label); err != nil {
			return nil, fmt.Errorf("scan reference value: %w", err)
		}
		if _, known := data[v.Vocabulary]; !known {
			// Rows for retired vocabularies are ignored rather than fatal.
			continue
		}
		data[v.Vocabulary] = append(data[v.Vocabulary], v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate reference values: %w", err)
	}
	return data, nil
}

// CreateReferenceValue adds a value to one event's vocabulary. Duplicate
// values within the same event's vocabulary yield ErrDuplicate. Uniqueness
// is pre-checked rather than derived from the driver's constraint error:
// single-user tool, no races.
func CreateReferenceValue(database *sql.DB, eventID int64, vocabulary string, req domain.ReferenceValueRequest) (domain.ReferenceValue, error) {
	var exists bool
	err := database.QueryRow(`SELECT EXISTS(SELECT 1 FROM reference_values WHERE event_id = ? AND vocabulary = ? AND value = ?)`, eventID, vocabulary, req.Value).Scan(&exists)
	if err != nil {
		return domain.ReferenceValue{}, fmt.Errorf("check duplicate reference value: %w", err)
	}
	if exists {
		return domain.ReferenceValue{}, fmt.Errorf("%w: value %q already exists in %s", ErrDuplicate, req.Value, vocabulary)
	}

	result, err := database.Exec(`INSERT INTO reference_values (event_id, vocabulary, value, label) VALUES (?, ?, ?, ?)`, eventID, vocabulary, req.Value, req.Label)
	if err != nil {
		return domain.ReferenceValue{}, fmt.Errorf("insert reference value: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.ReferenceValue{}, fmt.Errorf("reference value id: %w", err)
	}
	return domain.ReferenceValue{ID: id, EventID: eventID, Vocabulary: vocabulary, Value: req.Value, Label: req.Label}, nil
}

// UpdateReferenceValueLabel renames a value's display label within one
// event. The value token itself is immutable — planning rows store it, so
// renaming the label never modifies any row. Returns sql.ErrNoRows when the
// id is not in that event's vocabulary.
func UpdateReferenceValueLabel(database *sql.DB, eventID int64, vocabulary string, id int64, label string) (domain.ReferenceValue, error) {
	result, err := database.Exec(`UPDATE reference_values SET label = ? WHERE id = ? AND event_id = ? AND vocabulary = ?`, label, id, eventID, vocabulary)
	if err != nil {
		return domain.ReferenceValue{}, fmt.Errorf("update reference label: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return domain.ReferenceValue{}, fmt.Errorf("update reference label result: %w", err)
	}
	if affected == 0 {
		return domain.ReferenceValue{}, sql.ErrNoRows
	}
	return getReferenceValue(database, eventID, vocabulary, id)
}

// DeleteReferenceValue removes a value from one event's vocabulary unless
// any planning row in that same event references it (InUseError, matching
// ErrInUse). Returns sql.ErrNoRows when the id is not in that event's
// vocabulary.
func DeleteReferenceValue(database *sql.DB, eventID int64, vocabulary string, id int64) error {
	value, err := getReferenceValue(database, eventID, vocabulary, id)
	if err != nil {
		return err
	}

	count, err := countReferenceUsage(database, eventID, vocabulary, value.Value)
	if err != nil {
		return err
	}
	if count > 0 {
		return InUseError{Value: value.Value, Count: count}
	}

	if _, err := database.Exec(`DELETE FROM reference_values WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete reference value: %w", err)
	}
	return nil
}

func getReferenceValue(database *sql.DB, eventID int64, vocabulary string, id int64) (domain.ReferenceValue, error) {
	var v domain.ReferenceValue
	err := database.QueryRow(`SELECT id, event_id, vocabulary, value, label FROM reference_values WHERE id = ? AND event_id = ? AND vocabulary = ?`, id, eventID, vocabulary).
		Scan(&v.ID, &v.EventID, &v.Vocabulary, &v.Value, &v.Label)
	if err != nil {
		return domain.ReferenceValue{}, err
	}
	return v, nil
}

// ListFixtureModes returns one catalog item's DMX modes, name-sorted.
func ListFixtureModes(database *sql.DB, itemID int64) ([]domain.FixtureMode, error) {
	rows, err := database.Query(`SELECT id, inventory_item_id, name, channel_count FROM fixture_modes WHERE inventory_item_id = ? ORDER BY name COLLATE NOCASE`, itemID)
	if err != nil {
		return nil, fmt.Errorf("list fixture modes: %w", err)
	}
	defer rows.Close()

	modes := []domain.FixtureMode{}
	for rows.Next() {
		var m domain.FixtureMode
		if err := rows.Scan(&m.ID, &m.InventoryItemID, &m.Name, &m.ChannelCount); err != nil {
			return nil, fmt.Errorf("scan fixture mode: %w", err)
		}
		modes = append(modes, m)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate fixture modes: %w", err)
	}
	return modes, nil
}

// CreateFixtureMode adds a mode to a catalog item; duplicate names on the
// same item yield ErrDuplicate.
func CreateFixtureMode(database *sql.DB, itemID int64, req domain.FixtureModeRequest) (domain.FixtureMode, error) {
	if err := checkModeNameFree(database, itemID, req.Name, 0); err != nil {
		return domain.FixtureMode{}, err
	}
	result, err := database.Exec(`INSERT INTO fixture_modes (inventory_item_id, name, channel_count) VALUES (?, ?, ?)`, itemID, req.Name, req.ChannelCount)
	if err != nil {
		return domain.FixtureMode{}, fmt.Errorf("insert fixture mode: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.FixtureMode{}, fmt.Errorf("fixture mode id: %w", err)
	}
	return domain.FixtureMode{ID: id, InventoryItemID: itemID, Name: req.Name, ChannelCount: req.ChannelCount}, nil
}

// UpdateFixtureMode replaces a mode's name and channel count. Patched
// fixtures are never touched — they carry copies (FR-010). Returns
// sql.ErrNoRows for unknown modes, ErrDuplicate on a name collision within
// the same item.
func UpdateFixtureMode(database *sql.DB, modeID int64, req domain.FixtureModeRequest) (domain.FixtureMode, error) {
	current, err := GetFixtureMode(database, modeID)
	if err != nil {
		return domain.FixtureMode{}, err
	}
	if err := checkModeNameFree(database, current.InventoryItemID, req.Name, modeID); err != nil {
		return domain.FixtureMode{}, err
	}
	if _, err := database.Exec(`UPDATE fixture_modes SET name = ?, channel_count = ? WHERE id = ?`, req.Name, req.ChannelCount, modeID); err != nil {
		return domain.FixtureMode{}, fmt.Errorf("update fixture mode: %w", err)
	}
	return domain.FixtureMode{ID: modeID, InventoryItemID: current.InventoryItemID, Name: req.Name, ChannelCount: req.ChannelCount}, nil
}

// DeleteFixtureMode removes a mode; patched fixtures keep their copied
// values. Returns sql.ErrNoRows for unknown modes.
func DeleteFixtureMode(database *sql.DB, modeID int64) error {
	result, err := database.Exec(`DELETE FROM fixture_modes WHERE id = ?`, modeID)
	if err != nil {
		return fmt.Errorf("delete fixture mode: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("delete fixture mode result: %w", err)
	}
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// GetFixtureMode looks up one mode by id.
func GetFixtureMode(database *sql.DB, modeID int64) (domain.FixtureMode, error) {
	var m domain.FixtureMode
	err := database.QueryRow(`SELECT id, inventory_item_id, name, channel_count FROM fixture_modes WHERE id = ?`, modeID).
		Scan(&m.ID, &m.InventoryItemID, &m.Name, &m.ChannelCount)
	if err != nil {
		return domain.FixtureMode{}, err
	}
	return m, nil
}

// checkModeNameFree rejects a mode name already used on the item by another
// mode (excludeID skips the mode being renamed).
func checkModeNameFree(database *sql.DB, itemID int64, name string, excludeID int64) error {
	var exists bool
	err := database.QueryRow(`SELECT EXISTS(SELECT 1 FROM fixture_modes WHERE inventory_item_id = ? AND name = ? AND id != ?)`, itemID, name, excludeID).Scan(&exists)
	if err != nil {
		return fmt.Errorf("check duplicate fixture mode: %w", err)
	}
	if exists {
		return fmt.Errorf("%w: mode %q already exists on this item", ErrDuplicate, name)
	}
	return nil
}

func countReferenceUsage(database *sql.DB, eventID int64, vocabulary, value string) (int, error) {
	total := 0
	for _, usage := range vocabularyUsage[vocabulary] {
		// Table/column/join names come from the static usage map above,
		// never from input.
		eventIDColumn := usage.eventIDColumn
		if eventIDColumn == "" {
			eventIDColumn = usage.table + ".event_id"
		}
		query := fmt.Sprintf(`SELECT COUNT(*) FROM %s %s WHERE %s.%s = ? AND %s = ?`, usage.table, usage.join, usage.table, usage.column, eventIDColumn)
		var count int
		if err := database.QueryRow(query, value, eventID).Scan(&count); err != nil {
			return 0, fmt.Errorf("count usage in %s.%s: %w", usage.table, usage.column, err)
		}
		total += count
	}
	return total, nil
}
