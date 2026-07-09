package db

import (
	"testing"
)

// TestStereoDiMigration replays migration 022 on a pre-022 schema seeded
// with pre-existing rows and verifies it is purely additive: every existing
// row lands on the safe defaults (mono, stereo_channel, two_cables) with no
// side-B routing and no source cable, exactly reproducing today's behavior
// (spec SC-005).
func TestStereoDiMigration(t *testing.T) {
	database := openMigratedTo(t, 21)

	mustExec(t, database, `INSERT INTO events (name) VALUES ('Gig A')`)
	mustExec(t, database, `INSERT INTO audio_patch_inputs (event_id, channel_number, signal_type) VALUES (1, 1, 'mic'), (1, 2, 'di')`)
	mustExec(t, database, `INSERT INTO audio_patch_outputs (event_id, output_number, output_type, destination_type) VALUES (1, 1, 'foh', 'local')`)

	execMigrationFileTx(t, database, "022_stereo_di.up.sql")

	var width, mixerBehavior, sourceCabling string
	var stageboxIDB, stageMultiIDB, sourceCableItemID any
	row := database.QueryRow(`SELECT width, mixer_behavior, source_cabling, stagebox_id_b, stage_multi_id_b, source_cable_item_id FROM audio_patch_inputs WHERE channel_number = 1`)
	if err := row.Scan(&width, &mixerBehavior, &sourceCabling, &stageboxIDB, &stageMultiIDB, &sourceCableItemID); err != nil {
		t.Fatalf("scan migrated input: %v", err)
	}
	if width != "mono" {
		t.Errorf("input width = %q, want mono", width)
	}
	if mixerBehavior != "stereo_channel" {
		t.Errorf("input mixer_behavior = %q, want stereo_channel", mixerBehavior)
	}
	if sourceCabling != "two_cables" {
		t.Errorf("input source_cabling = %q, want two_cables", sourceCabling)
	}
	if stageboxIDB != nil || stageMultiIDB != nil || sourceCableItemID != nil {
		t.Errorf("migrated input has non-null side-B/source-cable columns: %v %v %v", stageboxIDB, stageMultiIDB, sourceCableItemID)
	}

	var outputWidth string
	var outputStageboxIDB any
	if err := database.QueryRow(`SELECT width, stagebox_id_b FROM audio_patch_outputs WHERE output_number = 1`).Scan(&outputWidth, &outputStageboxIDB); err != nil {
		t.Fatalf("scan migrated output: %v", err)
	}
	if outputWidth != "mono" {
		t.Errorf("output width = %q, want mono", outputWidth)
	}
	if outputStageboxIDB != nil {
		t.Errorf("migrated output has non-null stagebox_id_b: %v", outputStageboxIDB)
	}
}
