package service

import "testing"

// The downloaded showfile's name is English letters only: M32-Edit silently
// loaded nothing from "Countryhack Höst 2026-M32R.scn".
func TestFileSafeIsASCII(t *testing.T) {
	for in, want := range map[string]string{
		"Countryhack Höst 2026":   "Countryhack Host 2026",
		"Jonas & Emelies bröllop": "Jonas & Emelies brollop",
		"FOH/Mon: A":              "FOH-Mon- A",
		"  ":                      "desk",
	} {
		if got := fileSafe(in); got != want {
			t.Errorf("fileSafe(%q) = %q, want %q", in, got, want)
		}
	}
}
