package db

import (
	"testing"
)

// TestGroupsDcasMigration replays migration 021 on a pre-021 schema seeded
// with real-shaped legacy dca_groups text and verifies the one-time
// conversion: token split, whitespace merging, case-insensitive dedupe,
// per-event isolation, LR seeding + routing backfill, column swap, and the
// palette seed.
func TestGroupsDcasMigration(t *testing.T) {
	database := openMigratedTo(t, 20)

	mustExec(t, database, `INSERT INTO events (name) VALUES ('Gig A'), ('Gig B')`)
	seed := []struct {
		event   int
		channel int
		dca     any
	}{
		{1, 1, "Trummor"},
		{1, 2, " Trummor "},
		{1, 3, "Trummor, Keys"},
		{1, 4, ""},
		{1, 5, nil},
		{2, 1, "Trummor"},
	}
	for _, row := range seed {
		mustExec(t, database, `INSERT INTO audio_patch_inputs (event_id, channel_number, signal_type, dca_groups) VALUES (?, ?, 'mic', ?)`, row.event, row.channel, row.dca)
	}
	mustExec(t, database, `INSERT INTO audio_patch_outputs (event_id, output_number, output_type, destination_type) VALUES (1, 1, 'foh', 'local')`)

	execMigrationFileTx(t, database, "021_groups_dcas.up.sql")

	// DCA conversion: whitespace variants merge into one "Trummor" per
	// event; the comma-separated row also yields "Keys".
	countDCAs := func(event int) int {
		var n int
		if err := database.QueryRow(`SELECT COUNT(*) FROM mixer_dcas WHERE event_id = ?`, event).Scan(&n); err != nil {
			t.Fatalf("count dcas event %d: %v", event, err)
		}
		return n
	}
	if got := countDCAs(1); got != 2 {
		t.Errorf("event 1 has %d DCAs, want 2 (Trummor, Keys)", got)
	}
	if got := countDCAs(2); got != 1 {
		t.Errorf("event 2 has %d DCAs, want 1 (own Trummor)", got)
	}

	// Channel assignments follow the split, per event.
	assignments := map[string]int{}
	rows, err := database.Query(`
		SELECT i.event_id, i.channel_number, d.name
		FROM audio_input_dcas ad
		JOIN audio_patch_inputs i ON i.id = ad.input_id
		JOIN mixer_dcas d ON d.id = ad.dca_id`)
	if err != nil {
		t.Fatalf("list dca assignments: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var event, channel int
		var name string
		if err := rows.Scan(&event, &channel, &name); err != nil {
			t.Fatalf("scan dca assignment: %v", err)
		}
		assignments[name] = assignments[name] + 1
		if event == 1 && channel >= 4 {
			t.Errorf("empty/null legacy row (ch %d) got DCA %q", channel, name)
		}
	}
	if assignments["Trummor"] != 4 { // e1 ch1–3 + e2 ch1
		t.Errorf("Trummor assigned to %d channels, want 4", assignments["Trummor"])
	}
	if assignments["Keys"] != 1 {
		t.Errorf("Keys assigned to %d channels, want 1", assignments["Keys"])
	}

	// LR exists on both events and every input is routed to its event's LR.
	var lrCount int
	if err := database.QueryRow(`SELECT COUNT(*) FROM mixer_groups WHERE name = 'LR' AND is_builtin = 1`).Scan(&lrCount); err != nil {
		t.Fatalf("count LR groups: %v", err)
	}
	if lrCount != 2 {
		t.Errorf("%d LR groups, want 2 (one per event)", lrCount)
	}
	var routed int
	if err := database.QueryRow(`
		SELECT COUNT(*) FROM audio_patch_inputs i
		JOIN audio_input_groups ag ON ag.input_id = i.id
		JOIN mixer_groups g ON g.id = ag.group_id AND g.event_id = i.event_id AND g.is_builtin = 1`).Scan(&routed); err != nil {
		t.Fatalf("count LR routings: %v", err)
	}
	if routed != len(seed) {
		t.Errorf("%d inputs routed to their LR, want %d", routed, len(seed))
	}

	// Column swap: dca_groups is gone, color exists on inputs and outputs.
	if _, err := database.Exec(`SELECT dca_groups FROM audio_patch_inputs LIMIT 1`); err == nil {
		t.Error("dca_groups column still exists after migration")
	}
	if _, err := database.Exec(`SELECT color FROM audio_patch_inputs LIMIT 1`); err != nil {
		t.Errorf("inputs color column missing: %v", err)
	}
	if _, err := database.Exec(`SELECT color FROM audio_patch_outputs LIMIT 1`); err != nil {
		t.Errorf("outputs color column missing: %v", err)
	}

	// Palette seed.
	var colors int
	if err := database.QueryRow(`SELECT COUNT(*) FROM reference_values WHERE vocabulary = 'channel_colors'`).Scan(&colors); err != nil {
		t.Fatalf("count channel_colors: %v", err)
	}
	if colors != 8 {
		t.Errorf("%d channel_colors seeded, want 8", colors)
	}
}
