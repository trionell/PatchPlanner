package db

import (
	"database/sql"
	"testing"
)

// TestDeskModelsMigration054 runs 054 against the schema as it stood at 053:
// every console becomes Generic, deskless rows on a one-desk event go onto
// that desk, and a two-desk event's deskless rows are left alone — the
// sheet's No desk list is where the planner places them.
func TestDeskModelsMigration054(t *testing.T) {
	database := openMigratedTo(t, 53)

	one := mustInsertID(t, database, `INSERT INTO events (name) VALUES ('One desk')`)
	two := mustInsertID(t, database, `INSERT INTO events (name) VALUES ('Two desks')`)
	deskOne := mustInsertID(t, database, `INSERT INTO event_consoles (event_id, name, role) VALUES (?, 'FOH', 'foh')`, one)
	mustInsertID(t, database, `INSERT INTO event_consoles (event_id, name, role) VALUES (?, 'FOH', 'foh')`, two)
	mustInsertID(t, database, `INSERT INTO event_consoles (event_id, name, role) VALUES (?, 'Mon', 'monitor')`, two)

	loneChannel := mustInsertID(t, database, `INSERT INTO input_channels (event_id, channel_number, width, mixer_behavior) VALUES (?, 7, 'stereo', 'stereo_channel')`, one)
	loneOutput := migrationOutput(t, database, one, 1, "mono")
	twoChannel := mustInsertID(t, database, `INSERT INTO input_channels (event_id, channel_number, width, mixer_behavior) VALUES (?, 1, 'mono', 'stereo_channel')`, two)

	execMigrationFileTx(t, database, "054_desk_models.up.sql")

	var model, mode string
	if err := database.QueryRow(`SELECT desk_model, bus_mode FROM event_consoles WHERE id = ?`, deskOne).Scan(&model, &mode); err != nil {
		t.Fatal(err)
	}
	if model != "generic" || mode != "" {
		t.Errorf("console = %q/%q, want generic with no bus mode", model, mode)
	}

	var console sql.NullInt64
	var number int
	var pool string
	if err := database.QueryRow(`SELECT console_id, channel_number, strip_pool FROM input_channels WHERE id = ?`, loneChannel).Scan(&console, &number, &pool); err != nil {
		t.Fatal(err)
	}
	if !console.Valid || console.Int64 != deskOne || number != 7 || pool != "channel" {
		t.Errorf("one-desk channel = desk %v, number %d, pool %q; want desk %d, 7, channel", console, number, pool, deskOne)
	}
	if err := database.QueryRow(`SELECT console_id FROM audio_patch_outputs WHERE id = ?`, loneOutput).Scan(&console); err != nil {
		t.Fatal(err)
	}
	if !console.Valid || console.Int64 != deskOne {
		t.Errorf("one-desk output on desk %v, want %d", console, deskOne)
	}
	if err := database.QueryRow(`SELECT console_id FROM input_channels WHERE id = ?`, twoChannel).Scan(&console); err != nil {
		t.Fatal(err)
	}
	if console.Valid {
		t.Errorf("two-desk channel was put on desk %d; it must wait for the planner", console.Int64)
	}

	execMigrationFileTx(t, database, "054_desk_models.down.sql")
	if _, err := database.Exec(`SELECT desk_model FROM event_consoles`); err == nil {
		t.Error("down migration left desk_model in place")
	}
}
