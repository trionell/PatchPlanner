package service

import (
	"math"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// These are frontend/src/lib/stagePlot.test.ts's measurement assertions,
// ported — the same inputs and the same expected numbers. A distance stated on
// paper that differs from the one stated on the canvas is the failure this
// file exists to catch.

func wantPoint(t *testing.T, label string, got PlaneVec, wantU, wantV float64) {
	t.Helper()
	if math.Abs(got.U-wantU) > 0.005 || math.Abs(got.V-wantV) > 0.005 {
		t.Errorf("%s = {%v %v}, want {%v %v}", label, got.U, got.V, wantU, wantV)
	}
}

func TestAnchorFeatureRoundTrip(t *testing.T) {
	features := []AnchorFeature{
		{Kind: "centre"},
		{Kind: "corner", Signs: [3]int{1, -1, 1}},
		{Kind: "corner", Signs: [3]int{-1, -1, -1}},
		{Kind: "face", Axis: 0, Sign: 1},
		{Kind: "face", Axis: 2, Sign: -1},
	}
	for _, feature := range features {
		back, err := ParseAnchorFeature(FormatAnchorFeature(feature))
		if err != nil {
			t.Fatalf("ParseAnchorFeature(%q) errored: %v", FormatAnchorFeature(feature), err)
		}
		if back != feature {
			t.Errorf("round trip of %+v gave %+v", feature, back)
		}
	}
	if got := FormatAnchorFeature(AnchorFeature{Kind: "corner", Signs: [3]int{1, -1, 1}}); got != "corner:+-+" {
		t.Errorf("corner encoding = %q, want corner:+-+", got)
	}
	if got := FormatAnchorFeature(AnchorFeature{Kind: "face", Axis: 0, Sign: 1}); got != "face:+x" {
		t.Errorf("face encoding = %q, want face:+x", got)
	}
	for _, bad := range []string{"corner:++", "face:+w", ""} {
		if _, err := ParseAnchorFeature(bad); err == nil {
			t.Errorf("ParseAnchorFeature(%q) accepted it", bad)
		}
	}
}

func TestAnchorPoint(t *testing.T) {
	element := plotElement(func(e *domain.StagePlotElement) {
		e.XCm, e.YCm, e.ZCm = 100, 200, 0
		e.WidthCm, e.DepthCm, e.HeightCm = 40, 30, 60
	})

	wantPoint(t, "centre", AnchorPoint(element, ViewTop, AnchorFeature{Kind: "centre"}), 100, 200)
	wantPoint(t, "corner +++", AnchorPoint(element, ViewTop, AnchorFeature{Kind: "corner", Signs: [3]int{1, 1, 1}}), 120, 215)
	wantPoint(t, "corner ---", AnchorPoint(element, ViewTop, AnchorFeature{Kind: "corner", Signs: [3]int{-1, -1, -1}}), 80, 185)
	wantPoint(t, "face +x", AnchorPoint(element, ViewTop, AnchorFeature{Kind: "face", Axis: 0, Sign: 1}), 120, 200)
	wantPoint(t, "face -y", AnchorPoint(element, ViewTop, AnchorFeature{Kind: "face", Axis: 1, Sign: -1}), 100, 185)

	// Front view: v grows upward, so the top face is at the element's height.
	wantPoint(t, "face +z front", AnchorPoint(element, ViewFront, AnchorFeature{Kind: "face", Axis: 2, Sign: 1}), 100, 60)
	wantPoint(t, "face -z front", AnchorPoint(element, ViewFront, AnchorFeature{Kind: "face", Axis: 2, Sign: -1}), 100, 0)

	turned := element
	turned.RotationDeg = 90
	wantPoint(t, "face +x yawed 90", AnchorPoint(turned, ViewTop, AnchorFeature{Kind: "face", Axis: 0, Sign: 1}), 100, 220)
}

func TestProjectFaceLine(t *testing.T) {
	element := plotElement(func(e *domain.StagePlotElement) {
		e.XCm, e.YCm, e.ZCm = 0, 0, 0
		e.WidthCm, e.DepthCm, e.HeightCm = 40, 30, 20
	})

	// In the top view the top and bottom faces project onto the whole
	// silhouette; they are not sides and are not offered.
	if _, ok := ProjectFaceLine(element, ViewTop, AnchorFeature{Kind: "face", Axis: 2, Sign: 1}); ok {
		t.Error("top face was offered as a side in the top view")
	}
	if _, ok := ProjectFaceLine(element, ViewTop, AnchorFeature{Kind: "face", Axis: 2, Sign: -1}); ok {
		t.Error("bottom face was offered as a side in the top view")
	}

	line, ok := ProjectFaceLine(element, ViewTop, AnchorFeature{Kind: "face", Axis: 0, Sign: 1})
	if !ok {
		t.Fatal("the +x face is edge-on in the top view and was not offered")
	}
	wantPoint(t, "face line point", line.Point, 20, 0)
	wantPoint(t, "face line normal", line.Normal, 1, 0)
	closeTo(t, "face line dir u", math.Abs(line.Dir.U), 0, 1e-6)
	closeTo(t, "face line dir v", math.Abs(line.Dir.V), 1, 1e-6)
	closeTo(t, "drawn extent", math.Hypot(line.Segment[1].U-line.Segment[0].U, line.Segment[1].V-line.Segment[0].V), 30, 1e-6)

	// The length assertion above is the same wherever the side is put, so an
	// offset segment passed it. These assert its POSITION, on an element
	// standing away from the origin — where the error grew with the distance.
	placed := plotElement(func(e *domain.StagePlotElement) {
		e.XCm, e.YCm, e.ZCm = 800, 500, 0
		e.WidthCm, e.DepthCm, e.HeightCm = 400, 200, 100
	})
	placedLine, ok := ProjectFaceLine(placed, ViewTop, AnchorFeature{Kind: "face", Axis: 0, Sign: 1})
	if !ok {
		t.Fatal("the placed element's +x face was not offered")
	}
	low, high := placedLine.Segment[0], placedLine.Segment[1]
	if low.V > high.V {
		low, high = high, low
	}
	wantPoint(t, "placed side start", low, 1000, 400)
	wantPoint(t, "placed side end", high, 1000, 600)
	wantPoint(t, "placed side midpoint", PlaneVec{U: (low.U + high.U) / 2, V: (low.V + high.V) / 2}, placedLine.Point.U, placedLine.Point.V)

	turned := element
	turned.RotationDeg = 90
	turnedLine, ok := ProjectFaceLine(turned, ViewTop, AnchorFeature{Kind: "face", Axis: 0, Sign: 1})
	if !ok {
		t.Fatal("the yawed +x face was not offered")
	}
	closeTo(t, "yawed normal u", turnedLine.Normal.U, 0, 1e-6)
	closeTo(t, "yawed normal v", turnedLine.Normal.V, 1, 1e-6)
}

func countOffered(offered []OfferedAnchor, kind string) int {
	count := 0
	for _, o := range offered {
		if o.Feature.Kind == kind {
			count++
		}
	}
	return count
}

func TestOfferedAnchors(t *testing.T) {
	rect := plotElement(func(e *domain.StagePlotElement) {
		e.Kind, e.ShapeKind, e.Icon = "shape", "rect", ""
		e.WidthCm, e.DepthCm, e.HeightCm = 40, 30, 20
	})
	offered := OfferedAnchors(rect, ViewTop)
	if got := countOffered(offered, "centre"); got != 1 {
		t.Errorf("centres offered = %d, want 1", got)
	}
	// Eight box corners project onto four drawn corners; the duplicates are
	// one corner, not two.
	if got := countOffered(offered, "corner"); got != 4 {
		t.Errorf("corners offered = %d, want 4", got)
	}
	if got := countOffered(offered, "face"); got != 4 {
		t.Errorf("faces offered = %d, want 4", got)
	}

	// Yaw and tilt together make the silhouette a hexagon. It is the
	// ELEVATIONS that show it: in the top view the length and height axes both
	// project onto the yaw direction, so a plan silhouette is always a
	// parallelogram however the element is raked.
	raked := plotElement(func(e *domain.StagePlotElement) {
		e.Kind, e.ShapeKind, e.Icon = "shape", "rect", ""
		e.WidthCm, e.DepthCm, e.HeightCm = 200, 40, 30
		e.RotationDeg, e.TiltDeg = 30, 25
	})
	if got := len(ProjectedOutline(raked, ViewTop)); got != 4 {
		t.Errorf("raked top outline = %d points, want 4", got)
	}
	if got := countOffered(OfferedAnchors(raked, ViewTop), "corner"); got != 4 {
		t.Errorf("raked top corners = %d, want 4", got)
	}
	if got := len(ProjectedOutline(raked, ViewFront)); got != 6 {
		t.Errorf("raked front outline = %d points, want 6", got)
	}
	if got := countOffered(OfferedAnchors(raked, ViewFront), "corner"); got != 6 {
		t.Errorf("raked front corners = %d, want 6", got)
	}

	ellipse := plotElement(func(e *domain.StagePlotElement) {
		e.Kind, e.ShapeKind, e.Icon = "shape", "ellipse", ""
		e.WidthCm, e.DepthCm, e.HeightCm = 40, 30, 20
	})
	ellipseOffered := OfferedAnchors(ellipse, ViewTop)
	if got := countOffered(ellipseOffered, "face"); got != 4 {
		t.Errorf("ellipse quadrant points = %d, want 4", got)
	}
	for _, o := range ellipseOffered {
		if o.Feature.Kind == "face" && o.AllowSlide {
			t.Error("an ellipse offered a sliding plane anchor")
		}
	}
	if AllowsPlaneAnchor(ellipse) {
		t.Error("AllowsPlaneAnchor said yes to an ellipse")
	}
	for _, o := range OfferedAnchors(rect, ViewTop) {
		if o.Feature.Kind == "face" && !o.AllowSlide {
			t.Error("a rectangle's face refused to slide")
		}
	}
}

func pointEnd(u, v float64) MeasurementEnd {
	return MeasurementEnd{Point: PlaneVec{U: u, V: v}}
}

func TestComputeMeasurementSpan(t *testing.T) {
	span, ok := ComputeMeasurementSpan(pointEnd(0, 0), pointEnd(300, 400), "aligned")
	if !ok || span.Value != 500 {
		t.Errorf("aligned 3-4-5 = %v (ok=%v), want 500", span.Value, ok)
	}
	if span, _ := ComputeMeasurementSpan(pointEnd(0, 0), pointEnd(300, 400), "horizontal"); span.Value != 300 {
		t.Errorf("horizontal = %v, want 300", span.Value)
	}
	if span, _ := ComputeMeasurementSpan(pointEnd(0, 0), pointEnd(300, 400), "vertical"); span.Value != 400 {
		t.Errorf("vertical = %v, want 400", span.Value)
	}
	if _, ok := ComputeMeasurementSpan(pointEnd(50, 50), pointEnd(50, 50), "aligned"); ok {
		t.Error("two coincident points stated a distance")
	}

	element := plotElement(func(e *domain.StagePlotElement) {
		e.XCm, e.YCm = 0, 0
		e.WidthCm, e.DepthCm, e.HeightCm = 40, 30, 20
	})
	line, _ := ProjectFaceLine(element, ViewTop, AnchorFeature{Kind: "face", Axis: 0, Sign: 1})
	// The face's line is u = 20; a point 100 to its right is 80 away, and the
	// foot lands well outside the drawn side — what the run-out reaches.
	perpendicular, ok := ComputeMeasurementSpan(pointEnd(100, 250), MeasurementEnd{Line: line, IsLine: true}, "aligned")
	if !ok || perpendicular.Value != 80 {
		t.Errorf("perpendicular to a face = %v (ok=%v), want 80", perpendicular.Value, ok)
	}
	wantPoint(t, "perpendicular foot", perpendicular.B, 20, 250)

	slanted := element
	slanted.RotationDeg = 30
	slantedLine, _ := ProjectFaceLine(slanted, ViewTop, AnchorFeature{Kind: "face", Axis: 0, Sign: 1})
	horizontal, ok := ComputeMeasurementSpan(pointEnd(200, 0), MeasurementEnd{Line: slantedLine, IsLine: true}, "horizontal")
	if !ok {
		t.Fatal("a horizontal measurement to a slanted face stated nothing")
	}
	// The foot is where the horizontal ray meets the line, not where the
	// perpendicular would fall.
	closeTo(t, "locked foot v", horizontal.B.V, 0, 1e-6)
	closeTo(t, "locked value", horizontal.Value, 200-horizontal.B.U, 1e-6)

	left := element
	right := plotElement(func(e *domain.StagePlotElement) {
		e.ID, e.XCm, e.YCm = 2, 500, 0
		e.WidthCm, e.DepthCm, e.HeightCm = 40, 30, 20
	})
	leftLine, _ := ProjectFaceLine(left, ViewTop, AnchorFeature{Kind: "face", Axis: 0, Sign: 1})
	rightLine, _ := ProjectFaceLine(right, ViewTop, AnchorFeature{Kind: "face", Axis: 0, Sign: -1})
	// Inner faces at u = 20 and u = 480.
	between, ok := ComputeMeasurementSpan(
		MeasurementEnd{Line: leftLine, IsLine: true},
		MeasurementEnd{Line: rightLine, IsLine: true}, "aligned")
	if !ok || between.Value != 460 {
		t.Errorf("between parallel faces = %v (ok=%v), want 460", between.Value, ok)
	}

	crossLine, _ := ProjectFaceLine(element, ViewTop, AnchorFeature{Kind: "face", Axis: 1, Sign: 1})
	if _, ok := ComputeMeasurementSpan(
		MeasurementEnd{Line: leftLine, IsLine: true},
		MeasurementEnd{Line: crossLine, IsLine: true}, "aligned"); ok {
		t.Error("two faces that are not parallel stated a distance")
	}
}

func TestComputeMeasurementDrawing(t *testing.T) {
	span, _ := ComputeMeasurementSpan(pointEnd(0, 0), pointEnd(400, 0), "aligned")

	atZero := ComputeMeasurementDrawing(span, 0)
	wantPoint(t, "no offset lineA", atZero.LineA, 0, 0)
	wantPoint(t, "no offset lineB", atZero.LineB, 400, 0)

	held := ComputeMeasurementDrawing(span, 120)
	wantPoint(t, "offset lineA", held.LineA, 0, 120)
	wantPoint(t, "offset lineB", held.LineB, 400, 120)
	if held.Value != 400 {
		t.Errorf("the offset changed the value to %v", held.Value)
	}

	flipped := ComputeMeasurementDrawing(span, -120)
	wantPoint(t, "flipped lineA", flipped.LineA, 0, -120)
	if flipped.Value != 400 {
		t.Errorf("the flip changed the value to %v", flipped.Value)
	}

	// A locked measurement sits on the end picked second; the first end's
	// extension line covers the difference.
	stepped, _ := ComputeMeasurementSpan(pointEnd(0, 0), pointEnd(400, 90), "horizontal")
	steppedDrawing := ComputeMeasurementDrawing(stepped, 0)
	if steppedDrawing.Value != 400 {
		t.Errorf("locked value = %v, want 400", steppedDrawing.Value)
	}
	wantPoint(t, "locked lineA", steppedDrawing.LineA, 0, 90)
	wantPoint(t, "locked lineB", steppedDrawing.LineB, 400, 90)
}

// TestFaceLineUnderEveryRotation is the invariant that decides whether a face
// line is right at all: the four corners of that face, projected, must all lie
// ON the line. It holds in every view and under any combination of yaw and
// rake, and it is what a direction taken from the projected normal cannot
// satisfy — orthographic projection does not preserve angles. Mirrors
// stagePlot.test.ts's "a face line under every rotation".
func TestFaceLineUnderEveryRotation(t *testing.T) {
	raked := plotElement(func(e *domain.StagePlotElement) {
		e.ID, e.Kind, e.ShapeKind, e.Icon = 7, "shape", "rect", ""
		e.XCm, e.YCm, e.ZCm = 300, 200, 150
		e.WidthCm, e.DepthCm, e.HeightCm = 600, 40, 40
		e.RotationDeg, e.TiltDeg = 35, 20
	})

	for _, view := range PlotViews {
		for _, offered := range OfferedAnchors(raked, view) {
			if offered.Feature.Kind != "face" {
				continue
			}
			line, ok := ProjectFaceLine(raked, view, offered.Feature)
			if !ok {
				continue
			}
			axis := offered.Feature.Axis
			others := make([]int, 0, 2)
			for i := 0; i < 3; i++ {
				if i != axis {
					others = append(others, i)
				}
			}
			for _, sj := range []int{-1, 1} {
				for _, sk := range []int{-1, 1} {
					signs := [3]int{1, 1, 1}
					signs[axis] = offered.Feature.Sign
					signs[others[0]] = sj
					signs[others[1]] = sk
					corner := AnchorPoint(raked, view, AnchorFeature{Kind: "corner", Signs: signs})
					off := (corner.U-line.Point.U)*line.Normal.U + (corner.V-line.Point.V)*line.Normal.V
					if math.Abs(off) > 0.05 {
						t.Errorf("%s view, face %s: its own corner sits %.3f cm off the line",
							view, FormatAnchorFeature(offered.Feature), off)
					}
				}
			}
		}
	}
}

// TestARakedElementOffersNoSidesInElevation: a truss with both yaw and rake has
// no face seen edge-on in an elevation — every one is a tilted plane, drawn as
// a parallelogram rather than a line, so there is no side to be perpendicular
// to. Offering one would invent an edge the drawing does not have.
func TestARakedElementOffersNoSidesInElevation(t *testing.T) {
	raked := plotElement(func(e *domain.StagePlotElement) {
		e.ID, e.Kind, e.ShapeKind, e.Icon = 7, "shape", "rect", ""
		e.XCm, e.YCm, e.ZCm = 300, 200, 150
		e.WidthCm, e.DepthCm, e.HeightCm = 600, 40, 40
		e.RotationDeg, e.TiltDeg = 35, 20
	})
	planes := func(view PlotView) int {
		count := 0
		for _, offered := range OfferedAnchors(raked, view) {
			if offered.Feature.Kind != "face" {
				continue
			}
			if _, ok := ProjectFaceLine(raked, view, offered.Feature); ok {
				count++
			}
		}
		return count
	}
	if planes(ViewTop) == 0 {
		t.Error("the plan should still show sides: the depth axis stays horizontal under a rake")
	}
	if got := planes(ViewFront); got != 0 {
		t.Errorf("the front view offered %d sides on a fully raked element, want 0", got)
	}
	if got := planes(ViewSide); got != 0 {
		t.Errorf("the side view offered %d sides on a fully raked element, want 0", got)
	}

	// The point anchors are unaffected in every view.
	for _, view := range PlotViews {
		if countOffered(OfferedAnchors(raked, view), "centre") != 1 {
			t.Errorf("%s view lost the centre anchor", view)
		}
		if countOffered(OfferedAnchors(raked, view), "corner") == 0 {
			t.Errorf("%s view lost its corner anchors", view)
		}
	}
}
