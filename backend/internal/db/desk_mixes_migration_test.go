package db

import "testing"

// TestDeskMixesMigration055 moves today's event-level groups and DCAs onto the
// desks that play them and reads every membership back as a route.
func TestDeskMixesMigration055(t *testing.T) {
	database := openMigratedTo(t, 54)

	group := func(event int64, name string, builtin int) int64 {
		return mustInsertID(t, database, `INSERT INTO mixer_groups (event_id, name, is_builtin) VALUES (?, ?, ?)`, event, name, builtin)
	}
	dca := func(event int64, name string) int64 {
		return mustInsertID(t, database, `INSERT INTO mixer_dcas (event_id, name) VALUES (?, ?)`, event, name)
	}
	channel := func(event int64, n int, desk any) int64 {
		return mustInsertID(t, database, `INSERT INTO input_channels (event_id, channel_number, width, mixer_behavior, console_id) VALUES (?, ?, 'mono', 'stereo_channel', ?)`, event, n, desk)
	}
	member := func(table, column string, ch, bus int64) {
		mustInsertID(t, database, `INSERT INTO `+table+` (input_id, `+column+`) VALUES (?, ?)`, ch, bus)
	}

	// The wedding's shape: one desk, LR, a subgroup, a DCA, outputs named LR and Drums.
	one := mustInsertID(t, database, `INSERT INTO events (name) VALUES ('One desk')`)
	foh := mustInsertID(t, database, `INSERT INTO event_consoles (event_id, name, role) VALUES (?, 'FOH', 'foh')`, one)
	lrOne, drums, vox := group(one, "LR", 1), group(one, "Drums", 0), dca(one, "Vox")
	kick, sang := channel(one, 1, foh), channel(one, 2, foh)
	member("audio_input_groups", "group_id", kick, lrOne)
	member("audio_input_groups", "group_id", kick, drums)
	member("audio_input_groups", "group_id", sang, lrOne)
	member("audio_input_dcas", "dca_id", sang, vox)
	lrOut := mustInsertID(t, database, `INSERT INTO audio_patch_outputs (event_id, output_number, output_name, output_type, width, console_id) VALUES (?, 1, 'lr', 'foh', 'stereo', ?)`, one, foh)
	sub := mustInsertID(t, database, `INSERT INTO audio_patch_outputs (event_id, output_number, output_name, output_type, width, console_id) VALUES (?, 2, 'Sub', 'sub', 'mono', ?)`, one, foh)

	// Two desks sharing a group, and a group with no members.
	two := mustInsertID(t, database, `INSERT INTO events (name) VALUES ('Two desks')`)
	a := mustInsertID(t, database, `INSERT INTO event_consoles (event_id, name, role) VALUES (?, 'A', 'foh')`, two)
	b := mustInsertID(t, database, `INSERT INTO event_consoles (event_id, name, role) VALUES (?, 'B', 'monitor')`, two)
	group(two, "LR", 1)
	shared := group(two, "Band", 0)
	group(two, "Spare", 0)
	onA, onB := channel(two, 1, a), channel(two, 1, b)
	member("audio_input_groups", "group_id", onA, shared)
	member("audio_input_groups", "group_id", onB, shared)

	// No desk at all: the group waits.
	none := mustInsertID(t, database, `INSERT INTO events (name) VALUES ('No desk')`)
	group(none, "LR", 1)
	group(none, "Choir", 0)

	execMigrationFileTx(t, database, "055_desk_mixes.up.sql")

	mix := func(event int64, desk any, kind, name string) (id int64, slot int) {
		t.Helper()
		err := database.QueryRow(`SELECT id, slot FROM desk_mixes WHERE event_id = ? AND console_id IS ? AND kind = ? AND name = ?`, event, desk, kind, name).Scan(&id, &slot)
		if err != nil {
			t.Fatalf("mix %s/%s on %v: %v", kind, name, desk, err)
		}
		return id, slot
	}
	routed := func(srcKind string, src int64, dstKind string, dst int64) bool {
		var n int
		_ = database.QueryRow(`SELECT COUNT(*) FROM desk_routes WHERE src_kind = ? AND src_id = ? AND dst_kind = ? AND dst_id = ?`, srcKind, src, dstKind, dst).Scan(&n)
		return n == 1
	}

	mainLR, _ := mix(one, foh, "main", "LR")
	drumsMix, slot := mix(one, foh, "subgroup", "Drums")
	voxMix, _ := mix(one, foh, "dca", "Vox")
	if slot != 1 {
		t.Errorf("Drums on slot %d, want 1", slot)
	}
	for _, c := range []struct {
		what    string
		srcKind string
		src     int64
		dstKind string
		dst     int64
	}{
		{"Kick → LR", "channel", kick, "mix", mainLR},
		{"Sång → LR", "channel", sang, "mix", mainLR},
		{"Kick → Drums", "channel", kick, "mix", drumsMix},
		{"Sång → Vox", "channel", sang, "mix", voxMix},
		{"Drums → LR", "mix", drumsMix, "mix", mainLR},
		{"LR fed by Main LR", "mix", mainLR, "output", lrOut},
	} {
		if !routed(c.srcKind, c.src, c.dstKind, c.dst) {
			t.Errorf("missing route %s", c.what)
		}
	}
	var subFed int
	_ = database.QueryRow(`SELECT COUNT(*) FROM desk_routes WHERE dst_kind = 'output' AND dst_id = ?`, sub).Scan(&subFed)
	if subFed != 0 {
		t.Errorf("Sub is fed by something; only an exact name match fills Fed by")
	}

	bandA, _ := mix(two, a, "subgroup", "Band")
	bandB, _ := mix(two, b, "subgroup", "Band")
	if !routed("channel", onA, "mix", bandA) || !routed("channel", onB, "mix", bandB) || routed("channel", onA, "mix", bandB) {
		t.Error("each desk's copy of Band must hold only that desk's members")
	}
	mix(two, a, "subgroup", "Spare") // memberless → the first desk
	mix(none, nil, "subgroup", "Choir")
	mix(none, nil, "main", "LR")

	var leftover int
	if err := database.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE name IN ('mixer_groups', 'mixer_dcas', 'audio_input_groups', 'audio_input_dcas', '_bus_copy')`).Scan(&leftover); err != nil {
		t.Fatal(err)
	}
	if leftover != 0 {
		t.Errorf("%d legacy tables left", leftover)
	}

	execMigrationFileTx(t, database, "055_desk_mixes.down.sql")
	var kickInDrums int
	err := database.QueryRow(`SELECT COUNT(*) FROM audio_input_groups ag JOIN mixer_groups g ON g.id = ag.group_id WHERE ag.input_id = ? AND g.name = 'Drums'`, kick).Scan(&kickInDrums)
	if err != nil || kickInDrums != 1 {
		t.Errorf("down migration lost Kick's Drums membership: %v %d", err, kickInDrums)
	}
}
