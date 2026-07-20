package db

import (
	"database/sql"
	"testing"
)

// legacyInsertCategory/legacyInsertItem insert against the pre-023 schema
// (before the inventory_id column existed), for tests that replay
// migrations only partway. The shared insertCategory/insertItem helpers
// assume the current schema and would fail against this older one.
func legacyInsertCategory(t *testing.T, database *sql.DB, name, categoryType string) int64 {
	t.Helper()
	result, err := database.Exec(`INSERT INTO inventory_categories (name, category_type) VALUES (?, ?)`, name, categoryType)
	if err != nil {
		t.Fatalf("insert category %s: %v", name, err)
	}
	id, _ := result.LastInsertId()
	return id
}

func legacyInsertItem(t *testing.T, database *sql.DB, categoryID int64, name string, quantity int, price float64, xlsxRow int) int64 {
	t.Helper()
	result, err := database.Exec(`INSERT INTO inventory_items (category_id, name, quantity_available, price_ex_vat, xlsx_row) VALUES (?, ?, ?, ?, ?)`,
		categoryID, name, quantity, price, xlsxRow)
	if err != nil {
		t.Fatalf("insert item %s: %v", name, err)
	}
	id, _ := result.LastInsertId()
	return id
}

// TestOutputChainsMigration replays migration 023 on a pre-023 schema
// seeded with every shape of pre-existing output row and verifies the
// conversion into output_chain_hops/output_devices exactly matches
// research.md R6: an amplifier becomes a one-off shared device (never
// doubles) at hop 0 carrying the row's cable; a speaker becomes a plain
// device hop; a stagebox/stage-multi destination becomes a route hop;
// legacy cable text with no catalog pick and no amp/speaker becomes a
// bare device hop so nothing is silently dropped.
func TestOutputChainsMigration(t *testing.T) {
	database := openMigratedTo(t, 22)

	mustExec(t, database, `INSERT INTO events (name) VALUES ('Gig A')`)
	cat := legacyInsertCategory(t, database, "Audio", "audio")
	amp := legacyInsertItem(t, database, cat, "Lab.Gruppen FP2400", 1, 400, 12)
	speaker := legacyInsertItem(t, database, cat, "JBL SRX835P", 4, 500, 13)
	cable := legacyInsertItem(t, database, cat, "Speakon cable 10m", 10, 50, 14)

	mustExec(t, database, `INSERT INTO stageboxes (event_id, name) VALUES (1, 'FOH Rack')`)
	mustExec(t, database, `INSERT INTO stage_multis (event_id, name) VALUES (1, 'Multi A')`)

	// Row 1: local, amplifier + speaker + a picked cable.
	mustExec(t, database, `INSERT INTO audio_patch_outputs (event_id, output_number, output_type, destination_type, amplifier_item_id, speaker_item_id, cable_item_id) VALUES (1, 1, 'foh', 'local', ?, ?, ?)`, amp, speaker, cable)

	// Row 2: local, only legacy cable text (Slice 6's backfill never converted it), no amp, no speaker.
	mustExec(t, database, `INSERT INTO audio_patch_outputs (event_id, output_number, output_type, destination_type, cable_type, cable_length_m) VALUES (1, 2, 'foh', 'local', 'nl4', 15)`)

	// Row 3: stagebox destination, side B set, a picked cable.
	mustExec(t, database, `INSERT INTO audio_patch_outputs (event_id, output_number, output_type, destination_type, stagebox_id, stagebox_channel, stagebox_id_b, stagebox_channel_b, cable_item_id) VALUES (1, 3, 'monitor', 'stagebox', 1, 5, 1, 6, ?)`, cable)

	// Row 4: stage_multi destination, no cable at all.
	mustExec(t, database, `INSERT INTO audio_patch_outputs (event_id, output_number, output_type, destination_type, stage_multi_id, stage_multi_channel) VALUES (1, 4, 'sub', 'stage_multi', 1, 3)`)

	execMigrationFileTx(t, database, "023_output_chains.up.sql")
	execMigrationFileTx(t, database, "024_output_chain_cable_b.up.sql")

	// Row 1: hop0 shared device wrapping amp + cable, hop1 plain speaker.
	hops1 := queryHops(t, database, 1)
	if len(hops1) != 2 {
		t.Fatalf("row 1: got %d hops, want 2: %+v", len(hops1), hops1)
	}
	if hops1[0].hopKind != "device" || hops1[0].deviceSource.String != "shared" {
		t.Errorf("row 1 hop0 = %+v, want shared device", hops1[0])
	}
	if !hops1[0].cableItemID.Valid || hops1[0].cableItemID.Int64 != cable {
		t.Errorf("row 1 hop0 cable = %v, want %d", hops1[0].cableItemID, cable)
	}
	sharedAmp := sharedDeviceItem(t, database, hops1[0].outputDeviceID.Int64)
	if sharedAmp != amp {
		t.Errorf("row 1 hop0 shared device item = %d, want %d (amp)", sharedAmp, amp)
	}
	if hops1[1].hopKind != "device" || hops1[1].deviceSource.String != "inventory" || hops1[1].inventoryItemID.Int64 != speaker {
		t.Errorf("row 1 hop1 = %+v, want plain speaker device", hops1[1])
	}
	if hops1[1].cableItemID.Valid {
		t.Errorf("row 1 hop1 cable should be empty (cable already on hop0), got %v", hops1[1].cableItemID)
	}

	// Row 2: one bare device hop carrying only the legacy cable text.
	hops2 := queryHops(t, database, 2)
	if len(hops2) != 1 {
		t.Fatalf("row 2: got %d hops, want 1: %+v", len(hops2), hops2)
	}
	if hops2[0].cableType.String != "nl4" || hops2[0].cableLengthM.Float64 != 15 {
		t.Errorf("row 2 hop0 legacy cable = %+v, want nl4/15", hops2[0])
	}
	if hops2[0].deviceSource.Valid || hops2[0].inventoryItemID.Valid || hops2[0].outputDeviceID.Valid {
		t.Errorf("row 2 hop0 should have no device pick, got %+v", hops2[0])
	}

	// Row 3: one route hop, both sides, its cable.
	hops3 := queryHops(t, database, 3)
	if len(hops3) != 1 {
		t.Fatalf("row 3: got %d hops, want 1: %+v", len(hops3), hops3)
	}
	if hops3[0].hopKind != "route" || !hops3[0].stageboxID.Valid || hops3[0].stageboxID.Int64 != 1 || hops3[0].stageboxChannel.Int64 != 5 {
		t.Errorf("row 3 hop0 side A = %+v, want stagebox 1 ch 5", hops3[0])
	}
	if !hops3[0].stageboxIDB.Valid || hops3[0].stageboxIDB.Int64 != 1 || hops3[0].stageboxChannelB.Int64 != 6 {
		t.Errorf("row 3 hop0 side B = %+v, want stagebox 1 ch 6", hops3[0])
	}
	if !hops3[0].cableItemID.Valid || hops3[0].cableItemID.Int64 != cable {
		t.Errorf("row 3 hop0 cable = %v, want %d", hops3[0].cableItemID, cable)
	}

	// Row 4: one route hop, stage multi, no cable.
	hops4 := queryHops(t, database, 4)
	if len(hops4) != 1 {
		t.Fatalf("row 4: got %d hops, want 1: %+v", len(hops4), hops4)
	}
	if hops4[0].hopKind != "route" || !hops4[0].stageMultiID.Valid || hops4[0].stageMultiID.Int64 != 1 || hops4[0].stageMultiChannel.Int64 != 3 {
		t.Errorf("row 4 hop0 = %+v, want stage multi 1 ch 3", hops4[0])
	}
	if hops4[0].cableItemID.Valid {
		t.Errorf("row 4 hop0 cable should be empty, got %v", hops4[0].cableItemID)
	}

	// audio_patch_outputs no longer has the superseded columns.
	rows, err := database.Query(`SELECT id, event_id, output_number, output_name, output_type, width, color, notes FROM audio_patch_outputs ORDER BY output_number`)
	if err != nil {
		t.Fatalf("select rebuilt audio_patch_outputs: %v", err)
	}
	rows.Close()
}

type hopRow struct {
	position          int
	hopKind           string
	cableItemID       sql.NullInt64
	cableType         sql.NullString
	cableLengthM      sql.NullFloat64
	deviceSource      sql.NullString
	inventoryItemID   sql.NullInt64
	outputDeviceID    sql.NullInt64
	stageboxID        sql.NullInt64
	stageboxChannel   sql.NullInt64
	stageboxIDB       sql.NullInt64
	stageboxChannelB  sql.NullInt64
	stageMultiID      sql.NullInt64
	stageMultiChannel sql.NullInt64
}

func queryHops(t *testing.T, database *sql.DB, outputNumber int) []hopRow {
	t.Helper()
	rows, err := database.Query(`
		SELECT h.position, h.hop_kind, h.cable_item_id, h.cable_type, h.cable_length_m,
			h.device_source, h.inventory_item_id, h.output_device_id,
			h.stagebox_id, h.stagebox_channel, h.stagebox_id_b, h.stagebox_channel_b,
			h.stage_multi_id, h.stage_multi_channel
		FROM output_chain_hops h
		JOIN audio_patch_outputs o ON o.id = h.output_id
		WHERE o.output_number = ?
		ORDER BY h.position ASC`, outputNumber)
	if err != nil {
		t.Fatalf("query hops for output %d: %v", outputNumber, err)
	}
	defer rows.Close()
	var out []hopRow
	for rows.Next() {
		var h hopRow
		if err := rows.Scan(&h.position, &h.hopKind, &h.cableItemID, &h.cableType, &h.cableLengthM,
			&h.deviceSource, &h.inventoryItemID, &h.outputDeviceID,
			&h.stageboxID, &h.stageboxChannel, &h.stageboxIDB, &h.stageboxChannelB,
			&h.stageMultiID, &h.stageMultiChannel); err != nil {
			t.Fatalf("scan hop: %v", err)
		}
		out = append(out, h)
	}
	return out
}

func sharedDeviceItem(t *testing.T, database *sql.DB, deviceID int64) int64 {
	t.Helper()
	var itemID int64
	if err := database.QueryRow(`SELECT inventory_item_id FROM output_devices WHERE id = ?`, deviceID).Scan(&itemID); err != nil {
		t.Fatalf("look up output_devices %d: %v", deviceID, err)
	}
	return itemID
}

// Rental-parity coverage for the 023/024 hop migration (formerly
// TestOutputChainsMigrationRentalParity) was retired in Slice 11: rental
// counting no longer reads output_chain_hops at all (research.md R4), so
// there is nothing left for that parity check to pin. Slice 11's own
// TestConvertOutputChainHopsToGraph in output_graph_migration_test.go
// covers the full migration path (023's hop conversion followed by the
// graph conversion) against the shapes that matter for rental counting
// today.
