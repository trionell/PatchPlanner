package db

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

var seedCounts = map[string]int{
	"signal_types":        5,
	"preamp_connectors":   6,
	"signal_cable_types":  5,
	"speaker_cable_types": 4,
	"output_types":        7,
	"mic_stands":          6,
	"power_connectors":    8,
	"truss_types":         5,
	"channel_colors":      8,
}

func TestReferenceSeedAndListing(t *testing.T) {
	database := openTestDB(t)

	data, err := ListReferenceData(database)
	if err != nil {
		t.Fatalf("list reference data: %v", err)
	}
	if len(data) != len(seedCounts) {
		t.Fatalf("expected %d vocabularies, got %d", len(seedCounts), len(data))
	}
	for vocabulary, want := range seedCounts {
		values, ok := data[vocabulary]
		if !ok {
			t.Fatalf("vocabulary %s missing from reference data", vocabulary)
		}
		if len(values) != want {
			t.Errorf("%s: expected %d seeded values, got %d", vocabulary, want, len(values))
		}
		labels := make([]string, len(values))
		for i, v := range values {
			if v.Vocabulary != vocabulary {
				t.Errorf("%s: value %q carries vocabulary %q", vocabulary, v.Value, v.Vocabulary)
			}
			labels[i] = strings.ToLower(v.Label)
		}
		if !sort.StringsAreSorted(labels) {
			t.Errorf("%s: values not label-sorted: %v", vocabulary, labels)
		}
	}

	byValue := make(map[string]string)
	for _, v := range data["signal_types"] {
		byValue[v.Value] = v.Label
	}
	if byValue["di"] != "DI" {
		t.Errorf("expected signal type di labelled DI, got %q", byValue["di"])
	}
}

// TestRebuildMigrationsPreserveRows replays the production migration
// sequence step by step: build the pre-rebuild schema (through 015), insert
// planning rows exercising every legacy vocabulary value shape (including an
// empty-string mic_stand and a fixture referencing a truss section), then
// apply the 016–018 rebuilds exactly as the migrate driver does — inside a
// transaction on an FK-enabled connection — and require every row to
// survive bit-for-bit.
func TestRebuildMigrationsPreserveRows(t *testing.T) {
	database := openMigratedTo(t, 15)

	mustExec(t, database, `INSERT INTO events (name) VALUES ('Legacy Gig')`)
	mustExec(t, database, `INSERT INTO audio_patch_inputs
		(event_id, channel_number, channel_name, signal_type, preamp_connector, cable_type, cable_length_m, mic_stand, phantom_power, dca_groups, notes)
		VALUES (1, 1, 'Lead Vox', 'mic', 'xlr', 'xlr', 10.0, 'boom', 1, '1,2', 'spare windscreen')`)
	mustExec(t, database, `INSERT INTO audio_patch_inputs
		(event_id, channel_number, signal_type, mic_stand)
		VALUES (1, 2, 'aux', '')`)
	mustExec(t, database, `INSERT INTO audio_patch_outputs
		(event_id, output_number, output_name, output_type, destination_type, cable_type, cable_length_m)
		VALUES (1, 1, 'Wedge 1', 'monitor', 'local', 'nl4', 15.0)`)
	mustExec(t, database, `INSERT INTO lighting_rigs (event_id, name) VALUES (1, 'FOH Truss')`)
	mustExec(t, database, `INSERT INTO truss_sections (rig_id, name, length_m, truss_type) VALUES (1, 'Front', 8.0, 'ladder')`)
	mustExec(t, database, `INSERT INTO lighting_fixtures (rig_id, truss_section_id, custom_name, power_connector_in, dmx_universe, dmx_channel_count)
		VALUES (1, 1, 'Wash L', 'powercon', 1, 16)`)

	for _, name := range []string{"016_inputs_drop_checks.up.sql", "017_outputs_drop_checks.up.sql", "018_truss_drop_checks.up.sql"} {
		execMigrationFileTx(t, database, name)
	}

	var channelName, signalType, micStand, dca string
	var cableLen float64
	err := database.QueryRow(`SELECT channel_name, signal_type, mic_stand, dca_groups, cable_length_m FROM audio_patch_inputs WHERE channel_number = 1`).
		Scan(&channelName, &signalType, &micStand, &dca, &cableLen)
	if err != nil {
		t.Fatalf("read rebuilt input row: %v", err)
	}
	if channelName != "Lead Vox" || signalType != "mic" || micStand != "boom" || dca != "1,2" || cableLen != 10.0 {
		t.Errorf("input row mutated by rebuild: %q %q %q %q %v", channelName, signalType, micStand, dca, cableLen)
	}
	err = database.QueryRow(`SELECT mic_stand FROM audio_patch_inputs WHERE channel_number = 2`).Scan(&micStand)
	if err != nil {
		t.Fatalf("read empty-stand row: %v", err)
	}
	if micStand != "" {
		t.Errorf("empty-string mic_stand mutated: %q", micStand)
	}

	var outputType, cableType string
	if err := database.QueryRow(`SELECT output_type, cable_type FROM audio_patch_outputs WHERE output_number = 1`).Scan(&outputType, &cableType); err != nil {
		t.Fatalf("read rebuilt output row: %v", err)
	}
	if outputType != "monitor" || cableType != "nl4" {
		t.Errorf("output row mutated by rebuild: %q %q", outputType, cableType)
	}

	var trussType string
	var sectionRef sql.NullInt64
	if err := database.QueryRow(`SELECT truss_type FROM truss_sections WHERE name = 'Front'`).Scan(&trussType); err != nil {
		t.Fatalf("read rebuilt truss row: %v", err)
	}
	if trussType != "ladder" {
		t.Errorf("truss row mutated by rebuild: %q", trussType)
	}
	if err := database.QueryRow(`SELECT truss_section_id FROM lighting_fixtures WHERE custom_name = 'Wash L'`).Scan(&sectionRef); err != nil {
		t.Fatalf("read fixture row: %v", err)
	}
	if !sectionRef.Valid || sectionRef.Int64 != 1 {
		t.Errorf("fixture lost its truss section reference across rebuild: %+v", sectionRef)
	}

	// No orphaned references may survive the rebuilds.
	rows, err := database.Query(`PRAGMA foreign_key_check`)
	if err != nil {
		t.Fatalf("foreign_key_check: %v", err)
	}
	defer rows.Close()
	if rows.Next() {
		t.Fatal("foreign_key_check reported violations after rebuild")
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("foreign_key_check rows: %v", err)
	}

	// The point of the rebuilds: user-added vocabulary values are accepted…
	mustExec(t, database, `INSERT INTO audio_patch_inputs (event_id, channel_number, signal_type, mic_stand) VALUES (1, 3, 'playback', 'mini_boom')`)
	mustExec(t, database, `INSERT INTO audio_patch_outputs (event_id, output_number, output_type) VALUES (1, 2, 'fill')`)
	mustExec(t, database, `INSERT INTO truss_sections (rig_id, name, truss_type) VALUES (1, 'Back', 'triangle')`)

	// …while the structural destination_type CHECK survives migration 017.
	if _, err := database.Exec(`INSERT INTO audio_patch_outputs (event_id, output_number, destination_type) VALUES (1, 3, 'teleport')`); err == nil {
		t.Error("destination_type CHECK was lost by the output rebuild")
	}
}

func TestReferenceValueCRUD(t *testing.T) {
	database := openTestDB(t)

	created, err := CreateReferenceValue(database, "signal_cable_types", domain.ReferenceValueRequest{Value: "dmx5", Label: "DMX 5-pin"})
	if err != nil {
		t.Fatalf("create value: %v", err)
	}
	if created.Value != "dmx5" || created.Label != "DMX 5-pin" || created.Vocabulary != "signal_cable_types" {
		t.Errorf("created value mismatch: %+v", created)
	}

	if _, err := CreateReferenceValue(database, "signal_cable_types", domain.ReferenceValueRequest{Value: "dmx5", Label: "Again"}); !errors.Is(err, ErrDuplicate) {
		t.Errorf("expected ErrDuplicate for same value in same vocabulary, got %v", err)
	}
	if _, err := CreateReferenceValue(database, "speaker_cable_types", domain.ReferenceValueRequest{Value: "dmx5", Label: "DMX 5-pin"}); err != nil {
		t.Errorf("same value in another vocabulary must be allowed, got %v", err)
	}

	renamed, err := UpdateReferenceValueLabel(database, "signal_cable_types", created.ID, "DMX 5-pin (110 Ω)")
	if err != nil {
		t.Fatalf("rename label: %v", err)
	}
	if renamed.Label != "DMX 5-pin (110 Ω)" || renamed.Value != "dmx5" {
		t.Errorf("rename must change label only: %+v", renamed)
	}
	if _, err := UpdateReferenceValueLabel(database, "signal_cable_types", 99999, "X"); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("expected ErrNoRows for unknown id, got %v", err)
	}
	if _, err := UpdateReferenceValueLabel(database, "truss_types", created.ID, "X"); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("expected ErrNoRows for id outside vocabulary, got %v", err)
	}

	if err := DeleteReferenceValue(database, "signal_cable_types", created.ID); err != nil {
		t.Fatalf("delete unused value: %v", err)
	}
	data, err := ListReferenceData(database)
	if err != nil {
		t.Fatalf("list after delete: %v", err)
	}
	for _, v := range data["signal_cable_types"] {
		if v.Value == "dmx5" {
			t.Error("deleted value still listed")
		}
	}
	if err := DeleteReferenceValue(database, "signal_cable_types", created.ID); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("expected ErrNoRows deleting twice, got %v", err)
	}
}

// TestDeleteReferenceValueInUse plants one referencing planning row per
// consuming column of the usage map and requires delete protection to fire
// for every vocabulary.
func TestDeleteReferenceValueInUse(t *testing.T) {
	database := openTestDB(t)
	eventID := createTestEvent(t, database)

	mustExec(t, database, `INSERT INTO audio_patch_inputs (event_id, channel_number, signal_type, preamp_connector, cable_type, mic_stand) VALUES (?, 1, 'mic', 'combo', 'jack_trs', 'boom')`, eventID)
	mustExec(t, database, `INSERT INTO audio_patch_outputs (event_id, output_number, output_type) VALUES (?, 1, 'iem')`, eventID)
	mustExec(t, database, `INSERT INTO output_devices (event_id, name, output_connector_type) VALUES (?, 'Speaker', 'nl8')`, eventID)
	mustExec(t, database, `INSERT INTO lighting_rigs (event_id, name) VALUES (?, 'Rig')`, eventID)
	mustExec(t, database, `INSERT INTO truss_sections (rig_id, name, truss_type) VALUES (1, 'Front', 'ladder')`)
	mustExec(t, database, `INSERT INTO lighting_fixtures (rig_id, custom_name, power_connector_in, power_connector_out) VALUES (1, 'Wash', 'cee16', 'powercon_true1')`)

	inUse := map[string]string{
		"signal_types":        "mic",
		"preamp_connectors":   "combo",
		"signal_cable_types":  "jack_trs",
		"speaker_cable_types": "nl8",
		"output_types":        "iem",
		"mic_stands":          "boom",
		"truss_types":         "ladder",
	}
	for vocabulary, value := range inUse {
		id := referenceValueID(t, database, vocabulary, value)
		if err := DeleteReferenceValue(database, vocabulary, id); !errors.Is(err, ErrInUse) {
			t.Errorf("%s %q: expected ErrInUse, got %v", vocabulary, value, err)
		}
	}
	// power_connectors is consumed by two columns; both must protect.
	for _, value := range []string{"cee16", "powercon_true1"} {
		id := referenceValueID(t, database, "power_connectors", value)
		if err := DeleteReferenceValue(database, "power_connectors", id); !errors.Is(err, ErrInUse) {
			t.Errorf("power_connectors %q: expected ErrInUse, got %v", value, err)
		}
	}

	// Clearing the referencing row unblocks deletion.
	mustExec(t, database, `DELETE FROM truss_sections WHERE name = 'Front'`)
	if err := DeleteReferenceValue(database, "truss_types", referenceValueID(t, database, "truss_types", "ladder")); err != nil {
		t.Errorf("delete after clearing usage: %v", err)
	}
}

func TestFixtureModes(t *testing.T) {
	database := openTestDB(t)
	c := seedCatalog(t, database)

	basic, err := CreateFixtureMode(database, c.Fixture, domain.FixtureModeRequest{Name: "Basic", ChannelCount: 16})
	if err != nil {
		t.Fatalf("create mode: %v", err)
	}
	extended, err := CreateFixtureMode(database, c.Fixture, domain.FixtureModeRequest{Name: "Extended", ChannelCount: 39})
	if err != nil {
		t.Fatalf("create second mode: %v", err)
	}
	if _, err := CreateFixtureMode(database, c.Fixture, domain.FixtureModeRequest{Name: "Basic", ChannelCount: 8}); !errors.Is(err, ErrDuplicate) {
		t.Errorf("duplicate mode name: expected ErrDuplicate, got %v", err)
	}

	modes, err := ListFixtureModes(database, c.Fixture)
	if err != nil {
		t.Fatalf("list modes: %v", err)
	}
	if len(modes) != 2 || modes[0].Name != "Basic" || modes[1].Name != "Extended" {
		t.Errorf("expected name-sorted [Basic Extended], got %+v", modes)
	}

	// A patched fixture copies mode name + count; later mode edits/deletes
	// must never touch it (copy-on-pick, FR-010).
	eventID := createTestEvent(t, database)
	mustExec(t, database, `INSERT INTO lighting_rigs (event_id, name) VALUES (?, 'Rig')`, eventID)
	mustExec(t, database, `INSERT INTO lighting_fixtures (rig_id, inventory_item_id, dmx_channel_mode, dmx_channel_count) VALUES (1, ?, 'Extended', 39)`, c.Fixture)

	if _, err := UpdateFixtureMode(database, extended.ID, domain.FixtureModeRequest{Name: "Extended", ChannelCount: 40}); err != nil {
		t.Fatalf("update mode: %v", err)
	}
	if _, err := UpdateFixtureMode(database, extended.ID, domain.FixtureModeRequest{Name: "Basic", ChannelCount: 40}); !errors.Is(err, ErrDuplicate) {
		t.Errorf("rename onto existing mode: expected ErrDuplicate, got %v", err)
	}
	if err := DeleteFixtureMode(database, basic.ID); err != nil {
		t.Fatalf("delete mode: %v", err)
	}
	var mode string
	var count int
	if err := database.QueryRow(`SELECT dmx_channel_mode, dmx_channel_count FROM lighting_fixtures WHERE inventory_item_id = ?`, c.Fixture).Scan(&mode, &count); err != nil {
		t.Fatalf("read patched fixture: %v", err)
	}
	if mode != "Extended" || count != 39 {
		t.Errorf("mode edit/delete rewrote a patched fixture: %s/%d", mode, count)
	}

	// Re-importing the price list must leave modes untouched (FR-011): the
	// fixture model is matched by name, never deleted and recreated.
	if err := UpsertInventory(database,
		[]domain.InventoryCategory{{Name: "Ljusarmaturer", CategoryType: "lighting"}},
		[]domain.InventoryItem{{CategoryName: "Ljusarmaturer", Name: "Robe LEDWash 600", QuantityAvailable: 6, PriceExVAT: 250, XLSXRow: 20}},
	); err != nil {
		t.Fatalf("re-import: %v", err)
	}
	modes, err = ListFixtureModes(database, c.Fixture)
	if err != nil {
		t.Fatalf("list modes after re-import: %v", err)
	}
	if len(modes) != 1 || modes[0].Name != "Extended" || modes[0].ChannelCount != 40 {
		t.Errorf("re-import changed fixture modes: %+v", modes)
	}

	// Deleting the catalog item cascades its modes.
	if _, err := CreateFixtureMode(database, c.Mic, domain.FixtureModeRequest{Name: "Odd", ChannelCount: 1}); err != nil {
		t.Fatalf("create mode on second item: %v", err)
	}
	mustExec(t, database, `DELETE FROM inventory_items WHERE id = ?`, c.Mic)
	micModes, err := ListFixtureModes(database, c.Mic)
	if err != nil {
		t.Fatalf("list modes after item delete: %v", err)
	}
	if len(micModes) != 0 {
		t.Errorf("modes survived their item's deletion: %+v", micModes)
	}
}

func referenceValueID(t *testing.T, database *sql.DB, vocabulary, value string) int64 {
	t.Helper()
	var id int64
	if err := database.QueryRow(`SELECT id FROM reference_values WHERE vocabulary = ? AND value = ?`, vocabulary, value).Scan(&id); err != nil {
		t.Fatalf("look up %s/%s: %v", vocabulary, value, err)
	}
	return id
}

// openMigratedTo opens an FK-enabled database and applies every up
// migration numbered <= maxNum, each wrapped in a transaction like the
// golang-migrate sqlite driver does in production.
func openMigratedTo(t *testing.T, maxNum int) *sql.DB {
	t.Helper()
	dsn := "file:" + filepath.Join(t.TempDir(), "stepwise.db") + "?_pragma=foreign_keys(1)"
	database, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatalf("open stepwise db: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })

	pattern := filepath.Join(migrationsDir(t), "*.up.sql")
	files, err := filepath.Glob(pattern)
	if err != nil {
		t.Fatalf("glob migrations: %v", err)
	}
	sort.Strings(files)
	for _, file := range files {
		base := filepath.Base(file)
		prefix, _, found := strings.Cut(base, "_")
		if !found {
			t.Fatalf("migration filename without numeric prefix: %s", base)
		}
		num, err := strconv.Atoi(prefix)
		if err != nil {
			t.Fatalf("parse migration number from %s: %v", base, err)
		}
		if num > maxNum {
			continue
		}
		execMigrationFileTx(t, database, base)
	}
	return database
}

// execMigrationFileTx applies one migration file inside a transaction,
// mirroring the migrate driver's default tx-wrap (which is what makes
// PRAGMA defer_foreign_keys the correct FK switch in rebuild migrations).
func execMigrationFileTx(t *testing.T, database *sql.DB, filename string) {
	t.Helper()
	contents, err := os.ReadFile(filepath.Join(migrationsDir(t), filename))
	if err != nil {
		t.Fatalf("read migration %s: %v", filename, err)
	}
	tx, err := database.Begin()
	if err != nil {
		t.Fatalf("begin tx for %s: %v", filename, err)
	}
	if _, err := tx.Exec(string(contents)); err != nil {
		_ = tx.Rollback()
		t.Fatalf("exec migration %s: %v", filename, err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit migration %s: %v", filename, err)
	}
}
