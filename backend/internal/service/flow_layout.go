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
// be the document inventing an arrangement.
func LayoutFlow(graph FlowGraph, availW, availH float64) FlowLayout {
	if len(graph.Nodes) == 0 {
		return FlowLayout{Scale: 1, Shrink: 1, Tiles: []FlowTile{{W: availW, H: availH}}}
	}

	floor := minPortLabelPt / portLabelPt
	for _, shrink := range shrinkSteps(floor) {
		scale := fitScale(graph, availW, availH, shrink)
		boxes := placeBoxes(graph, scale, shrink)
		if !anyOverlap(boxes) && channelsFit(graph, boxes) {
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

// anyOverlap reports whether two boxes as placed would sit on top of each other.
// Boxes the planner already overlapped on the canvas are excluded — the document
// reproduces that arrangement rather than arguing with it.
func anyOverlap(boxes []NodeBox) bool {
	for i := 0; i < len(boxes); i++ {
		for j := i + 1; j < len(boxes); j++ {
			a, b := boxes[i], boxes[j]
			if a.Node.X == b.Node.X && a.Node.Y == b.Node.Y {
				continue
			}
			if a.X < b.X+b.W && b.X < a.X+a.W && a.Y < b.Y+b.H && b.Y < a.Y+a.H {
				return true
			}
		}
	}
	return false
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
