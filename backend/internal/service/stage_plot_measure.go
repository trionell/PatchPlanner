package service

import (
	"fmt"
	"math"
	"regexp"
	"strings"

	"github.com/trionell/patchplanner/internal/domain"
)

// Measurement geometry, ported from frontend/src/lib/stagePlot.ts (Slice 42).
//
// Held to the TypeScript suite's own assertions in stage_plot_measure_test.go:
// the same inputs and the same expected numbers are asserted on both sides, so
// the canvas and the document cannot state different distances. That is what
// lets the document derive every printed value from the stored anchors instead
// of being handed one by a client.
//
// Everything works in the PROJECTED plane — the (U, V) frame ProjectElement
// returns a centre in, where V grows downstage in the top view and UP in the
// elevations. An element's own drawn frame has V pointing DOWN in every view,
// so converting out of it negates V in the elevations; viewFlip is that one
// negation, in one place.

// Below this, a face's projected normal points into the screen: the face is
// seen flat and has no straight side to measure to.
const faceEdgeOnMin = 0.05

// AnchorFeature is a feature of an element's own box — NOT a vertex of its
// drawn silhouette, whose vertex count changes with rotation. Kind is
// "centre", "corner" or "face".
type AnchorFeature struct {
	Kind  string
	Signs [3]int // corner only
	Axis  int    // face only: 0=x, 1=y, 2=z
	Sign  int    // face only
}

var axisLetters = [3]string{"x", "y", "z"}

func FormatAnchorFeature(f AnchorFeature) string {
	switch f.Kind {
	case "corner":
		var b strings.Builder
		for _, s := range f.Signs {
			if s > 0 {
				b.WriteString("+")
			} else {
				b.WriteString("-")
			}
		}
		return "corner:" + b.String()
	case "face":
		sign := "-"
		if f.Sign > 0 {
			sign = "+"
		}
		return fmt.Sprintf("face:%s%s", sign, axisLetters[f.Axis])
	default:
		return "centre"
	}
}

var (
	cornerPattern = regexp.MustCompile(`^corner:([+-])([+-])([+-])$`)
	facePattern   = regexp.MustCompile(`^face:([+-])([xyz])$`)
)

func ParseAnchorFeature(value string) (AnchorFeature, error) {
	if value == "centre" {
		return AnchorFeature{Kind: "centre"}, nil
	}
	asSign := func(s string) int {
		if s == "+" {
			return 1
		}
		return -1
	}
	if m := cornerPattern.FindStringSubmatch(value); m != nil {
		return AnchorFeature{Kind: "corner", Signs: [3]int{asSign(m[1]), asSign(m[2]), asSign(m[3])}}, nil
	}
	if m := facePattern.FindStringSubmatch(value); m != nil {
		axis := strings.Index("xyz", m[2])
		return AnchorFeature{Kind: "face", Axis: axis, Sign: asSign(m[1])}, nil
	}
	return AnchorFeature{}, fmt.Errorf("not an anchor feature: %q", value)
}

// viewFlip: the elevations draw V upward while an element's drawn frame points
// it down.
func viewFlip(view PlotView) float64 {
	if view == ViewTop {
		return 1
	}
	return -1
}

func halfExtents(element domain.StagePlotElement) [3]float64 {
	return [3]float64{element.WidthCm / 2, element.DepthCm / 2, element.HeightCm / 2}
}

func axisList(element domain.StagePlotElement, view PlotView) [3]PlaneVec {
	axes := ProjectAxes(element, view)
	return [3]PlaneVec{axes.Ax, axes.Ay, axes.Az}
}

// drawnToProjected turns a displacement in the element's drawn frame into the
// projected plane: rotate by the drawn rotation, then undo the elevations' flip.
func drawnToProjected(offset PlaneVec, rect ProjectedRect, view PlotView) PlaneVec {
	radians := rect.RotationDeg * math.Pi / 180
	cos, sin := math.Cos(radians), math.Sin(radians)
	return PlaneVec{
		U: roundCm(offset.U*cos - offset.V*sin),
		V: roundCm((offset.U*sin + offset.V*cos) * viewFlip(view)),
	}
}

func featureDrawnOffset(element domain.StagePlotElement, view PlotView, feature AnchorFeature) PlaneVec {
	if feature.Kind == "centre" {
		return PlaneVec{}
	}
	axes := axisList(element, view)
	half := halfExtents(element)
	if feature.Kind == "corner" {
		var out PlaneVec
		for i := 0; i < 3; i++ {
			out.U += float64(feature.Signs[i]) * half[i] * axes[i].U
			out.V += float64(feature.Signs[i]) * half[i] * axes[i].V
		}
		return out
	}
	i := feature.Axis
	return PlaneVec{
		U: float64(feature.Sign) * half[i] * axes[i].U,
		V: float64(feature.Sign) * half[i] * axes[i].V,
	}
}

// AnchorPoint is where an anchor feature falls in the projected plane. A face
// resolves to its projected CENTRE, which is the midpoint of that straight
// side in any view that shows the face edge-on.
func AnchorPoint(element domain.StagePlotElement, view PlotView, feature AnchorFeature) PlaneVec {
	rect := ProjectElement(element, view)
	offset := drawnToProjected(featureDrawnOffset(element, view, feature), rect, view)
	return PlaneVec{U: roundCm(rect.U + offset.U), V: roundCm(rect.V + offset.V)}
}

// FaceLine is a face seen edge-on: the infinite line it projects to, and the
// extent it actually draws over.
type FaceLine struct {
	Point   PlaneVec
	Dir     PlaneVec
	Normal  PlaneVec
	Segment [2]PlaneVec
}

func planeLength(v PlaneVec) float64 { return math.Hypot(v.U, v.V) }

func planeNormalize(v PlaneVec) PlaneVec {
	l := planeLength(v)
	if l == 0 {
		return PlaneVec{}
	}
	return PlaneVec{U: v.U / l, V: v.V / l}
}

// ProjectFaceLine gives the line a face projects to, or false where the face is
// not edge-on. A face's projected normal has length ~1 when the normal lies in
// the view plane (the face is seen as a side) and ~0 when it points into the
// screen. That one test also declines the top and bottom faces in a top view,
// which is correct and needs no special case.
func ProjectFaceLine(element domain.StagePlotElement, view PlotView, feature AnchorFeature) (FaceLine, bool) {
	if feature.Kind != "face" {
		return FaceLine{}, false
	}
	rect := ProjectElement(element, view)
	axes := axisList(element, view)
	half := halfExtents(element)
	raw := drawnToProjected(PlaneVec{
		U: float64(feature.Sign) * axes[feature.Axis].U,
		V: float64(feature.Sign) * axes[feature.Axis].V,
	}, rect, view)
	if planeLength(raw) < faceEdgeOnMin {
		return FaceLine{}, false
	}
	normal := planeNormalize(raw)
	dir := PlaneVec{U: -normal.V, V: normal.U}
	point := AnchorPoint(element, view, feature)

	others := make([]int, 0, 2)
	for i := 0; i < 3; i++ {
		if i != feature.Axis {
			others = append(others, i)
		}
	}
	minT, maxT := math.Inf(1), math.Inf(-1)
	for _, sj := range []float64{-1, 1} {
		for _, sk := range []float64{-1, 1} {
			offset := PlaneVec{
				U: float64(feature.Sign)*half[feature.Axis]*axes[feature.Axis].U + sj*half[others[0]]*axes[others[0]].U + sk*half[others[1]]*axes[others[1]].U,
				V: float64(feature.Sign)*half[feature.Axis]*axes[feature.Axis].V + sj*half[others[0]]*axes[others[0]].V + sk*half[others[1]]*axes[others[1]].V,
			}
			// drawnToProjected gives a DISPLACEMENT from the element's centre,
			// and base below is taken from the absolute face centre — so this
			// has to be absolute too, or the side's extent is offset by the
			// projection of wherever the element happens to stand.
			p := drawnToProjected(offset, rect, view)
			t := (rect.U+p.U)*dir.U + (rect.V+p.V)*dir.V
			minT = math.Min(minT, t)
			maxT = math.Max(maxT, t)
		}
	}
	base := point.U*dir.U + point.V*dir.V
	segment := [2]PlaneVec{
		{U: roundCm(point.U + (minT-base)*dir.U), V: roundCm(point.V + (minT-base)*dir.V)},
		{U: roundCm(point.U + (maxT-base)*dir.U), V: roundCm(point.V + (maxT-base)*dir.V)},
	}
	return FaceLine{Point: point, Dir: dir, Normal: normal, Segment: segment}, true
}

// AllowsPlaneAnchor: an ellipse has no straight side, so "anywhere along it"
// cannot be kept. Its four quadrant points are still offered — they are its
// edge-on face centres.
func AllowsPlaneAnchor(element domain.StagePlotElement) bool {
	return element.ShapeKind != "ellipse"
}

type OfferedAnchor struct {
	Feature    AnchorFeature
	Point      PlaneVec
	AllowSlide bool
}

// OfferedAnchors is the anchor features an element offers in a view: its
// centre, the corners that are vertices of its drawn silhouette, and the
// midpoints of the sides it actually shows.
func OfferedAnchors(element domain.StagePlotElement, view PlotView) []OfferedAnchor {
	rect := ProjectElement(element, view)
	offered := []OfferedAnchor{{Feature: AnchorFeature{Kind: "centre"}, Point: PlaneVec{U: rect.U, V: rect.V}}}

	hull := ProjectedOutline(element, view)
	projectedHull := make([]PlaneVec, 0, len(hull))
	for _, h := range hull {
		projectedHull = append(projectedHull, drawnToProjected(h, rect, view))
	}
	// The hull's points were rounded to the 0.1 mm grain before this rounds
	// them again, so the comparison has to clear two roundings, not one.
	onHull := func(p PlaneVec) bool {
		for _, h := range projectedHull {
			if math.Abs(h.U-p.U) < 0.05 && math.Abs(h.V-p.V) < 0.05 {
				return true
			}
		}
		return false
	}

	seen := map[[2]int64]bool{}
	for _, sx := range []int{1, -1} {
		for _, sy := range []int{1, -1} {
			for _, sz := range []int{1, -1} {
				feature := AnchorFeature{Kind: "corner", Signs: [3]int{sx, sy, sz}}
				offset := drawnToProjected(featureDrawnOffset(element, view, feature), rect, view)
				if !onHull(offset) {
					continue
				}
				point := PlaneVec{U: roundCm(rect.U + offset.U), V: roundCm(rect.V + offset.V)}
				// Corners that coincide in this projection are one drawn
				// corner; the first in this fixed order wins, so the choice is
				// deterministic.
				key := [2]int64{int64(math.Round(point.U * 100)), int64(math.Round(point.V * 100))}
				if seen[key] {
					continue
				}
				seen[key] = true
				offered = append(offered, OfferedAnchor{Feature: feature, Point: point})
			}
		}
	}

	slide := AllowsPlaneAnchor(element)
	for axis := 0; axis < 3; axis++ {
		for _, sign := range []int{1, -1} {
			feature := AnchorFeature{Kind: "face", Axis: axis, Sign: sign}
			if _, ok := ProjectFaceLine(element, view, feature); !ok {
				continue
			}
			offered = append(offered, OfferedAnchor{
				Feature:    feature,
				Point:      AnchorPoint(element, view, feature),
				AllowSlide: slide,
			})
		}
	}
	return offered
}

// MeasurementEnd is one end of a measurement, resolved against the geometry.
// Exactly one of Point / Line is meaningful, per IsLine.
type MeasurementEnd struct {
	Point  PlaneVec
	Line   FaceLine
	IsLine bool
}

type MeasurementSpan struct {
	A     PlaneVec
	B     PlaneVec
	Dir   PlaneVec
	Value float64
}

// rayMeetsLine is where a ray from origin along dir crosses a line.
func rayMeetsLine(origin, dir PlaneVec, line FaceLine) (PlaneVec, bool) {
	denominator := dir.U*line.Normal.U + dir.V*line.Normal.V
	if math.Abs(denominator) < 1e-9 {
		return PlaneVec{}, false
	}
	toLine := PlaneVec{U: line.Point.U - origin.U, V: line.Point.V - origin.V}
	t := (toLine.U*line.Normal.U + toLine.V*line.Normal.V) / denominator
	return PlaneVec{U: roundCm(origin.U + t*dir.U), V: roundCm(origin.V + t*dir.V)}, true
}

// ComputeMeasurementSpan is what a measurement actually measures. The three
// types differ only in the direction the value is read along: aligned reads
// along the line between the ends (or along a face's normal, which is what
// makes it perpendicular), horizontal and vertical along one view axis alone.
//
// Returns false where the ends state no distance: two coincident points, a
// locked type whose axis runs parallel to the face it measures to, or two
// faces that are not parallel.
func ComputeMeasurementSpan(from, to MeasurementEnd, measurementType string) (MeasurementSpan, bool) {
	var axisDir PlaneVec
	hasAxis := true
	switch measurementType {
	case "horizontal":
		axisDir = PlaneVec{U: 1, V: 0}
	case "vertical":
		axisDir = PlaneVec{U: 0, V: 1}
	default:
		hasAxis = false
	}
	value := func(a, b, dir PlaneVec) float64 {
		return roundCm(math.Abs((b.U-a.U)*dir.U + (b.V-a.V)*dir.V))
	}

	switch {
	case !from.IsLine && !to.IsLine:
		delta := PlaneVec{U: to.Point.U - from.Point.U, V: to.Point.V - from.Point.V}
		dir := axisDir
		if !hasAxis {
			dir = planeNormalize(delta)
		}
		if planeLength(dir) == 0 {
			return MeasurementSpan{}, false
		}
		return MeasurementSpan{A: from.Point, B: to.Point, Dir: dir, Value: value(from.Point, to.Point, dir)}, true

	case from.IsLine && to.IsLine:
		// Only parallel faces have a single distance between them.
		if math.Abs(from.Line.Normal.U*to.Line.Normal.V-from.Line.Normal.V*to.Line.Normal.U) > 1e-6 {
			return MeasurementSpan{}, false
		}
		dir := axisDir
		if !hasAxis {
			dir = from.Line.Normal
		}
		a := from.Line.Point
		b, ok := rayMeetsLine(a, dir, to.Line)
		if !ok {
			return MeasurementSpan{}, false
		}
		return MeasurementSpan{A: a, B: b, Dir: dir, Value: value(a, b, dir)}, true

	default:
		line := from.Line
		point := to.Point
		if !from.IsLine {
			line = to.Line
			point = from.Point
		}
		dir := axisDir
		if !hasAxis {
			dir = line.Normal
		}
		foot, ok := rayMeetsLine(point, dir, line)
		if !ok {
			return MeasurementSpan{}, false
		}
		a, b := point, foot
		if from.IsLine {
			a, b = foot, point
		}
		return MeasurementSpan{A: a, B: b, Dir: dir, Value: value(a, b, dir)}, true
	}
}

type MeasurementDrawing struct {
	MeasurementSpan
	Normal PlaneVec
	LineA  PlaneVec
	LineB  PlaneVec
}

// ComputeMeasurementDrawing is the drawn dimension line for a span. At zero
// offset a locked measurement sits on the end picked SECOND and the first
// grows the extension line; an aligned one runs straight between its ends. The
// offset never changes the value.
func ComputeMeasurementDrawing(span MeasurementSpan, offsetCm float64) MeasurementDrawing {
	normal := PlaneVec{U: -span.Dir.V, V: span.Dir.U}
	at := func(p PlaneVec) float64 { return p.U*normal.U + p.V*normal.V }
	target := at(span.B) + offsetCm
	shift := func(p PlaneVec) PlaneVec {
		delta := target - at(p)
		return PlaneVec{U: roundCm(p.U + delta*normal.U), V: roundCm(p.V + delta*normal.V)}
	}
	return MeasurementDrawing{MeasurementSpan: span, Normal: normal, LineA: shift(span.A), LineB: shift(span.B)}
}
