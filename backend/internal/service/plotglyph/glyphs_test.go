package plotglyph

import (
	"encoding/json"
	"math"
	"os"
	"testing"
)

// The canvas and the page draw the same seventeen icons, so they read the same
// file. This is what stops a glyph edited for the screen from quietly ceasing
// to match the print: `go test ./...` is a merge gate, and `make sync-glyphs`
// is the fix.
func TestGlyphsMirrorTheFrontendCopy(t *testing.T) {
	const canonical = "../../../../frontend/src/lib/stagePlotGlyphs.json"
	want, err := os.ReadFile(canonical)
	if err != nil {
		t.Fatalf("reading the canonical glyph file: %v", err)
	}
	if string(want) != string(glyphsJSON) {
		t.Errorf("glyphs.json has drifted from %s — run `make sync-glyphs`", canonical)
	}
}

func TestEveryGlyphDrawsThroughTheSupportedSubset(t *testing.T) {
	if len(Icons()) == 0 {
		t.Fatal("no icons loaded")
	}
	views := []View{Top, Front, Side}
	glyphs := 0
	for _, icon := range Icons() {
		if icon.ID == "" || icon.Label == "" || icon.Group == "" {
			t.Errorf("icon %+v is missing identity", icon)
		}
		if icon.Defaults.WidthCm <= 0 || icon.Defaults.DepthCm <= 0 || icon.Defaults.HeightCm <= 0 {
			t.Errorf("%s: defaults must be positive, got %+v", icon.ID, icon.Defaults)
		}
		for _, view := range views {
			marks, ok := icon.Glyphs[view]
			if !ok {
				continue // falls back to the top-down glyph, as on the canvas
			}
			glyphs++
			for i, mark := range marks {
				if _, err := flatten(mark); err != nil {
					t.Errorf("%s/%s mark %d: %v", icon.ID, view, i, err)
				}
			}
			width, height := Box(icon.ID, view)
			if width <= 0 || height <= 0 {
				t.Errorf("%s/%s: box is %v x %v", icon.ID, view, width, height)
			}
		}
	}
	if glyphs != 51 {
		t.Errorf("expected 51 glyphs across 17 icons, found %d", glyphs)
	}
	for i, mark := range loaded.Placeholder.Marks {
		if _, err := flatten(mark); err != nil {
			t.Errorf("placeholder mark %d: %v", i, err)
		}
	}
}

func TestUnknownIconFallsBackToThePlaceholder(t *testing.T) {
	marks := Marks("no-such-icon", Top)
	if len(marks) != len(loaded.Placeholder.Marks) {
		t.Fatalf("expected the placeholder, got %d marks", len(marks))
	}
	width, height := Box("no-such-icon", Side)
	if width != loaded.Placeholder.Box[0] || height != loaded.Placeholder.Box[1] {
		t.Errorf("unknown icon box = %v x %v, want the placeholder's", width, height)
	}
}

// A view an icon does not draw falls back to the top-down glyph, which is the
// ladder the canvas walks. Neither renderer may show something the other will not.
func TestViewFallbackMatchesTheCanvas(t *testing.T) {
	for _, icon := range Icons() {
		for _, view := range []View{Top, Front, Side} {
			marks := Marks(icon.ID, view)
			if len(marks) == 0 {
				t.Errorf("%s/%s resolved to nothing", icon.ID, view)
			}
			if _, drawn := icon.Glyphs[view]; !drawn {
				if len(marks) != len(icon.Glyphs[Top]) {
					t.Errorf("%s/%s did not fall back to the top-down glyph", icon.ID, view)
				}
			}
		}
	}
}

// recorder is a Painter that keeps the points it was given, so a drawn glyph
// can be measured without producing a PDF.
type recorder struct {
	points     []point
	lineWidths []float64
	styles     []string
	dashes     int
}

func (r *recorder) MoveTo(x, y float64) { r.points = append(r.points, point{x, y}) }
func (r *recorder) LineTo(x, y float64) { r.points = append(r.points, point{x, y}) }
func (r *recorder) CurveBezierCubicTo(cx0, cy0, cx1, cy1, x, y float64) {
	r.points = append(r.points, point{cx0, cy0}, point{cx1, cy1}, point{x, y})
}
func (r *recorder) ClosePath()             {}
func (r *recorder) DrawPath(style string)  { r.styles = append(r.styles, style) }
func (r *recorder) SetLineWidth(w float64) { r.lineWidths = append(r.lineWidths, w) }
func (r *recorder) SetDashPattern(d []float64, p float64) {
	if len(d) > 0 {
		r.dashes++
	}
}

func (r *recorder) bounds() (minX, minY, maxX, maxY float64) {
	minX, minY = math.Inf(1), math.Inf(1)
	maxX, maxY = math.Inf(-1), math.Inf(-1)
	for _, p := range r.points {
		minX, maxX = math.Min(minX, p.X), math.Max(maxX, p.X)
		minY, maxY = math.Min(minY, p.Y), math.Max(maxY, p.Y)
	}
	return
}

// A glyph stretched into an element's footprint must land on that footprint,
// each axis scaled by its own factor and nothing pushed outside.
//
// The expected edges are derived from where the glyph sits in its own
// coordinate box rather than written down here. Written down, the assertion
// is about one drawing of a loudspeaker and fails the next time the icon is
// redrawn; derived, it is about the projection, which is what the test is for.
func TestAStretchedGlyphLandsOnItsFootprint(t *testing.T) {
	boxW, boxH := Box("speaker", Top)
	marks := Marks("speaker", Top)

	unit := &recorder{}
	if err := Draw(unit, marks, Transform{ScaleX: 1, ScaleY: 1}, 0.3); err != nil {
		t.Fatalf("Draw: %v", err)
	}
	gMinX, gMinY, gMaxX, gMaxY := unit.bounds()
	if gMinX < 0 || gMinY < 0 || gMaxX > boxW || gMaxY > boxH {
		t.Errorf("glyph reaches [%.2f %.2f]-[%.2f %.2f], outside its %gx%g box",
			gMinX, gMinY, gMaxX, gMaxY, boxW, boxH)
	}

	// A hard non-uniform stretch: 90 x 12 mm at (10, 20).
	const w, h, ox, oy = 90.0, 12.0, 10.0, 20.0
	sx, sy := w/boxW, h/boxH
	rec := &recorder{}
	if err := Draw(rec, marks, Transform{ScaleX: sx, ScaleY: sy, OriginX: ox, OriginY: oy}, 0.3); err != nil {
		t.Fatalf("Draw: %v", err)
	}
	minX, minY, maxX, maxY := rec.bounds()
	for _, c := range []struct {
		name      string
		got, want float64
	}{
		{"left", minX, ox + gMinX*sx},
		{"right", maxX, ox + gMaxX*sx},
		{"top", minY, oy + gMinY*sy},
		{"bottom", maxY, oy + gMaxY*sy},
	} {
		if math.Abs(c.got-c.want) > 0.01 {
			t.Errorf("%s edge = %.3f, want %.3f", c.name, c.got, c.want)
		}
	}

	// The whole point of flattening: one pen width, whatever the stretch.
	for _, width := range rec.lineWidths {
		if width != 0.3 {
			t.Errorf("line width = %v, want a constant 0.3 mm", width)
		}
	}
}

// Fill and stroke reach the page as different operations. Asserted on marks
// built here rather than on a glyph's mark count, so that redrawing an icon
// cannot fail a test about how paint is applied.
func TestFilledMarksArePaintedNotStroked(t *testing.T) {
	rec := &recorder{}
	marks := []Mark{
		{Kind: "rect", X: 0, Y: 0, W: 10, H: 10, Fill: true},
		{Kind: "path", D: "M0 0 L10 10", Fill: false},
		{Kind: "circle", Cx: 5, Cy: 5, R: 3, Fill: true},
	}
	if err := Draw(rec, marks, Transform{ScaleX: 1, ScaleY: 1}, 0.3); err != nil {
		t.Fatalf("Draw: %v", err)
	}
	want := []string{"F", "D", "F"}
	if len(rec.styles) != len(want) {
		t.Fatalf("drew %d marks, want %d", len(rec.styles), len(want))
	}
	for i, style := range rec.styles {
		if style != want[i] {
			t.Errorf("mark %d drawn with %q, want %q", i, style, want[i])
		}
	}
}

func TestPlaceholderDashIsRestoredAfterDrawing(t *testing.T) {
	rec := &recorder{}
	if err := Draw(rec, Marks("no-such-icon", Top), Transform{ScaleX: 1, ScaleY: 1}, 0.3); err != nil {
		t.Fatalf("Draw: %v", err)
	}
	if rec.dashes != 1 {
		t.Errorf("expected the placeholder's dashed box to set a dash pattern once, got %d", rec.dashes)
	}
}

// A mark the renderer cannot draw is an error, never a silently missing shape.
func TestUnsupportedInputIsAnErrorNotASilentGap(t *testing.T) {
	cases := []struct {
		name string
		mark Mark
	}{
		{"unknown kind", Mark{Kind: "polygon"}},
		{"relative command", Mark{Kind: "path", D: "M0 0 l10 10"}},
		{"quadratic curve", Mark{Kind: "path", D: "M0 0 Q5 5 10 0"}},
		{"truncated line", Mark{Kind: "path", D: "M0 0 L5"}},
		{"empty path", Mark{Kind: "path", D: ""}},
		{"line before move", Mark{Kind: "path", D: "L5 5"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := flatten(tc.mark); err == nil {
				t.Error("expected an error")
			}
		})
	}
}

// The two arcs in the glyph file are the fixture's lens. An arc has to land on
// its stated end point, or a fixture is drawn subtly wrong on every plot.
func TestArcsLandOnTheirEndpoint(t *testing.T) {
	paths, err := parsePath("M7 22 A11 5 0 0 1 23 22")
	if err != nil {
		t.Fatalf("parsePath: %v", err)
	}
	if len(paths) != 1 {
		t.Fatalf("expected one subpath, got %d", len(paths))
	}
	last := paths[0].segments[len(paths[0].segments)-1].to
	if math.Abs(last.X-23) > 0.001 || math.Abs(last.Y-22) > 0.001 {
		t.Errorf("arc ended at (%.3f, %.3f), want (23, 22)", last.X, last.Y)
	}
	// A half turn is two quarter-turn cubics, not one crude approximation.
	if len(paths[0].segments) < 2 {
		t.Errorf("a half-ellipse became %d segment(s)", len(paths[0].segments))
	}
}

func TestPathParsingHandlesTheFileVerbatim(t *testing.T) {
	// Every path in the shipped file, parsed. A regression here means a shape
	// stopped drawing.
	var raw registry
	if err := json.Unmarshal(glyphsJSON, &raw); err != nil {
		t.Fatal(err)
	}
	paths := 0
	for _, icon := range raw.Icons {
		for view, marks := range icon.Glyphs {
			for _, mark := range marks {
				if mark.Kind != "path" {
					continue
				}
				paths++
				if _, err := parsePath(mark.D); err != nil {
					t.Errorf("%s/%s: %v", icon.ID, view, err)
				}
			}
		}
	}
	// A count, not a fixed one: pinning the exact number made redrawing an
	// icon fail a test about parsing. What this guards is that the file still
	// holds a set of drawings and that every one of them parses.
	if paths < 40 {
		t.Errorf("parsed only %d paths across the registry; the file has lost its drawings", paths)
	}
}
