package consolefile

import (
	"strings"
	"testing"
)

func x32Fixture() Show {
	return Show{
		EventName: "Jonas och Emelies bröllop",
		DeskName:  "M23R",
		Engine:    "x32",
		Strips: []Strip{
			{ID: 1, Number: 1, Name: "Kick", Color: "#ef4444", Input: &DeskPort{Socket: "local", Index: 0}},
			{ID: 7, Number: 7, Stereo: true, Name: "Piano", Color: "#3b82f6", Input: &DeskPort{Socket: "a", Index: 4}, InputR: &DeskPort{Socket: "a", Index: 5}, Phantom: true},
			{ID: 8, Number: 9, Name: "Gitarr Johannes"},
			{ID: 20, Aux: true, Number: 1, Name: "Laptop"},
			{ID: 40, Number: 33, Name: "Over"},
		},
		Mixes: []Mix{
			{ID: 100, Kind: "main", Slot: 1, Stereo: true, Name: "LR"},
			{ID: 101, Kind: "main", Slot: 2, Name: "M/C"},
			{ID: 110, Kind: "subgroup", Slot: 1, Name: "Drums"},
			{ID: 111, Kind: "monitor", Slot: 3, Name: "Wedge 1"},
			{ID: 120, Kind: "matrix", Slot: 1, Name: "Rec"},
			{ID: 121, Kind: "matrix", Slot: 7, Name: "Too far"},
			{ID: 130, Kind: "dca", Slot: 1, Name: "Vox"},
			{ID: 140, Kind: "mute", Slot: 1, Name: "Band"},
		},
		Routes: []Route{
			{FromStrip: 1, ToMix: 100},
			{FromStrip: 1, ToMix: 110},
			{FromStrip: 1, ToMix: 111},
			{FromMix: 110, ToMix: 100},
			{FromMix: 100, ToMix: 120},
			{FromStrip: 1, ToMix: 130},
			{FromMix: 110, ToMix: 140},
			{FromStrip: 1, ToMix: 120}, // an X32 matrix takes no channel
			{FromStrip: 7, ToMix: 111}, // Piano 7–8 → Wedge 1: both strips send
			{FromStrip: 7, ToMix: 130}, // and both are on DCA 1
		},
		Outputs: []Output{
			{ID: 1, Name: "Sub", Port: &DeskPort{Socket: "local", Index: 0}, FedByMix: 110},
			{ID: 2, Name: "Wedge 1", Port: &DeskPort{Socket: "a", Index: 10}, FedByMix: 111},
		},
		Tracks: []Track{
			{Number: 1, FromStrip: 1},
			{Number: 2, PlayStrip: 8},
		},
		RecorderTracks: 32,
	}
}

func written(t *testing.T, show Show) (*scene, []Notice) {
	t.Helper()
	out, notices := WriteX32(show)
	sc := parseScene(string(out))
	if got, want := len(sc.lines), len(parseScene(x32Template).lines); got != want {
		t.Fatalf("scene has %d lines, the template %d", got, want)
	}
	return sc, notices
}

func TestX32NamesColoursLinks(t *testing.T) {
	sc, _ := written(t, x32Fixture())
	if !strings.HasPrefix(sc.lines[0], `#4.0# "Jonas och Em"`) {
		t.Errorf("header %q", sc.lines[0])
	}
	if got := sc.field("/ch/01/config", 1); got != `"Kick"` {
		t.Errorf("ch 1 name %s", got)
	}
	if got := sc.field("/ch/01/config", 3); got != "RD" {
		t.Errorf("ch 1 colour %s", got)
	}
	if sc.field("/ch/07/config", 3) != "BL" || sc.field("/ch/08/config", 1) != `"Piano"` {
		t.Errorf("Piano pair: %s / %s", sc.field("/ch/07/config", 3), sc.field("/ch/08/config", 1))
	}
	if got := sc.field("/config/chlink", 4); got != "ON" {
		t.Errorf("chlink 7–8 = %s", got)
	}
	if got := sc.field("/ch/09/config", 1); got != `"Gitarr Johan"` {
		t.Errorf("long name %s", got)
	}
	if got := sc.field("/auxin/01/config", 1); got != `"Laptop"` {
		t.Errorf("aux 1 %s", got)
	}
	if sc.field("/bus/01/config", 1) != `"Drums"` || sc.field("/mtx/01/config", 1) != `"Rec"` || sc.field("/dca/1/config", 1) != `"Vox"` {
		t.Error("mix names not written")
	}
}

func TestX32PatchAndPreamps(t *testing.T) {
	sc, _ := written(t, x32Fixture())
	if got := sc.lines[sc.at["/config/routing/IN"]]; !strings.Contains(got, "UIN1-8 UIN9-16 UIN17-24 UIN25-32") {
		t.Errorf("routing/IN = %q", got)
	}
	userIn := strings.Fields(sc.lines[sc.at["/config/userrout/in"]])[1:]
	if userIn[0] != "1" || userIn[6] != "37" || userIn[7] != "38" {
		t.Errorf("user in 1, 7, 8 = %s %s %s; want local 1, AES50-A 5 and 6", userIn[0], userIn[6], userIn[7])
	}
	if userIn[8] != "130" {
		t.Errorf("channel 9 plays track 2 as its source: user in 9 = %s, want card 2 (130)", userIn[8])
	}
	if got := sc.field("/headamp/036", 2); got != "ON" {
		t.Errorf("A5 phantom %s", got)
	}
	if got := sc.field("/headamp/000", 2); got != "OFF" {
		t.Errorf("local 1 phantom %s", got)
	}
}

func TestX32Routes(t *testing.T) {
	sc, _ := written(t, x32Fixture())
	cases := []struct {
		path  string
		field int
		want  string
	}{
		{"/ch/01/mix", 3, "ON"},        // Kick → LR
		{"/ch/07/mix", 3, "OFF"},       // Piano is on nothing
		{"/ch/01/mix/01", 2, "+0.0"},   // Kick → Drums
		{"/ch/01/mix/03", 2, "+0.0"},   // Kick → Wedge 1
		{"/ch/01/mix/03", 4, "EQ->"},   // monitors pre-fader
		{"/ch/01/mix/01", 4, "POST"},   // subgroups post
		{"/ch/07/mix/01", 2, "-oo"},    // not a member
		{"/bus/01/mix", 3, "ON"},       // Drums → LR
		{"/bus/03/mix", 3, "OFF"},      // a monitor is off LR
		{"/main/st/mix/01", 2, "+0.0"}, // LR → Rec
		{"/ch/01/grp", 1, "%00000001"}, // Kick on DCA 1
		{"/bus/01/grp", 2, "%000001"},  // Drums in mute group 1
		{"/ch/08/mix/03", 2, "+0.0"},   // the pair's second strip sends too
		{"/ch/08/grp", 1, "%00000001"}, // and is on the DCA
	}
	for _, c := range cases {
		if got := sc.field(c.path, c.field); got != c.want {
			t.Errorf("%s field %d = %s, want %s", c.path, c.field, got, c.want)
		}
	}
}

func TestX32Outputs(t *testing.T) {
	sc, _ := written(t, x32Fixture())
	if got := sc.field("/outputs/main/01", 1); got != "4" {
		t.Errorf("local out 1 (Sub, Drums = bus 1) src %s, want 4", got)
	}
	// Wedge 1 leaves on AES50-A 11: Output 2 carries bus 3, user out slot 3 picks it.
	if got := sc.field("/outputs/main/02", 1); got != "6" {
		t.Errorf("Output 2 src %s, want bus 3 (6)", got)
	}
	if got := sc.field("/config/routing/AES50A", 2); got != "UOUT1-8" {
		t.Errorf("AES50-A 9–16 block %s, want UOUT1-8", got)
	}
	userOut := strings.Fields(sc.lines[sc.at["/config/userrout/out"]])[1:]
	if userOut[2] != "170" {
		t.Errorf("user out 3 = %s, want Output 2 (170)", userOut[2])
	}
	// Track 1 records Kick's preamp on the card: the second UOUT block.
	if got := sc.field("/config/routing/CARD", 1); got != "UOUT9-16" {
		t.Errorf("card 1–8 block %s", got)
	}
	if userOut[8] != "1" {
		t.Errorf("user out 9 = %s, want local in 1", userOut[8])
	}
}

func TestX32Notices(t *testing.T) {
	_, notices := written(t, x32Fixture())
	find := func(word, text string) *Notice {
		for i := range notices {
			if notices[i].Word == word && strings.Contains(notices[i].Text, text) {
				return &notices[i]
			}
		}
		return nil
	}
	if n := find(LeftOut, "strips past"); n == nil || n.Items[0] != "Ch 33 Over" {
		t.Errorf("over strip: %+v", notices)
	}
	if find(LeftOut, "mixes past") == nil {
		t.Errorf("over matrix: %+v", notices)
	}
	if n := find(LeftOut, "routes an X32 cannot make"); n == nil || len(n.Items) != 1 || n.Items[0] != "Kick → Rec" {
		t.Errorf("channel into a matrix: %+v", notices)
	}
	if n := find(Changed, "names cut"); n == nil || n.Items[0] != "Gitarr Johannes → Gitarr Johan" {
		t.Errorf("name cut: %+v", notices)
	}
	if find(NoInput, "no input") == nil {
		t.Errorf("no input: %+v", notices)
	}
}

func TestX32LocalOutPast16RewritesNothing(t *testing.T) {
	show := x32Fixture()
	show.Outputs = []Output{{ID: 9, Name: "Far", Port: &DeskPort{Socket: "local", Index: 19}, FedByMix: 111}}
	sc, notices := written(t, show)
	template := parseScene(x32Template)
	if sc.field("/outputs/main/01", 1) != template.field("/outputs/main/01", 1) {
		t.Error("a refused output rewrote Output 1")
	}
	var found bool
	for _, n := range notices {
		found = found || n.Word == LeftOut && strings.Contains(n.Text, "local out past 16")
	}
	if !found {
		t.Errorf("no Left out line: %+v", notices)
	}
}
