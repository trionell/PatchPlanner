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
// drawn silhouette, whose vertex count changes with rotation.
//
// Kind is "centre", "corner", "edge" or "face". An "edge" is a SIDE of the
// drawn silhouette, stored as the box edge it projects from: the axis it runs
// along, plus the signs on the other two. A "face" is the older encoding for a
// side, still resolved, and still produced where a face is seen exactly
// edge-on — which is how a side arrives that no single edge spans.
type AnchorFeature struct {
	Kind  string
	Signs [3]int // corner: all three. edge: [0] and [1] are the cross axes.
	Axis  int    // edge: the axis it runs along. face: its normal. 0=x, 1=y, 2=z
	Sign  int    // face only
}

// edgeCrossAxes are the two axes an edge along axis is positioned by.
func edgeCrossAxes(axis int) [2]int {
	out := [2]int{}
	n := 0
	for i := 0; i < 3; i++ {
		if i != axis {
			out[n] = i
			n++
		}
	}
	return out
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
	case "edge":
		var b strings.Builder
		for i := 0; i < 2; i++ {
			if f.Signs[i] > 0 {
				b.WriteString("+")
			} else {
				b.WriteString("-")
			}
		}
		return fmt.Sprintf("edge:%s%s", axisLetters[f.Axis], b.String())
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
	edgePattern   = regexp.MustCompile(`^edge:([xyz])([+-])([+-])$`)
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
	if m := edgePattern.FindStringSubmatch(value); m != nil {
		axis := strings.Index("xyz", m[1])
		return AnchorFeature{Kind: "edge", Axis: axis, Signs: [3]int{asSign(m[2]), asSign(m[3])}}, nil
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
	if feature.Kind == "edge" {
		// The edge's MIDPOINT: positioned by the two axes it does not run
		// along, centred on the one it does.
		cross := edgeCrossAxes(feature.Axis)
		j, k := cross[0], cross[1]
		return PlaneVec{
			U: float64(feature.Signs[0])*half[j]*axes[j].U + float64(feature.Signs[1])*half[k]*axes[k].U,
			V: float64(feature.Signs[0])*half[j]*axes[j].V + float64(feature.Signs[1])*half[k]*axes[k].V,
		}
	}
	i := feature.Axis
	return PlaneVec{
		U: float64(feature.Sign) * half[i] * axes[i].U,
		V: float64(feature.Sign) * half[i] * axes[i].V,
	}
}

// edgeDrawnEnds gives an edge's two ends in the element's drawn frame.
func edgeDrawnEnds(element domain.StagePlotElement, view PlotView, feature AnchorFeature) [2]PlaneVec {
	axes := axisList(element, view)
	half := halfExtents(element)
	middle := featureDrawnOffset(element, view, feature)
	along := PlaneVec{U: half[feature.Axis] * axes[feature.Axis].U, V: half[feature.Axis] * axes[feature.Axis].V}
	return [2]PlaneVec{
		{U: middle.U - along.U, V: middle.V - along.V},
		{U: middle.U + along.U, V: middle.V + along.V},
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
// SideLine is the line a SIDE of the silhouette runs along, or false where that
// side is not a line in this view — an edge pointing into the screen, or a face
// not seen edge-on.
func SideLine(element domain.StagePlotElement, view PlotView, feature AnchorFeature) (FaceLine, bool) {
	if feature.Kind == "face" {
		return projectFaceLine(element, view, feature)
	}
	if feature.Kind != "edge" {
		return FaceLine{}, false
	}
	rect := ProjectElement(element, view)
	drawn := edgeDrawnEnds(element, view, feature)
	var ends [2]PlaneVec
	for i, end := range drawn {
		p := drawnToProjected(end, rect, view)
		ends[i] = PlaneVec{U: roundCm(rect.U + p.U), V: roundCm(rect.V + p.V)}
	}
	span := PlaneVec{U: ends[1].U - ends[0].U, V: ends[1].V - ends[0].V}
	// Pointing into the screen: the side is a point, not a line.
	if planeLength(span) < 1e-6 {
		return FaceLine{}, false
	}
	dir := planeNormalize(span)
	point := AnchorPoint(element, view, feature)
	// Outward is away from the element's own centre, which is what makes a
	// perpendicular measurement leave the object rather than cross it.
	outward := PlaneVec{U: point.U - rect.U, V: point.V - rect.V}
	normal := PlaneVec{U: dir.V, V: -dir.U}
	if normal.U*outward.U+normal.V*outward.V < 0 {
		normal = PlaneVec{U: -normal.U, V: -normal.V}
	}
	return FaceLine{Point: point, Dir: dir, Normal: normal, Segment: ends}, true
}

func projectFaceLine(element domain.StagePlotElement, view PlotView, feature AnchorFeature) (FaceLine, bool) {
	if feature.Kind != "face" {
		return FaceLine{}, false
	}
	rect := ProjectElement(element, view)
	axes := axisList(element, view)
	half := halfExtents(element)

	others := make([]int, 0, 2)
	for i := 0; i < 3; i++ {
		if i != feature.Axis {
			others = append(others, i)
		}
	}

	// The face's OWN in-plane axes, projected — and the line's direction comes
	// from these, never from rotating the projected normal by 90°.
	//
	// Orthographic projection drops an axis, and dropping an axis does not
	// preserve angles: two perpendicular 3D vectors generally do not project to
	// perpendicular 2D ones. Rotating the normal is only right when everything
	// stays in the view plane, which is why a yaw-only element read correctly
	// in plan and an element turned on every axis did not, in the elevations.
	spans := [2]PlaneVec{}
	for k, i := range others {
		spans[k] = drawnToProjected(PlaneVec{U: half[i] * axes[i].U, V: half[i] * axes[i].V}, rect, view)
	}
	cross := spans[0].U*spans[1].V - spans[0].V*spans[1].U
	long, short := spans[0], spans[1]
	if planeLength(spans[1]) > planeLength(spans[0]) {
		long, short = spans[1], spans[0]
	}
	// Projects to a point, not a line: there is no side to slide along.
	if planeLength(long) < 1e-6 {
		return FaceLine{}, false
	}
	// Edge-on when the face's two in-plane axes project onto ONE line. The
	// spread off that line is compared to the SHORT axis, which makes the test
	// sin(angle between them) < eps — scale-free, and true of a 6 m truss side
	// and a 40 cm one alike. Measured against the long axis instead, a long
	// thin face passes whatever its angle.
	if math.Abs(cross)/planeLength(long) > faceEdgeOnMin*planeLength(short) {
		return FaceLine{}, false
	}

	dir := planeNormalize(long)
	// Out of the face, as the projected normal would have it — used only to
	// orient, never to derive.
	outward := drawnToProjected(PlaneVec{
		U: float64(feature.Sign) * axes[feature.Axis].U,
		V: float64(feature.Sign) * axes[feature.Axis].V,
	}, rect, view)
	normal := PlaneVec{U: dir.V, V: -dir.U}
	if normal.U*outward.U+normal.V*outward.V < 0 {
		normal = PlaneVec{U: -normal.U, V: -normal.V}
	}

	point := AnchorPoint(element, view, feature)

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

// AllowsPlaneAnchor reports whether an element offers a sliding plane in this
// view — a question about the DRAWN silhouette, so it is asked per view.
//
// An ellipse element is an elliptical prism: the curve lies in its local x-y
// plane and is extruded along local z. Look down that extrusion and the
// silhouette is the curve itself, where "anywhere along this side" cannot be
// kept. Look at it from anywhere else and the silhouette is a plain rectangle
// with four straight edges. The canvas has always drawn it that way: a cylinder
// seen straight-on is a rectangle.
func AllowsPlaneAnchor(element domain.StagePlotElement, view PlotView) bool {
	if element.ShapeKind != "ellipse" {
		return true
	}
	return planeLength(axisList(element, view)[2]) >= faceEdgeOnMin
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
	// An ellipse has no corners. The silhouette hull is its bounding box, whose
	// corners are the one place the drawn shape certainly is NOT.
	cornered := element.ShapeKind != "ellipse"
	for _, sx := range []int{1, -1} {
		for _, sy := range []int{1, -1} {
			for _, sz := range []int{1, -1} {
				if !cornered {
					continue
				}
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

	// The SIDES of the drawn silhouette. A side arrives two ways and both are
	// needed: a FACE seen edge-on flattens to a segment no single edge spans —
	// the long sides of a raked truss in plan — and a box EDGE projects to a
	// side everywhere else, including every side of the hexagon that truss
	// shows in an elevation. Faces go first so a side that is both keeps the
	// encoding it has always had.
	//
	// Compared with a TOLERANCE rather than hashed: a face's segment is
	// reconstructed from projections and an edge's is read off the corners, so
	// the same drawn side arrives from the two paths a hundredth of a
	// centimetre apart, and any rounding grain eventually splits them.
	slide := AllowsPlaneAnchor(element, view)
	taken := make([][2]PlaneVec, 0, 8)
	near := func(a, b PlaneVec) bool { return math.Hypot(a.U-b.U, a.V-b.V) < 0.1 }
	alreadyASide := func(ends [2]PlaneVec) bool {
		for _, side := range taken {
			if (near(side[0], ends[0]) && near(side[1], ends[1])) || (near(side[0], ends[1]) && near(side[1], ends[0])) {
				return true
			}
		}
		return false
	}

	for axis := 0; axis < 3; axis++ {
		for _, sign := range []int{1, -1} {
			feature := AnchorFeature{Kind: "face", Axis: axis, Sign: sign}
			line, ok := SideLine(element, view, feature)
			if !ok {
				continue
			}
			taken = append(taken, line.Segment)
			offered = append(offered, OfferedAnchor{
				Feature:    feature,
				Point:      AnchorPoint(element, view, feature),
				AllowSlide: slide,
			})
		}
	}

	hullIndex := func(p PlaneVec) int {
		for i, h := range projectedHull {
			if math.Abs(h.U-p.U) < 0.05 && math.Abs(h.V-p.V) < 0.05 {
				return i
			}
		}
		return -1
	}
	for axis := 0; axis < 3; axis++ {
		for _, sj := range []int{1, -1} {
			for _, sk := range []int{1, -1} {
				feature := AnchorFeature{Kind: "edge", Axis: axis, Signs: [3]int{sj, sk, 0}}
				drawn := edgeDrawnEnds(element, view, feature)
				var relative [2]PlaneVec
				var absolute [2]PlaneVec
				for i, end := range drawn {
					relative[i] = drawnToProjected(end, rect, view)
					absolute[i] = PlaneVec{U: roundCm(rect.U + relative[i].U), V: roundCm(rect.V + relative[i].V)}
				}
				// A side of the drawing is an edge whose two ends are
				// neighbours on the silhouette. An edge crossing the interior,
				// or hidden behind the shape, is not a side of it.
				a, b := hullIndex(relative[0]), hullIndex(relative[1])
				if a < 0 || b < 0 || a == b {
					continue
				}
				gap := a - b
				if gap < 0 {
					gap = -gap
				}
				if gap != 1 && gap != len(projectedHull)-1 {
					continue
				}
				if alreadyASide(absolute) {
					continue
				}
				taken = append(taken, absolute)
				offered = append(offered, OfferedAnchor{
					Feature:    feature,
					Point:      AnchorPoint(element, view, feature),
					AllowSlide: slide,
				})
			}
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
