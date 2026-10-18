package consolefile

import (
	"strings"
	"testing"
)

func TestASCII(t *testing.T) {
	for in, want := range map[string]string{
		"Countryhack Höst 2026": "Countryhack Host 2026",
		"Sång Åsa Ärlig":        "Sang Asa Arlig",
		"Crème brûlée":          "Creme brulee",
		"Straße Ørsted Æble":    "Strasse Orsted AEble",
		"Kick 🥁":                "Kick _",
		"plain":                 "plain",
	} {
		if got := ASCII(in); got != want {
			t.Errorf("ASCII(%q) = %q, want %q", in, got, want)
		}
	}
}

// Every byte of the written scene is ASCII, names and header included: M32-Edit
// loads nothing from a scene with a Swedish letter in it.
func TestX32WritesOnlyASCII(t *testing.T) {
	show := x32Fixture()
	show.EventName = "Höstfest på ängen"
	show.Strips[0].Name = "Sång"
	sc, notices := written(t, show)
	out := strings.Join(sc.lines, "\n")
	for i, r := range out {
		if r > 0x7e {
			t.Fatalf("non-ASCII %q at byte %d", r, i)
		}
	}
	if got := sc.field("/ch/01/config", 1); got != `"Sang"` {
		t.Errorf("ch 1 name %s, want \"Sang\"", got)
	}
	if !strings.HasPrefix(sc.lines[0], `#4.0# "Hostfest pa "`) {
		t.Errorf("header %q", sc.lines[0])
	}
	var found bool
	for _, n := range notices {
		found = found || n.Word == Changed && strings.Contains(n.Text, "respelled") && n.Items[0] == "Sång → Sang"
	}
	if !found {
		t.Errorf("no respelled line: %+v", notices)
	}
}
