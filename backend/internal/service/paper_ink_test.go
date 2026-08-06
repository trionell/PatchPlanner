package service

import "testing"

// The four colours below are the real layers of the developer's "Kyrkan" plot.
// They are the cases the rule was designed against, so they are the cases it is
// held to: a default grey nobody chose, a dark grey somebody did, and two
// saturated hues from the GNOME palette.
func TestPaperInkCrossesRealLayerColours(t *testing.T) {
	cases := []struct {
		name  string
		color string
		want  string
	}{
		{"unset layer prints as ink", "", paperInk},
		{"canvas default grey darkens", "#a1a1aa", "#757582"},
		{"a dark near-grey is left alone", "#5e5c64", "#5e5c64"},
		{"a saturated blue keeps its hue", "#62a0ea", "#1e75de"},
		{"a saturated orange keeps its hue", "#ffa348", "#ba5d00"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := PaperInk(tc.color); got != tc.want {
				t.Errorf("PaperInk(%q) = %q, want %q", tc.color, got, tc.want)
			}
		})
	}
}

// The point of the whole exercise: whatever comes back is legible on paper.
func TestPaperInkAlwaysClearsTheContrastFloor(t *testing.T) {
	colors := []string{
		"", "#a1a1aa", "#5e5c64", "#62a0ea", "#ffa348",
		"#ffffff", "#fffb00", "#00ff00", "#ff00ff", "#e0e0e0", "#000000", "#010203",
	}
	for _, color := range colors {
		ink := PaperInk(color)
		red, green, blue, ok := parseHexColor(ink)
		if !ok {
			t.Fatalf("PaperInk(%q) returned unparseable %q", color, ink)
		}
		if got := contrastWithWhite(red, green, blue); got < paperContrastFloor {
			t.Errorf("PaperInk(%q) = %q at %.2f:1, below the %.1f:1 floor", color, ink, got, paperContrastFloor)
		}
	}
}

// Hue and saturation are the planner's choice and must survive the crossing;
// only lightness is the dark ground's doing.
func TestPaperInkPreservesHueAndSaturation(t *testing.T) {
	for _, color := range []string{"#62a0ea", "#ffa348", "#fffb00", "#00ff00"} {
		red, green, blue, _ := parseHexColor(color)
		wantHue, wantSaturation, _ := rgbToHSL(red, green, blue)

		red, green, blue, _ = parseHexColor(PaperInk(color))
		gotHue, gotSaturation, _ := rgbToHSL(red, green, blue)

		if diff := gotHue - wantHue; diff > 0.01 || diff < -0.01 {
			t.Errorf("%s: hue moved from %.3f to %.3f", color, wantHue, gotHue)
		}
		if diff := gotSaturation - wantSaturation; diff > 0.02 || diff < -0.02 {
			t.Errorf("%s: saturation moved from %.3f to %.3f", color, wantSaturation, gotSaturation)
		}
	}
}

// The clamp is downward only. A colour that already reads must come back
// untouched — this is the case that inverting the lightness would have broken.
func TestPaperInkNeverLightensAColour(t *testing.T) {
	for _, color := range []string{"#5e5c64", "#000000", "#1a1a2e", "#004400"} {
		red, green, blue, _ := parseHexColor(color)
		_, _, before := rgbToHSL(red, green, blue)

		red, green, blue, _ = parseHexColor(PaperInk(color))
		_, _, after := rgbToHSL(red, green, blue)

		if after > before+0.001 {
			t.Errorf("%s: lightness rose from %.3f to %.3f", color, before, after)
		}
	}
}

// A very dark colour stops at the lightness floor rather than being driven all
// the way to the frame's ink, so a coloured line stays a coloured line.
func TestPaperInkStopsAtTheLightnessFloor(t *testing.T) {
	// Already past the floor and already legible, so it is returned as stored.
	if got := PaperInk("#000080"); got != "#000080" {
		t.Errorf("PaperInk(#000080) = %q, want it untouched", got)
	}
	// A colour that needs darkening never lands below the floor's lightness.
	red, green, blue, _ := parseHexColor(PaperInk("#8080ff"))
	if _, _, lightness := rgbToHSL(red, green, blue); lightness < paperLightnessFloor-0.001 {
		t.Errorf("crossed below the lightness floor: %.3f", lightness)
	}
}

// An unset layer must not collide with a layer whose colour genuinely is a
// grey, which is the whole reason it prints as ink instead of as the canvas
// default.
func TestUnsetLayerIsDistinctFromAGreyLayer(t *testing.T) {
	if PaperInk("") == PaperInk("#5e5c64") {
		t.Error("an unset layer and a grey layer print in the same ink")
	}
}

func TestPaperInkIgnoresMalformedValues(t *testing.T) {
	for _, color := range []string{"", "  ", "#12345", "#gggggg", "rgb(1,2,3)", "zinc-400"} {
		if got := PaperInk(color); got != paperInk {
			t.Errorf("PaperInk(%q) = %q, want the document ink", color, got)
		}
	}
}
