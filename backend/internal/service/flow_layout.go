package service

import "math"

// Paper geometry for a drawn signal-flow graph.
//
// These are the approved mockup's numbers, and they are paper numbers — not the
// canvas's 200 px box and 18 px row scaled by something. The canvas and the
// document are two renderings of one graph, and each has its own metrics; what
// they share is the *shape* of the arithmetic, which is that a box's height is a
// function of how many jacks it has.
const (
	nodeWidthMM  = 52.0
	nodeHeaderMM = 5.0
	portRowMM    = 4.0
	nodeFooterMM = 3.0

	// Type on a drawn box, in points, at full size.
	portLabelPt  = 6.0
	nodeTitlePt  = 6.4
	nodeFooterPt = 5.6

	// The legibility floor. Below this a port label stops being readable at
	// arm's length on a printed page, and a drawing whose labels cannot be
	// read is not a smaller version of one that can — it tiles instead.
	// A guess until run against a real festival patch; one constant, so being
	// wrong about it changes a value and not a code path.
	minPortLabelPt = 5.0

	// A cable's stub out of a jack before it turns, and the narrowest two
	// parallel runs may sit and still read as two.
	edgeStubMM    = 3.0
	minLaneGapMM  = 0.8
	canvasNodePx  = 200.0 // frontend NODE_WIDTH, for the natural-density scale
	tileOverlapMM = 0.0
)

// NodeBox is one node placed on paper.
type NodeBox struct {
	Node FlowNode
	// X, Y is the box's top-left corner in millimetres from the text block's
	// origin. W, H are its size.
	X, Y, W, H float64
}

// PortY is the centre height of one jack on this box, in millimetres.
func (b NodeBox) PortY(index int) float64 {
	return b.Y + b.header() + float64(index)*b.rowHeight() + b.rowHeight()/2
}

// PortX is the edge of the box a jack on this side sits on. A cable leaves the
// right edge and arrives at the left one.
func (b NodeBox) PortX(side FlowSide) float64 {
	if side == SideIn {
		return b.X
	}
	return b.X + b.W
}

func (b NodeBox) shrink() float64    { return b.W / nodeWidthMM }
func (b NodeBox) header() float64    { return nodeHeaderMM * b.shrink() }
func (b NodeBox) rowHeight() float64 { return portRowMM * b.shrink() }

// FlowLayout is one graph placed on paper: where every box sits, how the
// arrangement was scaled to get there, and — when it could not be made to fit —
// how it was divided across pages.
type FlowLayout struct {
	Boxes []NodeBox
	// Scale is millimetres per canvas unit. Stated on the page, because a
	// drawing whose scale is not stated cannot be measured.
	Scale float64
	// Shrink is the factor applied to box sizes and type, 1 at full size.
	Shrink float64
	// Tiles is how the plane was divided. One tile is the ordinary case.
	Tiles []FlowTile
	// PlaneW and PlaneH are the whole drawing's extent in millimetres, which
	// exceeds the page only when tiled.
	PlaneW, PlaneH float64
}

// FlowTile is one page's worth of a divided drawing.
type FlowTile struct {
	X, Y, W, H float64
	// Col and Row locate this tile in the grid, for the page to state.
	Col, Row int
}

// Frame re-measures a drawn graph once its cables are routed, and shifts it so
// that nothing sits outside the plane.
//
// The plane used to be measured from the boxes alone, which is wrong in both
// directions: a cable routed into the gutter above the topmost box runs at a
// negative height and was drawn over the section title, and one leaving past the
// rightmost box ran off the page. Both were then cut off by the tile clip, so a
// signal path simply disappeared for part of its length.
//
// Routing depends on the layout and the frame depends on the routing, so this is
// a pass after both rather than a term inside either.
func (l *FlowLayout) Frame(routing FlowRouting, availW, availH float64) FlowRouting {
	minX, minY := 0.0, 0.0
	maxX, maxY := 0.0, 0.0
	for _, box := range l.Boxes {
		minX, minY = math.Min(minX, box.X), math.Min(minY, box.Y)
		maxX, maxY = math.Max(maxX, box.X+box.W), math.Max(maxY, box.Y+box.H)
	}
	for _, edge := range routing.Edges {
		for _, segment := range edge.Segments {
			minX = math.Min(minX, math.Min(segment.X1, segment.X2))
			minY = math.Min(minY, math.Min(segment.Y1, segment.Y2))
			maxX = math.Max(maxX, math.Max(segment.X1, segment.X2))
			maxY = math.Max(maxY, math.Max(segment.Y1, segment.Y2))
		}
	}
	// A little room for the arrowheads, which are drawn past the last segment.
	maxX += arrowLength
	maxY += arrowLength

	shiftX, shiftY := -minX, -minY
	for index := range l.Boxes {
		l.Boxes[index].X += shiftX
		l.Boxes[index].Y += shiftY
	}
	shifted := FlowRouting{Edges: make([]RoutedEdge, len(routing.Edges))}
	for index, edge := range routing.Edges {
		moved := RoutedEdge{Edge: edge.Edge, TipX: edge.TipX + shiftX, TipY: edge.TipY + shiftY}
		moved.Segments = make([]Segment, len(edge.Segments))
		for i, segment := range edge.Segments {
			segment.X1 += shiftX
			segment.X2 += shiftX
			segment.Y1 += shiftY
			segment.Y2 += shiftY
			moved.Segments[i] = segment
		}
		shifted.Edges[index] = moved
	}

	l.PlaneW, l.PlaneH = maxX+shiftX, maxY+shiftY
	if l.PlaneW > availW+epsilon || l.PlaneH > availH+epsilon {
		l.Tiles = cutTiles(l.Boxes, l.PlaneW, l.PlaneH, availW, availH)
	} else {
		l.Tiles = []FlowTile{{W: availW, H: availH}}
	}
	return shifted
}

// LayoutAndRouteFlow places a graph, routes its cables and frames the result.
//
// The two passes need each other: the cables cannot be routed until the boxes
// are placed, and the drawing cannot be measured until the cables exist. So a
// graph that fitted the page on its boxes alone can overflow it once its cables
// are drawn — and the honest response is to fit again into a block reduced by
// exactly what it overflowed by, rather than to reach for a second page.
//
// One retry, and only when the overflow is small enough to be about cables. A
// drawing that is genuinely too big is still tiled.
func LayoutAndRouteFlow(graph FlowGraph, availW, availH float64) (FlowLayout, FlowRouting) {
	layout := LayoutFlow(graph, availW, availH)
	routing := layout.Frame(RouteFlow(graph, layout), availW, availH)
	if !layout.Tiled() {
		return layout, routing
	}

	overflowW := math.Max(0, layout.PlaneW-availW)
	overflowH := math.Max(0, layout.PlaneH-availH)
	if overflowW > availW/3 || overflowH > availH/3 {
		return layout, routing
	}

	retryW := availW - overflowW - 1
	retryH := availH - overflowH - 1
	if retryW <= nodeWidthMM || retryH <= nodeHeaderMM {
		return layout, routing
	}
	retry := LayoutFlow(graph, retryW, retryH)
	retryRouting := retry.Frame(RouteFlow(graph, retry), availW, availH)
	if retry.Tiled() {
		return layout, routing
	}
	return retry, retryRouting
}

// Tiled is whether the drawing needed more than one page.
func (l FlowLayout) Tiled() bool { return len(l.Tiles) > 1 }

// Box returns the placed box with this key.
func (l FlowLayout) Box(key string) (NodeBox, bool) {
	for _, box := range l.Boxes {
		if box.Node.Key == key {
			return box, true
		}
	}
	return NodeBox{}, false
}

// nodeSize is a box's paper size at a given shrink factor. A node with no
// footer text does not pay for one.
func nodeSize(node FlowNode, shrink float64) (float64, float64) {
	height := nodeHeaderMM + float64(node.Rows())*portRowMM
	if node.Footer != "" {
		height += nodeFooterMM
	}
	return nodeWidthMM * shrink, height * shrink
}

// LayoutFlow places a graph inside a text block of the given size.
//
// Three stages, each tried only when the one before it fails:
//
//  1. Fit — scale the arrangement by the largest factor for which every box
//     still lands inside the block. Positions scale; boxes do not.
//  2. Shrink — when that scale packs the boxes tightly enough to collide, or
//     leaves a channel too narrow for the cables crossing it, reduce box size
//     and type and try again, down to the legibility floor.
//  3. Tile — at the floor and still not fitting, hold the arrangement at the
//     density the canvas has and divide the plane across pages.
//
// A graph whose boxes the planner has already dragged on top of each other is
// drawn overlapping. That is what the canvas shows too, and moving them would
// be the document inventing an arrangement. It is also the one case the routing
// invariant cannot hold: boxes at the same place have jacks at the same point,
// and two cables arriving at one point share ink by definition. Boxes at
// *exactly* the same coordinates hide each other entirely — the stage rig
// section still lists every one of them.
func LayoutFlow(graph FlowGraph, availW, availH float64) FlowLayout {
	if len(graph.Nodes) == 0 {
		return FlowLayout{Scale: 1, Shrink: 1, Tiles: []FlowTile{{W: availW, H: availH}}}
	}

	// Overlap the planner already has is not a reason to shrink or to tile.
	// Four output devices stacked at one spot on the canvas overlap at every
	// scale, so a fit loop that treats any overlap as failure walks all the way
	// down to tiling — and tiling does not separate them either, it just deals
	// them across pages. What matters is overlap the *scaling* introduced.
	inherent := inherentOverlaps(graph)

	floor := minPortLabelPt / portLabelPt
	for _, shrink := range shrinkSteps(floor) {
		scale := fitScale(graph, availW, availH, shrink)
		boxes := placeBoxes(graph, scale, shrink)
		if !anyOverlap(boxes, inherent) && channelsFit(graph, boxes) {
			w, h := planeExtent(boxes)
			return FlowLayout{
				Boxes:  boxes,
				Scale:  scale,
				Shrink: shrink,
				Tiles:  []FlowTile{{W: availW, H: availH}},
				PlaneW: w, PlaneH: h,
			}
		}
	}

	// Stage 3. Hold the arrangement at the canvas's own density, which is the
	// scale at which boxes sit apart exactly as the planner left them, and let
	// the plane exceed the page.
	shrink := floor
	scale := nodeWidthMM * shrink / canvasNodePx
	boxes := placeBoxes(graph, scale, shrink)
	_ = inherent
	planeW, planeH := planeExtent(boxes)
	return FlowLayout{
		Boxes:  boxes,
		Scale:  scale,
		Shrink: shrink,
		Tiles:  cutTiles(boxes, planeW, planeH, availW, availH),
		PlaneW: planeW, PlaneH: planeH,
	}
}

// shrinkSteps walks from full size down to the floor. Coarse on purpose: the
// range between them is narrow, and a finer sweep buys a fraction of a
// millimetre at the cost of laying the graph out a dozen times.
func shrinkSteps(floor float64) []float64 {
	steps := []float64{1.0}
	for v := 0.95; v > floor; v -= 0.05 {
		steps = append(steps, v)
	}
	return append(steps, floor)
}

// fitScale is the largest millimetres-per-canvas-unit at which every box still
// lands inside the block. Positions scale from the arrangement's own origin, so
// a graph the planner pushed into negative coordinates is placed the same way as
// one that starts at zero.
func fitScale(graph FlowGraph, availW, availH, shrink float64) float64 {
	minX, minY := math.Inf(1), math.Inf(1)
	for _, node := range graph.Nodes {
		minX = math.Min(minX, node.X)
		minY = math.Min(minY, node.Y)
	}

	scale := math.Inf(1)
	for _, node := range graph.Nodes {
		w, h := nodeSize(node, shrink)
		if dx := node.X - minX; dx > 0 {
			scale = math.Min(scale, (availW-w)/dx)
		}
		if dy := node.Y - minY; dy > 0 {
			scale = math.Min(scale, (availH-h)/dy)
		}
	}
	if math.IsInf(scale, 1) {
		// One node, or every node stacked at one point: nothing constrains
		// the scale, so use the canvas's own density.
		scale = nodeWidthMM * shrink / canvasNodePx
	}
	return math.Max(scale, 0)
}

func placeBoxes(graph FlowGraph, scale, shrink float64) []NodeBox {
	minX, minY := math.Inf(1), math.Inf(1)
	for _, node := range graph.Nodes {
		minX = math.Min(minX, node.X)
		minY = math.Min(minY, node.Y)
	}

	boxes := make([]NodeBox, 0, len(graph.Nodes))
	for _, node := range graph.Nodes {
		w, h := nodeSize(node, shrink)
		boxes = append(boxes, NodeBox{
			Node: node,
			X:    (node.X - minX) * scale,
			Y:    (node.Y - minY) * scale,
			W:    w,
			H:    h,
		})
	}
	return boxes
}

// inherentOverlaps is the set of box pairs that already sit on top of each other
// at the density the canvas itself uses. No scale separates them, so no scale
// choice should be blamed for them.
func inherentOverlaps(graph FlowGraph) map[[2]int]bool {
	natural := nodeWidthMM / canvasNodePx
	boxes := placeBoxes(graph, natural, 1)
	pairs := map[[2]int]bool{}
	for i := 0; i < len(boxes); i++ {
		for j := i + 1; j < len(boxes); j++ {
			if boxesOverlap(boxes[i], boxes[j]) {
				pairs[[2]int{i, j}] = true
			}
		}
	}
	return pairs
}

// anyOverlap reports whether scaling has pushed two boxes on top of each other
// that were not already. Boxes the planner overlapped on the canvas are excluded
// — the document reproduces that arrangement rather than arguing with it.
func anyOverlap(boxes []NodeBox, inherent map[[2]int]bool) bool {
	for i := 0; i < len(boxes); i++ {
		for j := i + 1; j < len(boxes); j++ {
			if inherent[[2]int{i, j}] {
				continue
			}
			if boxesOverlap(boxes[i], boxes[j]) {
				return true
			}
		}
	}
	return false
}

func boxesOverlap(a, b NodeBox) bool {
	return a.X < b.X+b.W && b.X < a.X+a.W && a.Y < b.Y+b.H && b.Y < a.Y+a.H
}

// channelsFit is the layout's half of R2: a gap between two columns of boxes has
// to be wide enough to give every cable crossing it a lane of its own. If it is
// not, the answer is a smaller drawing or a divided one, never thinner lanes.
func channelsFit(graph FlowGraph, boxes []NodeBox) bool {
	columns := groupColumns(boxes)
	if len(columns) < 2 {
		return true
	}
	demand := channelDemand(graph, boxes, columns)
	for index := 0; index+1 < len(columns); index++ {
		gap := columns[index+1].left - columns[index].right
		needed := 2*edgeStubMM + float64(demand[index])*minLaneGapMM
		if gap < needed {
			return false
		}
	}
	return true
}

func planeExtent(boxes []NodeBox) (float64, float64) {
	var w, h float64
	for _, box := range boxes {
		w = math.Max(w, box.X+box.W)
		h = math.Max(h, box.Y+box.H)
	}
	return w, h
}

// cutTiles divides a plane too large for one page. Cuts fall in the space
// between boxes, never through one: a box split across a fold is unreadable on
// both halves.
func cutTiles(boxes []NodeBox, planeW, planeH, pageW, pageH float64) []FlowTile {
	xCuts := cutPositions(boxes, planeW, pageW, true)
	yCuts := cutPositions(boxes, planeH, pageH, false)

	var tiles []FlowTile
	for row := 0; row+1 < len(yCuts); row++ {
		for col := 0; col+1 < len(xCuts); col++ {
			tiles = append(tiles, FlowTile{
				X:   xCuts[col],
				Y:   yCuts[row],
				W:   xCuts[col+1] - xCuts[col],
				H:   yCuts[row+1] - yCuts[row],
				Col: col, Row: row,
			})
		}
	}
	if len(tiles) == 0 {
		return []FlowTile{{W: pageW, H: pageH}}
	}
	return tiles
}

// cutPositions walks the plane a page at a time, pulling each cut back to the
// nearest gap between boxes at or before the page boundary.
func cutPositions(boxes []NodeBox, extent, page float64, horizontal bool) []float64 {
	cuts := []float64{0}
	for cuts[len(cuts)-1]+page < extent {
		start := cuts[len(cuts)-1]
		limit := start + page
		cut := limit
		// Pull back to the last position before the boundary that no box
		// straddles. A box wider than a whole page cannot be respected, and
		// then the boundary itself is the honest answer.
		for candidate := limit; candidate > start; candidate -= 1.0 {
			if !straddles(boxes, candidate, horizontal) {
				cut = candidate
				break
			}
		}
		if cut <= start {
			cut = limit
		}
		cuts = append(cuts, cut)
	}
	return append(cuts, extent)
}

func straddles(boxes []NodeBox, at float64, horizontal bool) bool {
	for _, box := range boxes {
		lo, hi := box.Y, box.Y+box.H
		if horizontal {
			lo, hi = box.X, box.X+box.W
		}
		if at > lo && at < hi {
			return true
		}
	}
	return false
}
