package plotglyph

import (
	"math"
	"testing"
)

// An icon is drawn in one colour, so detail inside a filled body cannot be
// drawn onto it — a mark in the same colour is invisible. Detail is absence
// instead, and a hole is a subpath of the same filled path wound the opposite
// way to whatever encloses it. Both renderers fill by the nonzero winding rule
// (SVG's default; fpdf's "F" is the PDF `f` operator), so a hole authored that
// way is a hole on the canvas and on paper alike.
//
// Nothing in the file says which way a subpath is wound — reverse one and it
// fills solid, which reads as "the detail went missing" rather than as an
// error. These two tests are what turns that into a failure: the first holds
// the rule across the whole set, the second holds one glyph that must have a
// hole to still have it.

func TestAnEnclosedSubpathIsWoundAgainstWhatEnclosesIt(t *testing.T) {
	for _, icon := range Icons() {
		for _, view := range []View{Top, Front, Side} {
			for markIndex, mark := range Marks(icon.ID, view) {
				if !mark.Fill || mark.Kind != "path" {
					continue
				}
				paths, err := flatten(mark)
				if err != nil {
					t.Fatalf("%s %s mark %d: %v", icon.ID, view, markIndex, err)
				}
				polys := make([]polygon, len(paths))
				for i, p := range paths {
					polys[i] = samplePolygon(p)
				}
				for i, inner := range polys {
					// A subpath's winding only has to disagree with the one
					// immediately around it. Two separate bodies in one mark
					// wind the same way and both fill; an island inside a hole
					// agrees with the body two levels out.
					j, ok := immediateContainer(polys, i)
					if !ok {
						continue
					}
					if sameSign(inner.area, polys[j].area) {
						t.Errorf(
							"%s %s mark %d: subpath %d sits inside subpath %d but is wound the same way, so it fills solid instead of cutting a hole",
							icon.ID, view, markIndex, i, j)
					}
				}
			}
		}
	}
}

// The invariant above is satisfied by a glyph with no holes at all, so one
// glyph is held to actually having one. An acoustic guitar has a soundhole:
// that is a fact about the instrument, not about this drawing of it, so the
// assertion survives the icon being redrawn again.
func TestTheAcousticGuitarKeepsItsSoundhole(t *testing.T) {
	holes := 0
	for _, mark := range Marks("guitar_acoustic", Front) {
		if !mark.Fill || mark.Kind != "path" {
			continue
		}
		paths, err := flatten(mark)
		if err != nil {
			t.Fatalf("flatten: %v", err)
		}
		polys := make([]polygon, len(paths))
		for i, p := range paths {
			polys[i] = samplePolygon(p)
		}
		for i := range polys {
			if _, ok := immediateContainer(polys, i); ok {
				holes++
			}
		}
	}
	if holes == 0 {
		t.Error("the acoustic guitar's front view has no enclosed subpath, so it has lost its soundhole")
	}
}

// A subpath sampled down to a polygon: enough to ask which way it winds and
// what is inside it.
type polygon struct {
	pts  []point
	area float64 // signed; the sign is the winding direction
}

// Béziers are sampled rather than solved. Containment and winding only need
// the outline's rough shape, and four points a curve is well inside the
// tolerance either question cares about.
func samplePolygon(p subpath) polygon {
	pts := []point{p.start}
	cursor := p.start
	for _, seg := range p.segments {
		if seg.curve {
			for _, t := range []float64{0.25, 0.5, 0.75, 1} {
				pts = append(pts, cubicAt(cursor, seg.c1, seg.c2, seg.to, t))
			}
		} else {
			pts = append(pts, seg.to)
		}
		cursor = seg.to
	}
	return polygon{pts: pts, area: signedArea(pts)}
}

func cubicAt(p0, c1, c2, p3 point, t float64) point {
	u := 1 - t
	a, b, c, d := u*u*u, 3*u*u*t, 3*u*t*t, t*t*t
	return point{
		X: a*p0.X + b*c1.X + c*c2.X + d*p3.X,
		Y: a*p0.Y + b*c1.Y + c*c2.Y + d*p3.Y,
	}
}

func signedArea(pts []point) float64 {
	total := 0.0
	for i := range pts {
		j := (i + 1) % len(pts)
		total += pts[i].X*pts[j].Y - pts[j].X*pts[i].Y
	}
	return total / 2
}

// The smallest polygon that contains polys[i], if any.
func immediateContainer(polys []polygon, i int) (int, bool) {
	best, found := -1, false
	for j := range polys {
		if j == i || !contains(polys[j], polys[i]) {
			continue
		}
		if !found || math.Abs(polys[j].area) < math.Abs(polys[best].area) {
			best, found = j, true
		}
	}
	return best, found
}

// Containment by the inner polygon's vertices: an outline drawn inside another
// stays inside it, and glyph subpaths never cross each other — a crossing
// would be a drawing mistake in its own right.
func contains(outer, inner polygon) bool {
	if math.Abs(inner.area) >= math.Abs(outer.area) {
		return false
	}
	for _, p := range inner.pts {
		if !pointInPolygon(p, outer.pts) {
			return false
		}
	}
	return true
}

func pointInPolygon(p point, poly []point) bool {
	inside := false
	for i := range poly {
		j := (i + 1) % len(poly)
		a, b := poly[i], poly[j]
		if (a.Y > p.Y) != (b.Y > p.Y) {
			x := a.X + (p.Y-a.Y)/(b.Y-a.Y)*(b.X-a.X)
			if p.X < x {
				inside = !inside
			}
		}
	}
	return inside
}

func sameSign(a, b float64) bool { return (a > 0) == (b > 0) }
