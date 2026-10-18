package consolefile

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func lv1Fixture() Show {
	sg := func(slot, port int) *DeskPort {
		return &DeskPort{Socket: "device", Bank: 0, Slot: slot, Index: port, Device: "SG4000"}
	}
	return Show{
		EventName: "Julkonsert",
		DeskName:  "Monitor",
		Engine:    "lv1",
		Strips: []Strip{
			{ID: 1, Number: 1, Name: "Kick", Color: "#fe4f4f", Input: sg(0, 0), Phantom: false},
			{ID: 2, Number: 2, Name: "Sång", Color: "#0fa1ab", Input: sg(0, 3), Phantom: true},
			{ID: 3, Number: 3, Stereo: true, Name: "Keys", Color: "#448aff", Input: sg(0, 4), InputR: sg(0, 5)},
			{ID: 4, Number: 4, Name: "Spare"},
		},
		Mixes: []Mix{
			{ID: 100, Kind: "main", Slot: 1, Stereo: true, Name: "L/R"},
			{ID: 110, Kind: "subgroup", Slot: 1, Stereo: true, Name: "Drums"},
			{ID: 111, Kind: "subgroup", Slot: 2, Stereo: true, Name: "Band"},
			{ID: 120, Kind: "monitor", Slot: 1, Name: "Wedge 1"},
			{ID: 121, Kind: "monitor", Slot: 10, Name: "IEM 10"},
			{ID: 130, Kind: "fx", Slot: 1, Name: "Verb"},
			{ID: 140, Kind: "matrix", Slot: 1, Name: "Rec"},
			{ID: 150, Kind: "dca", Slot: 1, Name: "Vox"},
			{ID: 160, Kind: "mute", Slot: 1, Name: "Band"},
		},
		Routes: []Route{
			{FromStrip: 1, ToMix: 110}, // Kick → Drums
			{FromMix: 110, ToMix: 111}, // Drums → Band (forward)
			{FromMix: 111, ToMix: 100}, // Band → L/R
			{FromMix: 111, ToMix: 110}, // Band → Drums: refused, backward
			{FromStrip: 2, ToMix: 100}, // Sång → L/R
			{FromStrip: 2, ToMix: 120}, // Sång → Wedge 1
			{FromStrip: 2, ToMix: 121}, // Sång → IEM 10 (aux 17: the _2_ family)
			{FromStrip: 1, ToMix: 130}, // Kick → Verb
			{FromStrip: 2, ToMix: 150}, // Sång on DCA 1
			{FromMix: 120, ToMix: 140}, // Wedge 1 → Rec
			{FromStrip: 1, ToMix: 160}, // Kick in mute 1
		},
		Outputs: []Output{
			{ID: 1, Name: "Wedge 1", Port: sg(0, 0), FedByMix: 120},
			{ID: 2, Name: "PA", Stereo: true, Port: sg(0, 1), PortR: sg(0, 2), FedByMix: 100},
		},
		Tracks:         []Track{{Number: 1, FromStrip: 1, PlayStrip: 1, Soundcheck: true}},
		RecorderTracks: 64,
	}
}

func openWritten(t *testing.T, show Show) (*sql.DB, []Notice) {
	t.Helper()
	out, notices, err := WriteLV1(show)
	if err != nil {
		t.Fatalf("WriteLV1: %v", err)
	}
	path := filepath.Join(t.TempDir(), "out.emo")
	if err := os.WriteFile(path, out, 0o600); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	var ok string
	if err := db.QueryRow(`PRAGMA integrity_check`).Scan(&ok); err != nil || ok != "ok" {
		t.Fatalf("integrity_check = %q %v", ok, err)
	}
	// WAL, as LV1 writes its own sessions: header bytes 18–19 are 2.
	if out[18] != 2 || out[19] != 2 {
		t.Errorf("file format bytes %d %d, want WAL (2 2)", out[18], out[19])
	}
	return db, notices
}

func one[T any](t *testing.T, db *sql.DB, query string, args ...any) T {
	t.Helper()
	var v T
	if err := db.QueryRow(query, args...).Scan(&v); err != nil {
		t.Fatalf("%s: %v", query, err)
	}
	return v
}

func objectID(t *testing.T, db *sql.DB, cluster, index int) int64 {
	return one[int64](t, db, `SELECT id FROM object WHERE obj_type = ? AND obj_index = ?`, cluster, index)
}

func TestLV1StripsNamesColoursStereo(t *testing.T) {
	db, _ := openWritten(t, lv1Fixture())
	kick, sang, keys := objectID(t, db, lv1Input, 0), objectID(t, db, lv1Input, 1), objectID(t, db, lv1Input, 2)
	if got := one[string](t, db, `SELECT name FROM snapshot_chainer WHERE chainer_id = ? AND snapshot_id = -1`, kick); got != "Kick" {
		t.Errorf("Kick's name %q", got)
	}
	if got := one[float64](t, db, `SELECT param_value FROM snapshot_chainer_params WHERE chainer_id = ? AND snapshot_id = -1 AND param_id = 592`, kick); got != 19 {
		t.Errorf("Kick's colour %v, want palette 19", got)
	}
	// Palette 13 is LV1's default and is stored as no row.
	if n := one[int](t, db, `SELECT COUNT(*) FROM snapshot_chainer_params WHERE chainer_id = ? AND param_id = 592`, sang); n != 0 {
		t.Errorf("Sång's default colour stored as a row")
	}
	if got := one[int](t, db, `SELECT num_inputs FROM chainer WHERE obj_id = ?`, keys); got != 2 {
		t.Errorf("Keys num_inputs %d", got)
	}
	if got := one[string](t, db, `SELECT group_concat(plugin_4cc, ',') FROM (SELECT plugin_4cc FROM plug WHERE chainer_id = ? ORDER BY slot)`, keys); got != "CFLS,CDYS,MQ4S" {
		t.Errorf("Keys plugs %s", got)
	}
	if got := one[string](t, db, `SELECT group_concat(preset_id, ',') FROM (SELECT sp.preset_id FROM snapshot_plugin sp JOIN plug p ON p.id = sp.plug_id WHERE p.chainer_id = ? ORDER BY p.slot)`, keys); got != "4,5,6" {
		t.Errorf("Keys presets %s", got)
	}
	// The trap: colour survives beside every other write on the strip (sends, assignments).
	if n := one[int](t, db, `SELECT COUNT(*) FROM snapshot_chainer_params WHERE chainer_id = ? AND param_id = 592`, kick); n != 1 {
		t.Error("Kick lost its colour")
	}
}

func TestLV1Assignments(t *testing.T) {
	db, notices := openWritten(t, lv1Fixture())
	kick, sang, keys := objectID(t, db, lv1Input, 0), objectID(t, db, lv1Input, 1), objectID(t, db, lv1Input, 2)
	main, drums, band := objectID(t, db, lv1Main, 0), objectID(t, db, lv1Group, 0), objectID(t, db, lv1Group, 1)
	has := func(src, dst int64, control, asgn int) bool {
		return one[int](t, db, `SELECT COUNT(*) FROM snapshot_assignment WHERE snapshot_id = -1 AND src_id = ? AND dst_id = ? AND src_control_id = ? AND dst_asgn_type = ?`, src, dst, control, asgn) == 1
	}
	if !has(sang, main, 2, 0) || has(kick, main, 2, 0) || has(keys, main, 2, 0) {
		t.Error("Main L/R holds exactly the strips routed there")
	}
	if !has(kick, drums, 2, 0) || !has(drums, band, 2, 0) || !has(band, main, 2, 0) || has(drums, main, 2, 0) {
		t.Error("group assignments")
	}
	if has(band, drums, 2, 0) {
		t.Error("a backward group route was written")
	}
	if !has(sang, objectID(t, db, lv1DCA, 0), -1, 2) || !has(kick, objectID(t, db, lv1Mute, 0), -1, 2) {
		t.Error("DCA / mute")
	}
	if !has(objectID(t, db, lv1Mon, 0), objectID(t, db, lv1Matrix, 0), 0, 0) {
		t.Error("Mon → matrix")
	}
	param := func(strip int64, name string) float64 {
		return one[float64](t, db, `SELECT param_value FROM snapshot_chainer_params p JOIN chainer_params c ON c.id = p.param_id WHERE p.chainer_id = ? AND p.snapshot_id = -1 AND c.name = ?`, strip, name)
	}
	if param(sang, "PARAM_AUX_SEND_ONOFF_8") != 1 || param(sang, "PARAM_AUX_SEND_GAIN_8") != 0 {
		t.Error("Sång → Mon 1 send")
	}
	if param(sang, "PARAM_AUX_SEND_ONOFF_2_1") != 1 {
		t.Error("Sång → Mon 10 is aux 17, the _2_1 family")
	}
	if param(kick, "PARAM_AUX_SEND_ONOFF_0") != 1 {
		t.Error("Kick → FX 1 send")
	}
	found := false
	for _, n := range notices {
		if n.Word == LeftOut && strings.Contains(n.Text, "routes an LV1 cannot make") {
			found = true
		}
	}
	if !found {
		t.Errorf("backward group route not Left out: %+v", notices)
	}
}

func TestLV1DevicesPatchAndRecorder(t *testing.T) {
	db, notices := openWritten(t, lv1Fixture())
	if got := one[string](t, db, `SELECT name FROM device_name WHERE gender = 0`); got != "SG4000-1" {
		t.Errorf("device name %s", got)
	}
	chunk := one[string](t, db, `SELECT c.iom_chunk FROM snapshot_iom s JOIN iom_chunks c ON c.id = s.iom_chunk_id WHERE s.snapshot_id = -1 AND s.io_bank = 0 AND s.io_slot = 0`)
	if !strings.Contains(chunk, "\n    3: 1\n") || strings.Contains(chunk, "\n    0: 1\n") {
		t.Errorf("48 V: port 3 (Sång) on, port 0 (Kick) off; chunk %q", chunk[:200])
	}
	route := func(srcCluster, srcIndex, srcChannel, dstCluster, dstIndex, dstChannel int) bool {
		return one[int](t, db, `SELECT COUNT(*) FROM routes WHERE src_cluster_type = ? AND src_cluster_type_index = ? AND src_channel_index = ? AND dst_cluster_type = ? AND dst_cluster_type_index = ? AND dst_channel_index = ?`,
			srcCluster, srcIndex, srcChannel, dstCluster, dstIndex, dstChannel) > 0
	}
	if !route(lv1Inputs, 0, 3, lv1Input, 1, 0) {
		t.Error("SG4000 in 4 → Sång")
	}
	if !route(lv1Inputs, 0, 5, lv1Input, 2, 1) {
		t.Error("SG4000 in 6 → Keys R")
	}
	if !route(lv1Mon, 0, 0, lv1Outputs, 0, 0) || !route(lv1Main, 0, 1, lv1Outputs, 0, 2) {
		t.Error("output routes")
	}
	// The recorder: a DAW device in the first free slot (bank 0 slot 1), Kick's preamp on track 1.
	if got := one[int](t, db, `SELECT COUNT(*) FROM device WHERE device_gender = 1 AND io_bank = 0 AND assign = 1`); got != 1 {
		t.Error("recorder device")
	}
	if !route(lv1Inputs, 0, 0, lv1Outputs, 1, 0) || !route(lv1Inputs, 1, 0, lv1Input, 0, 0) {
		t.Error("recorder record and playback routes")
	}
	var unverified bool
	for _, n := range notices {
		if n.Word == Changed && strings.Contains(n.Text, "unverified") {
			unverified = true
		}
		if n.Word == NoInput && n.Items[0] != "Spare" {
			t.Errorf("no input: %+v", n)
		}
	}
	if !unverified {
		t.Errorf("the recorder is not flagged unverified: %+v", notices)
	}
}
