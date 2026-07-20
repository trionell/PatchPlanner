package db

import "testing"

// TestEventSettingsMigrationFanOut covers T033/US3: migration 039 gives
// every event that exists at migration time its own full, independent
// copy of the pre-migration global vocabulary.
func TestEventSettingsMigrationFanOut(t *testing.T) {
	database := openMigratedTo(t, 38)

	mustExec(t, database, `INSERT INTO events (name) VALUES ('Gig A'), ('Gig B')`)

	var globalCount int
	if err := database.QueryRow(`SELECT COUNT(*) FROM reference_values`).Scan(&globalCount); err != nil {
		t.Fatalf("count pre-migration global rows: %v", err)
	}
	if globalCount == 0 {
		t.Fatal("no pre-migration reference_values to fan out — seed missing")
	}

	execMigrationFileTx(t, database, "039_event_settings.up.sql")

	for _, eventID := range []int{1, 2} {
		var count int
		if err := database.QueryRow(`SELECT COUNT(*) FROM reference_values WHERE event_id = ?`, eventID).Scan(&count); err != nil {
			t.Fatalf("count event %d's vocabulary: %v", eventID, err)
		}
		if count != globalCount {
			t.Errorf("event %d has %d vocabulary values, want %d (full copy of pre-migration global set)", eventID, count, globalCount)
		}
	}

	// The seed rows themselves survive, untouched, as the permanent
	// shared source for future EnsureUserHasReferenceTemplate calls.
	var seedCount int
	if err := database.QueryRow(`SELECT COUNT(*) FROM reference_values WHERE event_id IS NULL`).Scan(&seedCount); err != nil {
		t.Fatalf("count seed rows: %v", err)
	}
	if seedCount != globalCount {
		t.Errorf("seed rows = %d after migration, want %d (unchanged)", seedCount, globalCount)
	}

	// Byte-for-byte label content, not just row counts.
	var mismatched int
	if err := database.QueryRow(`
		SELECT COUNT(*) FROM reference_values e
		JOIN reference_values seed ON seed.event_id IS NULL AND seed.vocabulary = e.vocabulary AND seed.value = e.value
		WHERE e.event_id = 1 AND e.label != seed.label`).Scan(&mismatched); err != nil {
		t.Fatalf("compare labels: %v", err)
	}
	if mismatched != 0 {
		t.Errorf("%d of event 1's values have a label that doesn't match the pre-migration seed", mismatched)
	}
}

// TestEventSettingsMigrationIsolatesPreExistingEvents covers T034: two
// events that both existed before migration 039 are, afterward, just as
// isolated from each other as any two newly-created events — editing one
// never affects the other.
func TestEventSettingsMigrationIsolatesPreExistingEvents(t *testing.T) {
	database := openMigratedTo(t, 38)
	mustExec(t, database, `INSERT INTO events (name) VALUES ('Gig A'), ('Gig B')`)
	execMigrationFileTx(t, database, "039_event_settings.up.sql")

	dataA, err := ListReferenceData(database, 1)
	if err != nil {
		t.Fatalf("list event A data: %v", err)
	}
	target := dataA["preamp_connectors"][0]

	if _, err := UpdateReferenceValueLabel(database, 1, "preamp_connectors", target.ID, "Renamed on migrated event A"); err != nil {
		t.Fatalf("rename on event A: %v", err)
	}

	dataB, err := ListReferenceData(database, 2)
	if err != nil {
		t.Fatalf("list event B data: %v", err)
	}
	for _, v := range dataB["preamp_connectors"] {
		if v.Value == target.Value && v.Label == "Renamed on migrated event A" {
			t.Errorf("event A's rename leaked into event B's identical migrated value: %+v", v)
		}
	}
}
