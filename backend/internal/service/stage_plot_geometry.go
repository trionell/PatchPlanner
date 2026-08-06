package service

import (
	"math"
	"sort"

	"github.com/trionell/patchplanner/internal/domain"
)

// The stage plot's projection, ported from frontend/src/lib/stagePlot.ts.
//
// Only the pure projection travels: the editor's snapping, dragging and zoom
// clamping are screen behaviour and stay where they are. What is here is the
// part paper needs, and it is held to the TypeScript suite's own assertions in
// stage_plot_geometry_test.go so the two cannot answer differently today.
//
// Conventions, unchanged from the canvas:
//   - (XCm, YCm) is the element's CENTRE in plan: x grows stage-left to
//     stage-right, y grows upstage to downstage.
//   - ZCm is the element's BOTTOM above the floor; HeightCm is its extent.
//   - Projected coordinates are (u, v): u grows rightward, v grows DOWNSTAGE in
//     the top view and UP in the elevations. The renderer maps v onto the
//     page's downward axis per view.

// PlotView is one of the three orthographic views.
type PlotView string

const (
	ViewTop   PlotView = "top"
	ViewFront PlotView = "front"
	ViewSide  PlotView = "side"
)

// PlotViews is the order the document draws them in.
var PlotViews = []PlotView{ViewTop, ViewFront, ViewSide}

// ProjectedRect is an element's drawn rectangle in the view plane, in cm.
type ProjectedRect struct {
	U, V          float64
	Width, Height float64
	// RotationDeg is what the view draws with: the plan rotation in the top
	// view, the tilt in the front view; the side view stays axis-aligned.
	RotationDeg float64
}

type vec3 struct{ X, Y, Z float64 }

// PlaneVec is a direction or point on a view's plane.
type PlaneVec struct{ U, V float64 }

// ProjectedAxes is where an element's own axes point inside its drawn frame:
// a point at (a, b, c) cm in the element's local frame draws at a·Ax + b·Ay +
// c·Az from its centre, which is how a truss fixture projects exactly like the
// bar it hangs on.
type ProjectedAxes struct {
	Ax, Ay, Az PlaneVec
}

// Bounds is an axis-aligned box in the view plane, in cm.
type Bounds struct {
	MinU, MaxU, MinV, MaxV float64
}

// localAxes gives the world directions of an element's local axes under its
// plan rotation (yaw about the vertical) and tilt (rake about its own depth
// axis): world = Rz(rotation) · Ry(tilt) · local.
func localAxes(rotationDeg, tiltDeg float64) (ax, ay, az vec3) {
	yaw := rotationDeg * math.Pi / 180
	tilt := tiltDeg * math.Pi / 180
	cy, sy := math.Cos(yaw), math.Sin(yaw)
	ct, st := math.Cos(tilt), math.Sin(tilt)
	return vec3{cy * ct, sy * ct, -st}, vec3{-sy, cy, 0}, vec3{cy * st, sy * st, ct}
}

// screenDirection puts a world direction onto a view's plane.
func screenDirection(a vec3, view PlotView) PlaneVec {
	switch view {
	case ViewTop:
		return PlaneVec{a.X, a.Y}
	case ViewFront:
		return PlaneVec{a.X, -a.Z}
	default:
		return PlaneVec{a.Y, -a.Z}
	}
}

func dotPlane(a, b PlaneVec) float64 { return a.U*b.U + a.V*b.V }

// drawnRotation is the rotation a view draws with.
func drawnRotation(element domain.StagePlotElement, view PlotView) float64 {
	switch view {
	case ViewTop:
		return element.RotationDeg
	case ViewFront:
		return element.TiltDeg
	default:
		return 0
	}
}

// roundCm kills the cos²+sin² float noise so an unrotated element keeps its
// exact stored dimensions.
func roundCm(value float64) float64 { return math.Round(value*100) / 100 }

// ProjectElement is the orthographic projection of one element into a view.
//
// The stored fields are a full 3D model — centre, box dimensions, plan rotation
// and tilt — and every view projects that same oriented box, so the views can
// never disagree: a truss yawed 90° in plan shows only its cross-section in the
// front view and its full length in the side view.
func ProjectElement(element domain.StagePlotElement, view PlotView) ProjectedRect {
	rotationDeg := drawnRotation(element, view)
	ax, ay, az := localAxes(element.RotationDeg, element.TiltDeg)
	radians := rotationDeg * math.Pi / 180
	along := PlaneVec{math.Cos(radians), math.Sin(radians)}
	across := PlaneVec{-math.Sin(radians), math.Cos(radians)}
	pX := screenDirection(ax, view)
	pY := screenDirection(ay, view)
	pZ := screenDirection(az, view)

	width := roundCm(element.WidthCm*math.Abs(dotPlane(pX, along)) +
		element.DepthCm*math.Abs(dotPlane(pY, along)) +
		element.HeightCm*math.Abs(dotPlane(pZ, along)))
	height := roundCm(element.WidthCm*math.Abs(dotPlane(pX, across)) +
		element.DepthCm*math.Abs(dotPlane(pY, across)) +
		element.HeightCm*math.Abs(dotPlane(pZ, across)))

	switch view {
	case ViewTop:
		return ProjectedRect{U: element.XCm, V: element.YCm, Width: width, Height: height, RotationDeg: rotationDeg}
	case ViewFront:
		return ProjectedRect{U: element.XCm, V: element.ZCm + element.HeightCm/2, Width: width, Height: height, RotationDeg: rotationDeg}
	default:
		return ProjectedRect{U: element.YCm, V: element.ZCm + element.HeightCm/2, Width: width, Height: height, RotationDeg: rotationDeg}
	}
}

// ProjectAxes returns where the element's own axes point inside its drawn frame
// (u along the drawn width, v down). A near-zero vector is an axis pointing
// into the page.
func ProjectAxes(element domain.StagePlotElement, view PlotView) ProjectedAxes {
	ax, ay, az := localAxes(element.RotationDeg, element.TiltDeg)
	radians := drawnRotation(element, view) * math.Pi / 180
	along := PlaneVec{math.Cos(radians), math.Sin(radians)}
	across := PlaneVec{-math.Sin(radians), math.Cos(radians)}
	toDrawn := func(a vec3) PlaneVec {
		p := screenDirection(a, view)
		return PlaneVec{dotPlane(p, along), dotPlane(p, across)}
	}
	return ProjectedAxes{Ax: toDrawn(ax), Ay: toDrawn(ay), Az: toDrawn(az)}
}

// ProjectedOutline is the true silhouette of an element's oriented box in a
// view: the convex hull of its eight projected corners, in the drawn rect's
// frame. A plain rectangle when at most one rotation shows; up to a hexagon
// when yaw and tilt combine — the shape a rotated rectangle cannot represent.
func ProjectedOutline(element domain.StagePlotElement, view PlotView) []PlaneVec {
	axes := ProjectAxes(element, view)
	hw, hd, hh := element.WidthCm/2, element.DepthCm/2, element.HeightCm/2
	corners := make([]PlaneVec, 0, 8)
	for _, sx := range []float64{-1, 1} {
		for _, sy := range []float64{-1, 1} {
			for _, sz := range []float64{-1, 1} {
				corners = append(corners, PlaneVec{
					U: roundCm(sx*hw*axes.Ax.U + sy*hd*axes.Ay.U + sz*hh*axes.Az.U),
					V: roundCm(sx*hw*axes.Ax.V + sy*hd*axes.Ay.V + sz*hh*axes.Az.V),
				})
			}
		}
	}
	return convexHull(corners)
}

// convexHull is the monotone chain; the input is a handful of box corners.
func convexHull(points []PlaneVec) []PlaneVec {
	pts := make([]PlaneVec, len(points))
	copy(pts, points)
	sort.Slice(pts, func(i, j int) bool {
		if pts[i].U != pts[j].U {
			return pts[i].U < pts[j].U
		}
		return pts[i].V < pts[j].V
	})
	cross := func(o, a, b PlaneVec) float64 {
		return (a.U-o.U)*(b.V-o.V) - (a.V-o.V)*(b.U-o.U)
	}
	build := func(list []PlaneVec) []PlaneVec {
		hull := make([]PlaneVec, 0, len(list))
		for _, p := range list {
			for len(hull) >= 2 && cross(hull[len(hull)-2], hull[len(hull)-1], p) <= 0 {
				hull = hull[:len(hull)-1]
			}
			hull = append(hull, p)
		}
		return hull
	}
	reversed := make([]PlaneVec, len(pts))
	for i, p := range pts {
		reversed[len(pts)-1-i] = p
	}
	lower := build(pts)
	upper := build(reversed)
	hull := append([]PlaneVec{}, lower[:len(lower)-1]...)
	return append(hull, upper[:len(upper)-1]...)
}

// ProjectedBounds is the axis-aligned bounding box of an element's projected
// rectangle under its drawn rotation.
func ProjectedBounds(element domain.StagePlotElement, view PlotView) Bounds {
	rect := ProjectElement(element, view)
	radians := rect.RotationDeg * math.Pi / 180
	cos, sin := math.Abs(math.Cos(radians)), math.Abs(math.Sin(radians))
	halfW := (rect.Width*cos + rect.Height*sin) / 2
	halfH := (rect.Width*sin + rect.Height*cos) / 2
	return Bounds{
		MinU: rect.U - halfW, MaxU: rect.U + halfW,
		MinV: rect.V - halfH, MaxV: rect.V + halfH,
	}
}

// TrussLaneLocalV is the local v a lane is drawn at: the upstage chord, the
// centre line, or the downstage chord of the bar.
func TrussLaneLocalV(side string, barHalfDepth float64) float64 {
	switch side {
	case "top":
		return -barHalfDepth
	case "bottom":
		return barHalfDepth
	default:
		return 0
	}
}

// ClampFixtureOffset holds a fixture's offset inside the truss's current
// extent — a removed piece can leave a fixture hanging past the end — and
// reports whether it had to.
func ClampFixtureOffset(offsetCm, trussLengthCm float64) (offset float64, clamped bool) {
	if offsetCm <= trussLengthCm {
		return offsetCm, false
	}
	return trussLengthCm, true
}

// EffectiveElement applies the editor's derived truss geometry, so the document
// and the canvas agree about what a truss is: its length is the sum of its
// pieces, its depth is the bar's, it hangs at the truss's height, and an unnamed
// placement takes the truss's name.
func EffectiveElement(element domain.StagePlotElement, trusses map[int64]domain.PlotTruss) domain.StagePlotElement {
	if element.Kind != "truss" || element.TrussID == nil {
		return element
	}
	truss, ok := trusses[*element.TrussID]
	if !ok {
		return element
	}
	element.WidthCm = math.Max(truss.TotalLengthCm, 20)
	element.HeightCm = 30
	element.ZCm = truss.HeightCm
	if element.Name == "" {
		element.Name = truss.Name
	}
	return element
}
