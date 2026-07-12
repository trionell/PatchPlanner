package db

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestCableBackfillConservative exercises the 019 backfill against the exact
// SQL that ships in the migration file: only XLR rows whose typed length
// matches exactly one live Mikrofonkabel item convert; everything else keeps
// its legacy values.
func TestCableBackfillConservative(t *testing.T) {
	// Pinned to just before Slice 12's migration 029 renames
	// audio_patch_inputs and (030) drops cable_type/cable_length_m/
	// mic_stand entirely — this test replays migration 019's own backfill
	// UPDATE statements against that legacy shape, same isolation
	// technique as stereo_migration_test.go/buses_migration_test.go use
	// for their own historical migrations.
	database := openMigratedTo(t, 28)

	// Catalog: a cable-role category with unambiguous lengths, a duplicated
	// length (two 6m items → ambiguous), and a discontinued 8m.
	mustExec(t, database, `INSERT INTO inventory_categories (name, category_type, picker_role) VALUES ('Signalkablage test', 'audio', 'cable')`)
	var categoryID int64
	if err := database.QueryRow(`SELECT id FROM inventory_categories WHERE name = 'Signalkablage test'`).Scan(&categoryID); err != nil {
		t.Fatalf("category id: %v", err)
	}
	insertCable := func(description string, discontinued int) int64 {
		result, err := database.Exec(`INSERT INTO inventory_items (category_id, name, description, quantity_available, discontinued) VALUES (?, 'Mikrofonkabel', ?, 4, ?)`, categoryID, description, discontinued)
		if err != nil {
			t.Fatalf("insert cable %s: %v", description, err)
		}
		id, _ := result.LastInsertId()
		return id
	}
	cable4m := insertCable("4m", 0)
	cable75m := insertCable("7,5m", 0) // Swedish decimal comma
	insertCable("6m", 0)
	insertCable("6m", 0)
	insertCable("8m", 1)

	// Legacy-shaped patch rows, written through raw SQL like pre-019 data.
	mustExec(t, database, `INSERT INTO events (name) VALUES ('Backfill test')`)
	insertLegacyInput := func(channel int, cableType string, length any, micStand string) {
		mustExec(t, database, `INSERT INTO audio_patch_inputs (event_id, channel_number, cable_type, cable_length_m, mic_stand) VALUES (1, ?, ?, ?, ?)`, channel, cableType, length, micStand)
	}
	insertLegacyInput(1, "xlr", 4, "boom")   // converts (exact 4m match)
	insertLegacyInput(2, "xlr", 7.5, "")     // converts (7,5m normalized)
	insertLegacyInput(3, "xlr", 6, "")       // ambiguous (two 6m items) → legacy
	insertLegacyInput(4, "xlr", 8, "")       // only match discontinued → legacy
	insertLegacyInput(5, "xlr", 12, "")      // no such length → legacy
	insertLegacyInput(6, "jack_ts", 4, "")   // wrong type → legacy
	insertLegacyInput(7, "xlr", nil, "boom") // no length → legacy

	// Replay the migration's UPDATE statements verbatim from the shipped file.
	for _, statement := range backfillStatements(t) {
		mustExec(t, database, statement)
	}

	type rowState struct {
		cableItemID sql.NullInt64
		cableType   sql.NullString
		cableLength sql.NullFloat64
		micStand    sql.NullString
	}
	stateOf := func(channel int) rowState {
		var state rowState
		if err := database.QueryRow(`SELECT cable_item_id, cable_type, cable_length_m, mic_stand FROM audio_patch_inputs WHERE channel_number = ?`, channel).
			Scan(&state.cableItemID, &state.cableType, &state.cableLength, &state.micStand); err != nil {
			t.Fatalf("row ch %d: %v", channel, err)
		}
		return state
	}

	for channel, wantItem := range map[int]int64{1: cable4m, 2: cable75m} {
		state := stateOf(channel)
		if !state.cableItemID.Valid || state.cableItemID.Int64 != wantItem {
			t.Errorf("ch %d cable_item_id=%v, want %d", channel, state.cableItemID, wantItem)
		}
		if state.cableType.Valid || state.cableLength.Valid {
			t.Errorf("ch %d legacy fields not cleared: type=%v length=%v", channel, state.cableType, state.cableLength)
		}
	}
	// The stand vocabulary value survives conversion untouched (stands never backfill).
	if state := stateOf(1); !state.micStand.Valid || state.micStand.String != "boom" {
		t.Errorf("ch 1 mic_stand=%v, want preserved 'boom'", state.micStand)
	}
	for _, channel := range []int{3, 4, 5, 6, 7} {
		state := stateOf(channel)
		if state.cableItemID.Valid {
			t.Errorf("ch %d unexpectedly converted to item %d", channel, state.cableItemID.Int64)
		}
		if !state.cableType.Valid {
			t.Errorf("ch %d legacy cable_type lost", channel)
		}
	}
}

// backfillStatements extracts the UPDATE statements from the shipped 019
// migration so the test always exercises the real SQL.
func backfillStatements(t *testing.T) []string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(migrationsDir(t), "019_cable_stand_items.up.sql"))
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	statements := make([]string, 0, 2)
	for _, statement := range strings.Split(string(raw), ";") {
		if strings.Contains(statement, "UPDATE audio_patch_inputs") {
			statements = append(statements, statement)
		}
	}
	if len(statements) != 2 {
		t.Fatalf("found %d backfill statements in 019, want 2", len(statements))
	}
	return statements
}
