package domain

import "testing"

func model(t *testing.T, key string) DeskModel {
	t.Helper()
	m, ok := LookupDeskModel(key)
	if !ok {
		t.Fatalf("no model %s", key)
	}
	return m
}

func mono(id int64, n int, name string) StripRow {
	return StripRow{ID: id, Number: n, Width: "mono", Pool: PoolChannel, Name: name}
}

func TestCheckStripRefusals(t *testing.T) {
	m32 := model(t, "m32l")
	others := []StripRow{
		mono(1, 1, "Kick"),
		{ID: 2, Number: 7, Width: "stereo", Pool: PoolAux, Name: "Pausmusik L/R"},
		mono(3, 5, "Snare"),
	}
	cases := []struct {
		name    string
		row     StripRow
		message string
		fix     *StripFix
	}{
		{"past aux", StripRow{ID: 9, Number: 9, Width: "mono", Pool: PoolAux}, "Aux 9 is past M32 Live's 8 aux inputs.", &StripFix{1, PoolAux}},
		{"past channels", mono(9, 33, ""), "Ch 33 is past M32 Live's 32 channels.", &StripFix{2, PoolChannel}},
		{"even stereo start", StripRow{ID: 9, Number: 6, Width: "stereo", Pool: PoolChannel}, "On FOH · M32 Live a stereo channel starts on an odd number.", &StripFix{7, PoolChannel}},
		{"taken aux", StripRow{ID: 9, Number: 7, Width: "mono", Pool: PoolAux}, "Aux 7 is Pausmusik L/R's.", &StripFix{1, PoolAux}},
		{"taken channel", mono(9, 5, ""), "Ch 5 is Snare's.", &StripFix{6, PoolChannel}},
	}
	for _, c := range cases {
		got := CheckStrip("FOH", m32, c.row, others)
		if got == nil {
			t.Errorf("%s: not refused", c.name)
			continue
		}
		if got.Message != c.message {
			t.Errorf("%s: message %q, want %q", c.name, got.Message, c.message)
		}
		if (got.Fix == nil) != (c.fix == nil) || (got.Fix != nil && *got.Fix != *c.fix) {
			t.Errorf("%s: fix %+v, want %+v", c.name, got.Fix, c.fix)
		}
	}
	if got := CheckStrip("FOH", m32, StripRow{ID: 9, Number: 3, Width: "stereo", Pool: PoolChannel}, others); got != nil {
		t.Errorf("3–4 is free: %v", got)
	}
}

func TestCheckStripEngines(t *testing.T) {
	lv1 := model(t, "lv1_64")
	if got := CheckStrip("Mon", lv1, StripRow{ID: 1, Number: 6, Width: "stereo", Pool: PoolChannel}, nil); got != nil {
		t.Errorf("LV1 stereo on 6 is one strip: %v", got)
	}
	if got := CheckStrip("Mon", lv1, StripRow{ID: 1, Number: 1, Width: "mono", Pool: PoolAux}, nil); got == nil {
		t.Error("LV1 has no aux")
	}
	generic := model(t, DeskModelGeneric)
	if got := CheckStrip("FOH", generic, mono(1, 500, ""), []StripRow{mono(2, 500, "")}); got != nil {
		t.Errorf("Generic refuses nothing: %v", got)
	}
}

func TestStripWidthCountsStrips(t *testing.T) {
	x32 := model(t, "x32")
	total := 0
	for i := 0; i < 28; i++ {
		total += x32.StripWidth("mono", "")
	}
	for i := 0; i < 4; i++ {
		total += x32.StripWidth("stereo", "stereo_channel")
	}
	if total != 36 {
		t.Errorf("28 mono + 4 stereo on X32 = %d strips, want 36", total)
	}
}

func TestSuggestNumber(t *testing.T) {
	m32 := model(t, "m32")
	pair := []StripRow{mono(1, 1, ""), {ID: 2, Number: 5, Width: "stereo", Pool: PoolChannel}}
	if n, ok := SuggestNumber(m32, PoolChannel, "mono", "", pair); !ok || n != 7 {
		t.Errorf("after 5–6: %d %v, want 7", n, ok)
	}
	if n, ok := SuggestNumber(m32, PoolChannel, "stereo", "", []StripRow{mono(1, 1, "")}); !ok || n != 3 {
		t.Errorf("stereo after 1: %d, want 3", n)
	}
	// Past the end it takes the lowest free strip.
	tail := []StripRow{mono(1, 32, "")}
	if n, ok := SuggestNumber(m32, PoolChannel, "mono", "", tail); !ok || n != 1 {
		t.Errorf("after 32: %d, want 1", n)
	}
	var full []StripRow
	for i := 1; i <= 32; i++ {
		full = append(full, mono(int64(i), i, ""))
	}
	if _, ok := SuggestNumber(m32, PoolChannel, "mono", "", full); ok {
		t.Error("a full pool has no suggestion")
	}
	if n, ok := SuggestNumber(m32, PoolAux, "mono", "", full); !ok || n != 1 {
		t.Errorf("aux is its own pool: %d", n)
	}
	if got := FullRefusal("FOH", m32, PoolChannel, full).Message; got != "FOH · M32's 32 channels are taken. Free a channel, or move one to the aux section from its editor." {
		t.Errorf("full: %q", got)
	}
}
