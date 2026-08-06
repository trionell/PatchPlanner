package service

import (
	"math"
	"reflect"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// These are frontend/src/lib/stagePlot.test.ts's own assertions, ported. The
// document and the canvas draw the same plot, so the two implementations are
// held to one set of answers — if this file and that one ever disagree, a plot
// on paper has stopped being a drawing of the plot on screen.

func plotElement(mutate func(*domain.StagePlotElement)) domain.StagePlotElement {
	element := domain.StagePlotElement{
		ID: 1, PlotID: 1, LayerID: 1, Kind: "resource", Icon: "speaker",
		WidthCm: 40, DepthCm: 30, HeightCm: 60,
	}
	if mutate != nil {
		mutate(&element)
	}
	return element
}

func closeTo(t *testing.T, label string, got, want, tolerance float64) {
	t.Helper()
	if math.Abs(got-want) > tolerance {
		t.Errorf("%s = %v, want %v (±%v)", label, got, want, tolerance)
	}
}

func TestProjectElementPerView(t *testing.T) {
	base := plotElement(func(e *domain.StagePlotElement) {
		e.XCm, e.YCm, e.ZCm = 100, 200, 50
	})

	t.Run("top view projects x/y and width/depth with rotation", func(t *testing.T) {
		rotated := base
		rotated.RotationDeg = 15
		got := ProjectElement(rotated, ViewTop)
		want := ProjectedRect{U: 100, V: 200, Width: 40, Height: 30, RotationDeg: 15}
		if got != want {
			t.Errorf("got %+v, want %+v", got, want)
		}
	})

	t.Run("front view projects x/z with the tilt as its rotation", func(t *testing.T) {
		// v is the vertical CENTRE: bottom z=50 + height 60 / 2 = 80.
		got := ProjectElement(base, ViewFront)
		want := ProjectedRect{U: 100, V: 80, Width: 40, Height: 60, RotationDeg: 0}
		if got != want {
			t.Errorf("got %+v, want %+v", got, want)
		}
		tilted := base
		tilted.TiltDeg = 20
		if got := ProjectElement(tilted, ViewFront).RotationDeg; got != 20 {
			t.Errorf("rotationDeg = %v, want 20", got)
		}
	})

	t.Run("side view projects y/z and depth/height, always axis-aligned", func(t *testing.T) {
		rotated := base
		rotated.RotationDeg = 15
		if got := ProjectElement(rotated, ViewSide).RotationDeg; got != 0 {
			t.Errorf("the side view drew a rotation of %v", got)
		}
	})
}

func TestProjectionUnderRotationAndTilt(t *testing.T) {
	bar := plotElement(func(e *domain.StagePlotElement) {
		e.ZCm, e.WidthCm, e.DepthCm, e.HeightCm = 300, 600, 30, 30
	})

	t.Run("a truss yawed 90 shows its cross-section in front and full length in side", func(t *testing.T) {
		yawed := bar
		yawed.RotationDeg = 90
		front := ProjectElement(yawed, ViewFront)
		closeTo(t, "front width", front.Width, 30, 0.01)
		closeTo(t, "front height", front.Height, 30, 0.01)
		side := ProjectElement(yawed, ViewSide)
		closeTo(t, "side width", side.Width, 600, 0.01)
		closeTo(t, "side height", side.Height, 30, 0.01)
	})

	t.Run("a partial yaw foreshortens the front view continuously", func(t *testing.T) {
		yawed := bar
		yawed.RotationDeg = 60
		// 600·cos60 + 30·sin60
		closeTo(t, "front width", ProjectElement(yawed, ViewFront).Width, 325.98, 0.1)
	})

	t.Run("a truss tilted 90 stands vertical in both elevations", func(t *testing.T) {
		tilted := bar
		tilted.TiltDeg = 90
		front := ProjectElement(tilted, ViewFront)
		closeTo(t, "front width", front.Width, 600, 0.01)
		closeTo(t, "front height", front.Height, 30, 0.01)
		if front.RotationDeg != 90 {
			t.Errorf("front rotationDeg = %v, want 90", front.RotationDeg)
		}
		side := ProjectElement(tilted, ViewSide)
		closeTo(t, "side width", side.Width, 30, 0.01)
		closeTo(t, "side height", side.Height, 600, 0.01)
		top := ProjectElement(tilted, ViewTop)
		closeTo(t, "top width", top.Width, 30, 0.01)
		closeTo(t, "top height", top.Height, 30, 0.01)
	})

	t.Run("projected axes collapse and spread fixture markers with the view", func(t *testing.T) {
		straight := ProjectAxes(bar, ViewSide)
		closeTo(t, "ax.u", straight.Ax.U, 0, 1e-9)
		closeTo(t, "ax.v", straight.Ax.V, 0, 1e-9)
		closeTo(t, "ay.u", straight.Ay.U, 1, 1e-9)
		closeTo(t, "ay.v", straight.Ay.V, 0, 1e-9)

		yawed := bar
		yawed.RotationDeg = 90
		closeTo(t, "yawed side ax.u", ProjectAxes(yawed, ViewSide).Ax.U, 1, 1e-9)
		closeTo(t, "yawed side ay.u", ProjectAxes(yawed, ViewSide).Ay.U, 0, 1e-9)
		closeTo(t, "yawed front ax.u", ProjectAxes(yawed, ViewFront).Ax.U, 0, 1e-9)
		closeTo(t, "yawed front |ay.u|", math.Abs(ProjectAxes(yawed, ViewFront).Ay.U), 1, 1e-9)
	})

	t.Run("a raked bar climbs in the side view", func(t *testing.T) {
		raked := bar
		raked.TiltDeg = 45
		closeTo(t, "ax.v", ProjectAxes(raked, ViewSide).Ax.V, math.Sqrt2/2, 1e-9)
		closeTo(t, "ay.u", ProjectAxes(raked, ViewSide).Ay.U, 1, 1e-9)
	})

	t.Run("the outline is a rectangle flat and a hexagon under combined rotations", func(t *testing.T) {
		want := []PlaneVec{{-300, -15}, {300, -15}, {300, 15}, {-300, 15}}
		got := ProjectedOutline(bar, ViewTop)
		if len(got) != len(want) {
			t.Fatalf("outline has %d corners, want %d: %+v", len(got), len(want), got)
		}
		for i := range want {
			if got[i] != want[i] {
				t.Errorf("corner %d = %+v, want %+v", i, got[i], want[i])
			}
		}
		skewed := bar
		skewed.RotationDeg, skewed.TiltDeg = 45, 45
		if got := ProjectedOutline(skewed, ViewFront); len(got) != 6 {
			t.Errorf("a combined yaw and rake gave %d corners, want 6: %+v", len(got), got)
		}
	})
}

// The truss from the developer's own plot: 6 m of bar, yawed 32° and raked 31°,
// which is the case the print sheet has always drawn as a plain rectangle.
func TestTheRealTrussProjectsAsASixSidedSilhouette(t *testing.T) {
	truss := domain.PlotTruss{ID: 1, Name: "Bakre truss", HeightCm: 600, TotalLengthCm: 600}
	trussID := int64(1)
	element := domain.StagePlotElement{
		Kind: "truss", TrussID: &trussID,
		XCm: 647.69, YCm: -297.82, DepthCm: 27.11,
		RotationDeg: 32, TiltDeg: 31,
	}
	effective := EffectiveElement(element, map[int64]domain.PlotTruss{1: truss})

	if effective.WidthCm != 600 || effective.HeightCm != 30 || effective.ZCm != 600 {
		t.Errorf("derived truss geometry = %v x %v at z %v, want 600 x 30 at 600",
			effective.WidthCm, effective.HeightCm, effective.ZCm)
	}
	if effective.Name != "Bakre truss" {
		t.Errorf("an unnamed placement should take the truss's name, got %q", effective.Name)
	}

	outline := ProjectedOutline(effective, ViewFront)
	if len(outline) != 6 {
		t.Errorf("the raked, yawed bar gave %d corners, want the 6 a rectangle cannot represent: %+v",
			len(outline), outline)
	}

	// It is drawn at its own hung height, not on the floor.
	if got := ProjectElement(effective, ViewFront).V; math.Abs(got-615) > 0.01 {
		t.Errorf("front-view centre v = %v, want 615 (600 + 30/2)", got)
	}
}

func TestScaleIsExact(t *testing.T) {
	small := plotElement(func(e *domain.StagePlotElement) { e.WidthCm, e.DepthCm, e.HeightCm = 200, 100, 50 })
	large := plotElement(func(e *domain.StagePlotElement) { e.WidthCm, e.DepthCm, e.HeightCm = 400, 200, 100 })
	for _, view := range PlotViews {
		s, l := ProjectElement(small, view), ProjectElement(large, view)
		if s.Width/l.Width != 0.5 {
			t.Errorf("%s: width ratio = %v, want exactly 0.5", view, s.Width/l.Width)
		}
		if s.Height/l.Height != 0.5 {
			t.Errorf("%s: height ratio = %v, want exactly 0.5", view, s.Height/l.Height)
		}
	}
}

func TestProjectedBounds(t *testing.T) {
	t.Run("is the plain rect at 0 degrees", func(t *testing.T) {
		element := plotElement(func(e *domain.StagePlotElement) {
			e.XCm, e.YCm, e.WidthCm, e.DepthCm = 100, 50, 40, 20
		})
		want := Bounds{MinU: 80, MaxU: 120, MinV: 40, MaxV: 60}
		if got := ProjectedBounds(element, ViewTop); got != want {
			t.Errorf("got %+v, want %+v", got, want)
		}
	})

	t.Run("swaps extents at 90 degrees", func(t *testing.T) {
		element := plotElement(func(e *domain.StagePlotElement) {
			e.WidthCm, e.DepthCm, e.RotationDeg = 40, 20, 90
		})
		bounds := ProjectedBounds(element, ViewTop)
		closeTo(t, "maxU", bounds.MaxU, 10, 1e-6)
		closeTo(t, "maxV", bounds.MaxV, 20, 1e-6)
	})

	t.Run("grows diagonally at 45 degrees", func(t *testing.T) {
		element := plotElement(func(e *domain.StagePlotElement) {
			e.WidthCm, e.DepthCm, e.RotationDeg = 100, 100, 45
		})
		closeTo(t, "span", ProjectedBounds(element, ViewTop).MaxU*2, 100*math.Sqrt2, 1e-6)
	})

	t.Run("carries plan rotation into the elevations as foreshortening", func(t *testing.T) {
		element := plotElement(func(e *domain.StagePlotElement) {
			e.WidthCm, e.DepthCm, e.HeightCm, e.RotationDeg = 40, 30, 60, 45
		})
		bounds := ProjectedBounds(element, ViewFront)
		closeTo(t, "u span", bounds.MaxU-bounds.MinU, (40+30)*math.Sqrt2/2, 0.1)
		if got := bounds.MaxV - bounds.MinV; got != 60 {
			t.Errorf("height should be untouched by yaw, got %v", got)
		}
	})
}

func TestTrussLanesAndOffsets(t *testing.T) {
	if got := TrussLaneLocalV("top", 15); got != -15 {
		t.Errorf(`lane "top" = %v, want -15 (the upstage chord)`, got)
	}
	if got := TrussLaneLocalV("bottom", 15); got != 15 {
		t.Errorf(`lane "bottom" = %v, want 15`, got)
	}
	if got := TrussLaneLocalV("middle", 15); got != 0 {
		t.Errorf(`lane "middle" = %v, want 0`, got)
	}

	if offset, clamped := ClampFixtureOffset(120, 600); offset != 120 || clamped {
		t.Errorf("an offset inside the bar = (%v, %v), want (120, false)", offset, clamped)
	}
	// A removed piece can leave a fixture hanging past the end.
	if offset, clamped := ClampFixtureOffset(800, 600); offset != 600 || !clamped {
		t.Errorf("an offset past the bar = (%v, %v), want (600, true)", offset, clamped)
	}
}

func TestEffectiveElementLeavesEverythingElseAlone(t *testing.T) {
	element := plotElement(func(e *domain.StagePlotElement) { e.Name = "Speaker L" })
	if got := EffectiveElement(element, nil); !reflect.DeepEqual(got, element) {
		t.Error("a non-truss element should pass through untouched")
	}

	trussID := int64(9)
	dangling := domain.StagePlotElement{Kind: "truss", TrussID: &trussID, WidthCm: 7}
	if got := EffectiveElement(dangling, map[int64]domain.PlotTruss{}); got.WidthCm != 7 {
		t.Error("a truss placement whose truss is missing should pass through untouched")
	}

	named := domain.StagePlotElement{Kind: "truss", TrussID: &trussID, Name: "Front bar"}
	got := EffectiveElement(named, map[int64]domain.PlotTruss{9: {Name: "Bakre truss", TotalLengthCm: 400, HeightCm: 500}})
	if got.Name != "Front bar" {
		t.Errorf("a named placement keeps its name, got %q", got.Name)
	}

	// A truss shorter than the minimum still draws at the minimum.
	short := domain.StagePlotElement{Kind: "truss", TrussID: &trussID}
	if got := EffectiveElement(short, map[int64]domain.PlotTruss{9: {TotalLengthCm: 5}}); got.WidthCm != 20 {
		t.Errorf("a 5 cm truss drew at %v, want the 20 cm floor", got.WidthCm)
	}
}
