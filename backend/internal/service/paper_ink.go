package service

import "math"

// Crossing a colour from the dark canvas onto white paper.
//
// This is a rule about the design language, not about any one document, which
// is why it lives on its own: design/patterns.md §8 states it, and the stage
// plot is simply its first caller.
//
// The application's canvas is near-black, so every colour a planner picks is
// picked against black. Those values wash out on paper — the developer's own
// plot measures 2.56:1, 2.71:1 and 1.98:1 against white. What survives the
// crossing is the planner's *choice*: the hue and how saturated it is. What
// does not survive is the lightness, because the lightness was a consequence
// of the ground.
//
// So the crossing lowers lightness and nothing else, and stops the moment the
// ink is legible.
//
// It is deliberately NOT an inversion. Inverting a near-grey's lightness was
// the mechanism this slice was asked for, and real data killed it: layer
// "Venue" is #5e5c64 — 4% saturation, L 37.6% — and already reads on paper at
// 6.58:1. Inverted it becomes #9d9ba3 at 2.74:1, so the rule would have
// degraded the one layer that needed no help. A downward clamp does what the
// inversion was reaching for at the light end and correctly does nothing at
// the dark end.

const (
	// The floor a coloured line must clear against white paper. Stated in
	// design/patterns.md §8; kept in sync with it by hand, as design values are.
	paperContrastFloor = 4.5
	// Below this lightness a colour stops being a colour and becomes the
	// frame's ink, so the crossing never goes past it even to meet the floor.
	paperLightnessFloor = 0.12
)

// paperInk is the document's own ink: what an element is drawn in when its
// layer has no colour of its own.
const paperInk = "#111111"

// PaperInk returns the ink a layer colour is drawn in on paper.
//
// An empty or unparseable colour returns the document's ink. A layer with no
// colour set is not a colour decision — the canvas draws it grey so that
// something reads on black — and paper does not honour a consequence of the
// dark ground as though it were a choice. Printing it as ink also keeps it
// distinct from a layer whose colour genuinely is a grey.
func PaperInk(color string) string {
	red, green, blue, ok := parseHexColor(color)
	if !ok {
		return paperInk
	}
	if contrastWithWhite(red, green, blue) >= paperContrastFloor {
		return formatHexColor(red, green, blue)
	}

	hue, saturation, lightness := rgbToHSL(red, green, blue)

	// The highest lightness that still clears the floor: contrast against
	// white rises monotonically as lightness falls, so a bisection finds it.
	low, high := paperLightnessFloor, lightness
	best := low
	for i := 0; i < 32; i++ {
		mid := (low + high) / 2
		r, g, b := hslToRGB(hue, saturation, mid)
		if contrastWithWhite(r, g, b) >= paperContrastFloor {
			best = mid
			low = mid
		} else {
			high = mid
		}
	}

	// Quantising to 8 bits can land a hair under the floor — 4.48:1 where 4.5
	// was intended — and a floor that is not quite met is not a floor. Keep
	// lowering lightness, which is the only thing this rule is allowed to
	// move, until the colour that actually gets written clears it.
	for lightness := best; ; lightness -= 0.002 {
		red, green, blue = hslToRGB(hue, saturation, lightness)
		if contrastWithWhite(red, green, blue) >= paperContrastFloor || lightness <= 0 {
			return formatHexColor(red, green, blue)
		}
	}
}

func formatHexColor(red, green, blue int) string {
	const digits = "0123456789abcdef"
	out := []byte{'#', 0, 0, 0, 0, 0, 0}
	for i, channel := range []int{red, green, blue} {
		out[1+i*2] = digits[(channel>>4)&0xf]
		out[2+i*2] = digits[channel&0xf]
	}
	return string(out)
}

// relativeLuminance is the WCAG definition, which is what the contrast floor
// is expressed against.
func relativeLuminance(red, green, blue int) float64 {
	channel := func(value int) float64 {
		v := float64(value) / 255
		if v <= 0.03928 {
			return v / 12.92
		}
		return math.Pow((v+0.055)/1.055, 2.4)
	}
	return 0.2126*channel(red) + 0.7152*channel(green) + 0.0722*channel(blue)
}

func contrastWithWhite(red, green, blue int) float64 {
	return 1.05 / (relativeLuminance(red, green, blue) + 0.05)
}

func rgbToHSL(red, green, blue int) (hue, saturation, lightness float64) {
	r := float64(red) / 255
	g := float64(green) / 255
	b := float64(blue) / 255
	high := math.Max(r, math.Max(g, b))
	low := math.Min(r, math.Min(g, b))
	lightness = (high + low) / 2
	span := high - low
	if span == 0 {
		return 0, 0, lightness
	}
	if lightness > 0.5 {
		saturation = span / (2 - high - low)
	} else {
		saturation = span / (high + low)
	}
	switch high {
	case r:
		hue = (g - b) / span
		if g < b {
			hue += 6
		}
	case g:
		hue = (b-r)/span + 2
	default:
		hue = (r-g)/span + 4
	}
	return hue / 6, saturation, lightness
}

func hslToRGB(hue, saturation, lightness float64) (red, green, blue int) {
	if saturation == 0 {
		v := roundChannel(lightness)
		return v, v, v
	}
	var q float64
	if lightness < 0.5 {
		q = lightness * (1 + saturation)
	} else {
		q = lightness + saturation - lightness*saturation
	}
	p := 2*lightness - q
	component := func(t float64) float64 {
		if t < 0 {
			t++
		}
		if t > 1 {
			t--
		}
		switch {
		case t < 1.0/6.0:
			return p + (q-p)*6*t
		case t < 1.0/2.0:
			return q
		case t < 2.0/3.0:
			return p + (q-p)*(2.0/3.0-t)*6
		default:
			return p
		}
	}
	return roundChannel(component(hue + 1.0/3.0)), roundChannel(component(hue)), roundChannel(component(hue - 1.0/3.0))
}

func roundChannel(value float64) int {
	return maxInt(0, minInt(255, int(math.Round(value*255))))
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
