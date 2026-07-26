package db

import (
	"database/sql"
	"testing"
)

// TestConsoleMigration042 drives migration 042 against the schema as it stood
// at 041, with two events that already have channels, outputs and a canvas
// position for the old implicit mixer node — the state every real database is
// in. It asserts FR-025/SC-010: every existing event keeps its patch and its
// layout, and gains exactly one console that is silent (no item, no declared
// capacity), then that a down migration puts the float column back.
func TestConsoleMigration042(t *testing.T) {
	database := openMigratedTo(t, 41)

	eventA := mustInsertID(t, database, `INSERT INTO events (name, output_mixer_position_y) VALUES (?, ?)`, "Event A", 137.5)
	eventB := mustInsertID(t, database, `INSERT INTO events (name, output_mixer_position_y) VALUES (?, ?)`, "Event B", 0.0)

	channelA1 := mustInsertID(t, database, `INSERT INTO input_channels (event_id, channel_number, width, mixer_behavior) VALUES (?, 1, 'mono', 'stereo_channel')`, eventA)
	channelA2 := mustInsertID(t, database, `INSERT INTO input_channels (event_id, channel_number, width, mixer_behavior) VALUES (?, 2, 'stereo', 'stereo_channel')`, eventA)
	channelB1 := mustInsertID(t, database, `INSERT INTO input_channels (event_id, channel_number, width, mixer_behavior) VALUES (?, 1, 'mono', 'stereo_channel')`, eventB)
	outputA1 := migrationOutput(t, database, eventA, 1, "stereo")
	outputB1 := migrationOutput(t, database, eventB, 1, "mono")

	execMigrationFileTx(t, database, "042_event_consoles.up.sql")

	// One console per event, carrying the position across, with nothing
	// declared — the state that adds no rental line and raises no warning.
	var consoles int
	if err := database.QueryRow(`SELECT COUNT(*) FROM event_consoles`).Scan(&consoles); err != nil {
		t.Fatalf("count consoles: %v", err)
	}
	if consoles != 2 {
		t.Fatalf("consoles = %d, want one per event (2)", consoles)
	}

	var consoleA int64
	var name, role string
	var invID, ownedID sql.NullInt64
	var inCount, outCount, localIn, localOut int
	var posX, posY, inPosX, inPosY float64
	err := database.QueryRow(`SELECT id, name, role, inventory_item_id, owned_item_id,
		input_count, output_count, local_input_count, local_output_count,
		position_x, position_y, input_position_x, input_position_y
		FROM event_consoles WHERE event_id = ?`, eventA).
		Scan(&consoleA, &name, &role, &invID, &ownedID, &inCount, &outCount, &localIn, &localOut, &posX, &posY, &inPosX, &inPosY)
	if err != nil {
		t.Fatalf("read backfilled console: %v", err)
	}
	if name != "" || role != "foh" {
		t.Errorf("backfilled console name=%q role=%q, want unnamed foh", name, role)
	}
	if invID.Valid || ownedID.Valid {
		t.Error("backfilled console has an item picked; it must add no rental line")
	}
	if inCount != 0 || outCount != 0 || localIn != 0 || localOut != 0 {
		t.Errorf("backfilled counts = %d/%d/%d/%d, want all zero (undeclared, never over capacity)", inCount, outCount, localIn, localOut)
	}
	if posY != 137.5 {
		t.Errorf("output canvas position_y = %v, want the mixer node's 137.5", posY)
	}
	if posX != 0 || inPosX != 0 || inPosY != 0 {
		t.Errorf("other positions = %v/%v/%v, want zero (nothing was stored for them before)", posX, inPosX, inPosY)
	}

	// Every channel and output is assigned to its own event's console.
	for _, tc := range []struct {
		table string
		id    int64
		event int64
	}{
		{"input_channels", channelA1, eventA},
		{"input_channels", channelA2, eventA},
		{"input_channels", channelB1, eventB},
		{"audio_patch_outputs", outputA1, eventA},
		{"audio_patch_outputs", outputB1, eventB},
	} {
		var consoleID sql.NullInt64
		if err := database.QueryRow(`SELECT console_id FROM `+tc.table+` WHERE id = ?`, tc.id).Scan(&consoleID); err != nil {
			t.Fatalf("read %s console_id: %v", tc.table, err)
		}
		if !consoleID.Valid {
			t.Fatalf("%s %d has no console after the backfill", tc.table, tc.id)
		}
		var ownerEvent int64
		if err := database.QueryRow(`SELECT event_id FROM event_consoles WHERE id = ?`, consoleID.Int64).Scan(&ownerEvent); err != nil {
			t.Fatalf("read console event: %v", err)
		}
		if ownerEvent != tc.event {
			t.Errorf("%s %d assigned to a console of event %d, want %d", tc.table, tc.id, ownerEvent, tc.event)
		}
	}

	// The superseded float column is gone: two places storing where the desk
	// sits would drift.
	if _, err := database.Exec(`SELECT output_mixer_position_y FROM events`); err == nil {
		t.Error("events.output_mixer_position_y still exists after 042")
	}

	execMigrationFileTx(t, database, "042_event_consoles.down.sql")

	var restored float64
	if err := database.QueryRow(`SELECT output_mixer_position_y FROM events WHERE id = ?`, eventA).Scan(&restored); err != nil {
		t.Fatalf("read restored mixer position: %v", err)
	}
	if restored != 137.5 {
		t.Errorf("restored position_y = %v, want the original 137.5", restored)
	}
	var channelsLeft int
	if err := database.QueryRow(`SELECT COUNT(*) FROM input_channels`).Scan(&channelsLeft); err != nil {
		t.Fatalf("count channels after down: %v", err)
	}
	if channelsLeft != 3 {
		t.Errorf("channels after down = %d, want all 3 — a down migration must not lose a patch", channelsLeft)
	}
}

// TestConsoleMigration043 covers the four columns Slice 24 adds for the desk's
// local jack panel, which became its own node on each canvas. The point of the
// test is the default: an existing desk must open with its panel inside the
// processing lane, not stacked on the canvas origin (research.md R8), and its own
// node's position must be left exactly as it was.
func TestConsoleMigration043(t *testing.T) {
	database := openMigratedTo(t, 42)

	event := mustInsertID(t, database, `INSERT INTO events (name) VALUES (?)`, "Event A")
	console := mustInsertID(t, database,
		`INSERT INTO event_consoles (event_id, name, role, local_input_count, local_output_count, position_y, input_position_y)
		 VALUES (?, 'FOH · SD10', 'foh', 8, 4, 137.5, 76)`, event)

	if _, err := database.Exec(`SELECT local_position_x FROM event_consoles`); err == nil {
		t.Fatal("local_position_x exists at 42; the test is not exercising 043")
	}

	execMigrationFileTx(t, database, "043_console_local_positions.up.sql")

	var localX, localY, localInX, localInY, posY, inPosY float64
	err := database.QueryRow(`SELECT local_position_x, local_position_y, local_input_position_x, local_input_position_y,
		position_y, input_position_y FROM event_consoles WHERE id = ?`, console).
		Scan(&localX, &localY, &localInX, &localInY, &posY, &inPosY)
	if err != nil {
		t.Fatalf("read local positions: %v", err)
	}
	if localX != 260 || localY != 320 || localInX != 260 || localInY != 320 {
		t.Errorf("local positions = %v/%v and %v/%v, want 260/320 on both canvases — a zero would drop the panel on the origin",
			localX, localY, localInX, localInY)
	}
	if posY != 137.5 || inPosY != 76 {
		t.Errorf("desk's own node moved to %v/%v, want 137.5/76 — 043 places a second node, it does not move the first", posY, inPosY)
	}

	execMigrationFileTx(t, database, "043_console_local_positions.down.sql")

	for _, column := range []string{"local_position_x", "local_position_y", "local_input_position_x", "local_input_position_y"} {
		if _, err := database.Exec(`SELECT ` + column + ` FROM event_consoles`); err == nil {
			t.Errorf("%s still exists after the down migration", column)
		}
	}
	var consolesLeft int
	if err := database.QueryRow(`SELECT COUNT(*) FROM event_consoles`).Scan(&consolesLeft); err != nil {
		t.Fatalf("count consoles after down: %v", err)
	}
	if consolesLeft != 1 {
		t.Errorf("consoles after down = %d, want 1 — only the placement is lost", consolesLeft)
	}
}
