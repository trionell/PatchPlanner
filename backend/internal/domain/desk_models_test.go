package domain

import "testing"

func TestDeskModelsAreWellFormed(t *testing.T) {
	families := map[string]bool{"Behringer X32": true, "Midas M32": true, "Waves LV1 · software": true, "Waves LV1 Classic": true, "Generic": true}
	seen := map[string]bool{}
	for _, m := range DeskModels {
		if seen[m.Key] {
			t.Errorf("duplicate key %q", m.Key)
		}
		seen[m.Key] = true
		if !families[m.Family] {
			t.Errorf("%s: unknown family %q", m.Key, m.Family)
		}
	}
	if len(DeskModels) != 17 {
		t.Errorf("want 17 models, got %d", len(DeskModels))
	}
}

// The profile table in specs/console-desk-model, row by row.
func TestDeskModelProfiles(t *testing.T) {
	cases := []struct {
		key                                     string
		strips, aux, localIn, localOut, dca, mu int
		stereo                                  string
	}{
		{"m32l", 32, 8, 32, 16, 8, 6, StereoLinked},
		{"m32r", 32, 8, 16, 8, 8, 6, StereoLinked},
		{"x32c", 32, 8, 16, 8, 8, 6, StereoLinked},
		{"m32c", 32, 8, 0, 0, 8, 6, StereoLinked},
		{"lv1_16", 16, 0, 0, 0, 16, 8, StereoStrip},
		{"lv1_64", 64, 0, 0, 0, 16, 8, StereoStrip},
		{"lv1c_80", 80, 0, 18, 16, 16, 8, StereoStrip},
	}
	for _, c := range cases {
		m, ok := LookupDeskModel(c.key)
		if !ok {
			t.Fatalf("%s missing", c.key)
		}
		if m.Strips != c.strips || m.AuxIn != c.aux || m.LocalIn != c.localIn || m.LocalOut != c.localOut || m.DCA != c.dca || m.Mute != c.mu || m.Stereo != c.stereo {
			t.Errorf("%s: got %+v", c.key, m)
		}
	}
	lv116, _ := LookupDeskModel("lv1_16")
	if lv116.Groups != 0 || lv116.Mon != 0 || lv116.Mains != "L/R" {
		t.Errorf("LV1 16 pools: %+v", lv116)
	}
}

func TestBusModes(t *testing.T) {
	m, _ := LookupDeskModel("lv1_80")
	if got := m.DefaultBusMode("monitor"); got != BusModeMonitors {
		t.Errorf("monitor desk: %q", got)
	}
	if got := m.DefaultBusMode("foh"); got != BusModeGroups {
		t.Errorf("foh desk: %q", got)
	}
	mon := m.WithBusMode(BusModeMonitors)
	if mon.Groups != 8 || mon.Mon != 24 {
		t.Errorf("monitors mode: %d groups, %d mon", mon.Groups, mon.Mon)
	}
	m64, _ := LookupDeskModel("lv1_64")
	if m64.DefaultBusMode("monitor") != "" {
		t.Error("LV1 64 has no bus mode")
	}
}
