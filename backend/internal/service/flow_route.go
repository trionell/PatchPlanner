package service

import (
	"fmt"
	"math"
	"sort"
)

// Routing cable lines so that every one of them can be followed.
//
// Every cable on paper is the same black hairline. Two parallel runs that touch
// stop being two runs — a reader following one down the page has no way to know
// which one they are still on, and the drawing quietly misstates the patch. A
// crossing is different: two lines meeting at a right angle and separating is
// unambiguous, and always has been.
//
// So the rule is: lines may cross, lines may never share a line. Seven rules
// get there, and the invariant they exist to hold is checked by
// CollinearOverlaps, which every test in this package calls.
//
//	R1  Orthogonal only — horizontal and vertical runs, right-angle corners.
//	R2  Every vertical run owns a lane inside the channel it crosses.
//	R3  A lane is reused only when the two runs cannot touch.
//	R4  A horizontal run sits at its own jack's height.
//	R5  Two cables meeting at one jack share only the stub, and it is staggered.
//	R6  A line never passes beneath a box; it routes to the gutter and back.
//	R7  Crossings are drawn plain — no hops, no breaks.
//
// None of this has a counterpart on the canvas, which draws one curve per cable
// in the cable's own colour onto a plane that scrolls. Paper has neither colour
// to spare nor room to scroll, which is why this had to be written rather than
// ported.

// epsilon is the distance below which two coordinates are the same line. Well
// under the 0.35 mm a hairline is wide, so two runs this close are touching
// whatever the arithmetic says.
const epsilon = 0.05

// Segment is one straight run of a drawn cable.
type Segment struct {
	X1, Y1, X2, Y2 float64
	// Edge is which cable this run belongs to.
	Edge int
	// Stub marks the run that touches a jack. Two cables meeting at one jack
	// may share theirs, and nothing else may share anything.
	Stub bool
	// Anchor is the jack the stub touches, so the checker can tell a
	// permitted shared stub from a defect.
	Anchor FlowEndpoint
}

func (s Segment) horizontal() bool { return math.Abs(s.Y1-s.Y2) < epsilon }
func (s Segment) vertical() bool   { return math.Abs(s.X1-s.X2) < epsilon }

// RoutedEdge is one cable's whole path, and where its arrowhead points.
type RoutedEdge struct {
	Edge     FlowEdge
	Segments []Segment
	// TipX, TipY is the jack the arrowhead lands on.
	TipX, TipY float64
}

// FlowRouting is a whole drawing's worth of routed cables.
type FlowRouting struct {
	Edges []RoutedEdge
}

// Segments is every run in the drawing, which is what the invariant is checked
// over.
func (r FlowRouting) Segments() []Segment {
	var all []Segment
	for _, edge := range r.Edges {
		all = append(all, edge.Segments...)
	}
	return all
}

// Overlap is one pair of runs that share a line — a defect, reported with
// enough detail to find it in a fixture.
type Overlap struct {
	A, B    Segment
	Extent  float64
	Message string
}

// CollinearOverlaps is the invariant the whole routing exists to hold: no two
// runs are collinear over any shared length, except two stubs leaving the same
// jack.
//
// This is the function the tests call. R1 to R6 are how the router gets here;
// this is what "gets here" means.
func CollinearOverlaps(segments []Segment) []Overlap {
	var found []Overlap
	for i := 0; i < len(segments); i++ {
		for j := i + 1; j < len(segments); j++ {
			a, b := segments[i], segments[j]
			if a.Edge == b.Edge {
				continue
			}
			// Two cables meeting at the same jack genuinely are one line
			// where they meet — whether they leave it together or arrive on
			// it together. That is the only permitted sharing.
			if a.Stub && b.Stub && a.Anchor == b.Anchor {
				continue
			}

			switch {
			case a.horizontal() && b.horizontal() && math.Abs(a.Y1-b.Y1) < epsilon:
				if extent := overlapExtent(a.X1, a.X2, b.X1, b.X2); extent > epsilon {
					found = append(found, Overlap{a, b, extent,
						fmt.Sprintf("two horizontal runs share y=%.2f over %.2f mm", a.Y1, extent)})
				}
			case a.vertical() && b.vertical() && math.Abs(a.X1-b.X1) < epsilon:
				if extent := overlapExtent(a.Y1, a.Y2, b.Y1, b.Y2); extent > epsilon {
					found = append(found, Overlap{a, b, extent,
						fmt.Sprintf("two vertical runs share x=%.2f over %.2f mm", a.X1, extent)})
				}
			}
		}
	}
	return found
}

func overlapExtent(a1, a2, b1, b2 float64) float64 {
	aLo, aHi := math.Min(a1, a2), math.Max(a1, a2)
	bLo, bHi := math.Min(b1, b2), math.Max(b1, b2)
	return math.Min(aHi, bHi) - math.Max(aLo, bLo)
}

// column is one vertical band of boxes. Node positions are user-placed and
// arbitrary, so columns are derived per drawing rather than assumed.
type column struct {
	left, right float64
	top, bottom float64
	boxes       []NodeBox
}

// groupColumns buckets boxes into columns. The gaps between consecutive columns
// are the channels cables cross.
//
// Boxes are clustered by how close their centres are, not by whether their
// extents touch. Touching was the obvious rule and it is wrong: on any drawing
// where a box in one column overlaps a box in the next by a millimetre, the
// overlap chains, and every box on the page collapses into a single column with
// no channels in it at all. Clustering on centres keeps the columns a reader
// would point at.
func groupColumns(boxes []NodeBox) []column {
	if len(boxes) == 0 {
		return nil
	}
	ordered := append([]NodeBox(nil), boxes...)
	sort.SliceStable(ordered, func(i, j int) bool {
		return ordered[i].X+ordered[i].W/2 < ordered[j].X+ordered[j].W/2
	})

	// Half a box apart is a different column. Two boxes closer than that are
	// stacked, whatever their edges do.
	threshold := ordered[0].W * 0.6

	var columns []column
	current := columnOfBox(ordered[0])
	lastCentre := ordered[0].X + ordered[0].W/2
	for _, box := range ordered[1:] {
		centre := box.X + box.W/2
		if centre-lastCentre > threshold {
			columns = append(columns, current)
			current = columnOfBox(box)
		} else {
			current.left = math.Min(current.left, box.X)
			current.right = math.Max(current.right, box.X+box.W)
			current.top = math.Min(current.top, box.Y)
			current.bottom = math.Max(current.bottom, box.Y+box.H)
			current.boxes = append(current.boxes, box)
		}
		lastCentre = centre
	}
	return append(columns, current)
}

func columnOfBox(box NodeBox) column {
	return column{
		left: box.X, right: box.X + box.W,
		top: box.Y, bottom: box.Y + box.H,
		boxes: []NodeBox{box},
	}
}

// columnOf is which column a box belongs to.
func columnOf(columns []column, key string) int {
	for index, col := range columns {
		for _, box := range col.boxes {
			if box.Node.Key == key {
				return index
			}
		}
	}
	return -1
}

// channelDemand counts the lanes each channel is actually asked for, so the
// layout can reserve room before the drawing is scaled.
//
// It has to mirror the router exactly, including the cables that are easy to
// forget: one running backwards, or between two boxes in the same column, still
// takes a lane on each side of it. Counting only the left-to-right ones let a
// channel through at 12 mm that needed 13.6, and every cable in it piled onto
// the same line.
func channelDemand(graph FlowGraph, boxes []NodeBox, columns []column) map[int]int {
	demand := map[int]int{}
	for _, edge := range graph.Edges {
		from := columnOf(columns, edge.From.NodeKey)
		to := columnOf(columns, edge.To.NodeKey)
		if from < 0 || to < 0 {
			continue
		}
		// A cable leaves on the right of its source column and enters on the
		// left of its destination's — the same two channels the router picks.
		demand[from]++
		if to-1 != from {
			demand[to-1]++
		}
	}
	return demand
}

// run is one vertical or horizontal stretch waiting for a lane.
type run struct {
	edge     int
	lo, hi   float64
	sourceID string
	lane     int
}

// assignLanes is R2 and R3: greedy interval colouring over the runs' spans, so
// two runs share a lane only when they cannot touch. Runs leaving the same jack
// are forced apart as well, which is R5's staggering — the two cables then have
// stubs of different lengths and their split is visible.
func assignLanes(runs []run) int {
	ordered := make([]int, len(runs))
	for i := range ordered {
		ordered[i] = i
	}
	sort.SliceStable(ordered, func(a, b int) bool { return runs[ordered[a]].lo < runs[ordered[b]].lo })

	lanes := 0
	for _, index := range ordered {
		taken := map[int]bool{}
		for _, other := range ordered {
			if other == index || runs[other].lane == 0 {
				continue
			}
			conflict := overlapExtent(runs[index].lo, runs[index].hi, runs[other].lo, runs[other].hi) > epsilon
			sameJack := runs[index].sourceID != "" && runs[index].sourceID == runs[other].sourceID
			if conflict || sameJack {
				taken[runs[other].lane] = true
			}
		}
		lane := 1
		for taken[lane] {
			lane++
		}
		runs[index].lane = lane
		if lane > lanes {
			lanes = lane
		}
	}
	return lanes
}

// routeForm is how many corners a cable is drawn with.
//
// Three segments — out, across, in — is the readable default and what most
// cables get. But it cannot express a swap: when one cable runs from jack A to
// jack B and another from B to A, each one's horizontal at the other's height
// demands the opposite lane order, and no assignment satisfies both. Those
// cables get five segments, dropping to a carrier row between the two columns
// and back up, which separates the two families of horizontals into their own
// halves of the channel.
type routeForm int

const (
	formDirect routeForm = iota
	formCarrier
)

// plan is one cable's route before its lanes are known.
type plan struct {
	index      int
	edge       FlowEdge
	form       routeForm
	fromX      float64
	fromY      float64
	toX        float64
	toY        float64
	inChannel  int
	outChannel int
	// carrier is the height a five-segment cable crosses at. For a cable
	// routed around a box it is the gutter beside that box.
	carrier float64
	// gutterFixed marks a carrier that was chosen to clear a box rather than
	// to separate two cables, and so must not be moved.
	gutterFixed bool
	// lane1 and lane2 are the x of its verticals, filled in once assigned.
	lane1, lane2 float64
	sourceID     string
}

// RouteFlow turns a placed layout into drawable lines.
//
// Every cable starts on the readable three-segment form. The invariant is then
// checked, and any cable caught sharing ink is upgraded to the five-segment
// form and the whole channel re-routed. That loop is why the checker is written
// first: it is not only the test's oracle, it is the router's own.
func RouteFlow(graph FlowGraph, layout FlowLayout) FlowRouting {
	columns := groupColumns(layout.Boxes)
	if len(columns) == 0 {
		return FlowRouting{}
	}

	plans := buildPlans(graph, layout, columns)
	if len(plans) == 0 {
		return FlowRouting{}
	}
	carriers := carrierCandidates(layout.Boxes)
	top, bottom := verticalExtent(layout.Boxes)

	// Upgrade until clean. Each pass can only add carriers, and there are
	// finitely many cables, so the loop terminates at all-carrier.
	routing := assemble(plans, columns, carriers, layout.Boxes, top, bottom)
	for pass := 0; pass < len(plans)+1; pass++ {
		overlaps := CollinearOverlaps(routing.Segments())
		if len(overlaps) == 0 {
			break
		}
		if !upgrade(plans, overlaps) {
			break
		}
		routing = assemble(plans, columns, carriers, layout.Boxes, top, bottom)
	}
	return routing
}

// crossesBox reports whether a horizontal run at this height and reach would
// pass through any box.
func crossesBox(boxes []NodeBox, y, lo, hi float64) bool {
	for _, box := range boxes {
		if y <= box.Y+epsilon || y >= box.Y+box.H-epsilon {
			continue
		}
		if overlapExtent(lo, hi, box.X, box.X+box.W) > epsilon {
			return true
		}
	}
	return false
}

// verticalExtent is the band every box in the drawing sits inside.
func verticalExtent(boxes []NodeBox) (float64, float64) {
	top, bottom := math.Inf(1), math.Inf(-1)
	for _, box := range boxes {
		top = math.Min(top, box.Y)
		bottom = math.Max(bottom, box.Y+box.H)
	}
	if math.IsInf(top, 1) {
		return 0, 0
	}
	return top, bottom
}

// buildPlans works out each cable's endpoints, which channels it crosses, and
// whether a box stands in its way.
func buildPlans(graph FlowGraph, layout FlowLayout, columns []column) []*plan {
	var plans []*plan
	for index, edge := range graph.Edges {
		fromBox, okFrom := layout.Box(edge.From.NodeKey)
		toBox, okTo := layout.Box(edge.To.NodeKey)
		if !okFrom || !okTo {
			continue
		}
		if edge.From.Port >= fromBox.Node.PortCount(edge.From.Side) ||
			edge.To.Port >= toBox.Node.PortCount(edge.To.Side) {
			continue
		}

		fromCol := columnOf(columns, edge.From.NodeKey)
		toCol := columnOf(columns, edge.To.NodeKey)
		p := &plan{
			index:    index,
			edge:     edge,
			fromX:    fromBox.PortX(edge.From.Side),
			fromY:    fromBox.PortY(edge.From.Port),
			toX:      toBox.PortX(edge.To.Side),
			toY:      toBox.PortY(edge.To.Port),
			sourceID: fmt.Sprintf("%s|%s|%d", edge.From.NodeKey, edge.From.Side, edge.From.Port),
		}
		// A cable leaves its source box on the right and enters its
		// destination on the left, so it takes a lane in the space right of
		// the source's column and another in the space left of the
		// destination's. For an ordinary left-to-right cable those are the
		// same channel or two channels apart; for one that runs backwards
		// they are on opposite sides of it.
		p.inChannel = fromCol
		p.outChannel = toCol - 1

		switch {
		case toCol <= fromCol:
			// A backward cable — the destination is drawn level with or left
			// of the source, which the canvas allows and a device feeding a
			// box upstream of it produces. It cannot run straight: its own
			// source box stands on the route. So it leaves right, crosses in
			// a gutter clear of every box between the two columns inclusive,
			// and comes back in from the left.
			p.form = formCarrier
			p.carrier = gutterFor(columns, toCol, fromCol, true, p.fromY)
			p.gutterFixed = true

		case boxBetween(columns, fromCol, toCol, p.fromY) || boxBetween(columns, fromCol, toCol, p.toY):
			// R6. A box on the straight route is not something lane
			// assignment can fix, so this cable takes the carrier form from
			// the start, in the gutter beside the box rather than between the
			// jacks.
			p.form = formCarrier
			p.carrier = gutterFor(columns, fromCol, toCol, false, p.fromY)
			p.gutterFixed = true
		}
		plans = append(plans, p)
	}
	return plans
}

// upgrade moves cables caught sharing ink onto the carrier form. It reports
// whether anything changed — when nothing can be upgraded the loop has done
// what it can.
func upgrade(plans []*plan, overlaps []Overlap) bool {
	byIndex := map[int]*plan{}
	for _, p := range plans {
		byIndex[p.index] = p
	}
	changed := false
	for _, overlap := range overlaps {
		for _, index := range []int{overlap.A.Edge, overlap.B.Edge} {
			if p, ok := byIndex[index]; ok && p.form == formDirect {
				p.form = formCarrier
				changed = true
				break
			}
		}
	}
	return changed
}

// carrierCandidates are heights a cable may cross at. They are the midpoints
// between the jack heights present in the drawing, plus a band above and below
// everything — chosen that way so a carrier can never land on a jack's own
// height, which is the one place a horizontal run is not free to move.
func carrierCandidates(boxes []NodeBox) []float64 {
	var heights []float64
	top, bottom := math.Inf(1), math.Inf(-1)
	for _, box := range boxes {
		top = math.Min(top, box.Y)
		bottom = math.Max(bottom, box.Y+box.H)
		for i := 0; i < box.Node.Rows(); i++ {
			heights = append(heights, box.PortY(i))
		}
	}
	if len(heights) == 0 {
		return []float64{0}
	}
	sort.Float64s(heights)

	// A candidate is the midpoint of two adjacent jack heights, and only where
	// those two are far enough apart that the midpoint clears both by more
	// than the distance at which two runs count as the same line. A midpoint
	// three hundredths of a millimetre from a jack is a carrier row drawn on
	// top of that jack's own run-in.
	var candidates []float64
	for i := 0; i+1 < len(heights); i++ {
		if heights[i+1]-heights[i] > 2*minLaneGapMM {
			candidates = append(candidates, (heights[i]+heights[i+1])/2)
		}
	}
	// Room outside the boxes, for cables routed around one and for a drawing
	// so dense that every midpoint is taken.
	for offset := 1.0; offset <= 8; offset++ {
		candidates = append(candidates, top-offset*minLaneGapMM-edgeStubMM)
		candidates = append(candidates, bottom+offset*minLaneGapMM+edgeStubMM)
	}
	return candidates
}

// assemble assigns lanes and carriers to the current plans and draws them.
func assemble(plans []*plan, columns []column, carriers []float64, boxes []NodeBox, top, bottom float64) FlowRouting {
	assignCarriers(plans, carriers, boxes, top, bottom)

	// Verticals, per channel and per half.
	//
	// A carrier cable's two verticals take the left and right halves of the
	// channel, which is what keeps the two families of horizontals from ever
	// meeting: every entry run stays left of every exit run. A direct cable
	// has one vertical, and it joins the left half — not the whole channel —
	// wherever a carrier cable shares that channel, because two lane groups
	// assigned without knowledge of each other will hand out the same x.
	// Where a channel carries no carrier cables at all, a direct cable is free
	// to use the full width and sits down the middle of it.
	type slot struct {
		channel int
		half    int // 0 whole, 1 left, 2 right
	}
	carrierChannels := map[int]bool{}
	for _, p := range plans {
		if p.form == formCarrier {
			carrierChannels[p.inChannel] = true
			carrierChannels[p.outChannel] = true
		}
	}
	runsBySlot := map[slot][]*run{}
	owner := map[*run]*plan{}
	which := map[*run]int{}

	for _, p := range plans {
		if p.form == formDirect {
			r := &run{edge: p.index, lo: math.Min(p.fromY, p.toY), hi: math.Max(p.fromY, p.toY), sourceID: p.sourceID}
			half := 0
			if carrierChannels[p.inChannel] {
				half = 1
			}
			key := slot{p.inChannel, half}
			runsBySlot[key] = append(runsBySlot[key], r)
			owner[r], which[r] = p, 1
			continue
		}
		first := &run{edge: p.index, lo: math.Min(p.fromY, p.carrier), hi: math.Max(p.fromY, p.carrier), sourceID: p.sourceID}
		second := &run{edge: p.index, lo: math.Min(p.carrier, p.toY), hi: math.Max(p.carrier, p.toY)}
		firstKey := slot{p.inChannel, 1}
		secondKey := slot{p.outChannel, 2}
		runsBySlot[firstKey] = append(runsBySlot[firstKey], first)
		runsBySlot[secondKey] = append(runsBySlot[secondKey], second)
		owner[first], which[first] = p, 1
		owner[second], which[second] = p, 2
	}

	for key, runs := range runsBySlot {
		values := make([]run, len(runs))
		for i, r := range runs {
			values[i] = *r
		}
		lanes := assignLanes(values)
		for i, r := range runs {
			x := laneWithin(columns, key.channel, values[i].lane, lanes, key.half)
			if which[r] == 1 {
				owner[r].lane1 = x
			} else {
				owner[r].lane2 = x
			}
		}
	}

	routing := FlowRouting{}
	for _, p := range plans {
		routing.Edges = append(routing.Edges, RoutedEdge{
			Edge:     p.edge,
			Segments: p.segments(),
			TipX:     p.toX,
			TipY:     p.toY,
		})
	}
	return routing
}

// segments draws one planned cable.
func (p *plan) segments() []Segment {
	var out []Segment
	// A run that touches a jack is a stub, anchored to it. The two ends of a
	// cable are both stubs: one leaves its source jack, one arrives on its
	// destination, and each may be shared with another cable meeting the same
	// jack — a fan-out and a fan-in are the same physical truth.
	add := func(x1, y1, x2, y2 float64, anchor *FlowEndpoint) {
		if math.Abs(x1-x2) < epsilon && math.Abs(y1-y2) < epsilon {
			return
		}
		seg := Segment{X1: x1, Y1: y1, X2: x2, Y2: y2, Edge: p.index}
		if anchor != nil {
			seg.Stub = true
			seg.Anchor = *anchor
		}
		out = append(out, seg)
	}
	from, to := p.edge.From, p.edge.To

	if p.form == formDirect {
		add(p.fromX, p.fromY, p.lane1, p.fromY, &from)
		add(p.lane1, p.fromY, p.lane1, p.toY, nil)
		add(p.lane1, p.toY, p.toX, p.toY, &to)
		return out
	}
	add(p.fromX, p.fromY, p.lane1, p.fromY, &from)
	add(p.lane1, p.fromY, p.lane1, p.carrier, nil)
	add(p.lane1, p.carrier, p.lane2, p.carrier, nil)
	add(p.lane2, p.carrier, p.lane2, p.toY, nil)
	add(p.lane2, p.toY, p.toX, p.toY, &to)
	return out
}

// assignCarriers gives each carrier-form cable a height to cross at, so that no
// two carriers at the same height ever overlap in x.
//
// A cable routed around a box keeps the side it was given and is only ever
// pushed further out from the boxes, never back in between them: the gutter is
// where it is for a reason, and a "free" height in the middle of the drawing
// would put it straight back through what it was avoiding. Every other cable
// takes the nearest free midpoint between its two jacks.
func assignCarriers(plans []*plan, candidates []float64, boxes []NodeBox, top, bottom float64) {
	// Every jack height in the drawing. A carrier row must clear all of them,
	// not just those of the boxes it happens to pass — a run-in at a jack is a
	// horizontal like any other, and a carrier a hundredth of a millimetre
	// away from one is drawn on top of it.
	var jackHeights []float64
	for _, box := range boxes {
		for i := 0; i < box.Node.Rows(); i++ {
			jackHeights = append(jackHeights, box.PortY(i))
		}
	}
	clearOfJacks := func(y float64) bool {
		for _, height := range jackHeights {
			if math.Abs(height-y) < minLaneGapMM {
				return false
			}
		}
		return true
	}

	// Heights are compared with a tolerance rather than looked up by value.
	// Carrier heights are reached by repeated addition, so two cables on what
	// is visibly the same line differ in the last bits — and a map keyed on
	// the float treats them as two lines and lets them share ink.
	type claim struct{ y, lo, hi float64 }
	var taken []claim

	free := func(y float64, lo, hi float64) bool {
		for _, other := range taken {
			if math.Abs(other.y-y) > epsilon {
				continue
			}
			if overlapExtent(lo, hi, other.lo, other.hi) > epsilon {
				return false
			}
		}
		return true
	}
	claimHeight := func(y, lo, hi float64) { taken = append(taken, claim{y, lo, hi}) }

	for _, p := range plans {
		if p.form != formCarrier {
			continue
		}
		// The lanes are not assigned yet, and a backward cable's lanes sit
		// outside its own endpoints, so the reach is padded by the widest a
		// lane margin can be. Over-estimating costs an occasional extra
		// carrier row; under-estimating puts two cables on one line.
		reachLo := math.Min(p.fromX, p.toX) - 4*edgeStubMM
		reachHi := math.Max(p.fromX, p.toX) + 4*edgeStubMM

		if p.gutterFixed {
			var step float64
			if p.carrier > (top+bottom)/2 {
				// Below the boxes: further out is further down.
				step = minLaneGapMM
			} else {
				step = -minLaneGapMM
			}
			y := p.carrier
			for attempt := 0; attempt < 256; attempt++ {
				if clearOfJacks(y) && !crossesBox(boxes, y, reachLo, reachHi) && free(y, reachLo, reachHi) {
					break
				}
				y += step
			}
			p.carrier = y
			claimHeight(y, reachLo, reachHi)
			continue
		}

		ordered := append([]float64(nil), candidates...)
		mid := (p.fromY + p.toY) / 2
		sort.SliceStable(ordered, func(a, b int) bool {
			return math.Abs(ordered[a]-mid) < math.Abs(ordered[b]-mid)
		})
		placed := false
		for _, candidate := range ordered {
			// R6 again, for the carrier row itself: a height that is free of
			// other cables is no use if the run across it goes through a box.
			if crossesBox(boxes, candidate, reachLo, reachHi) {
				continue
			}
			if free(candidate, reachLo, reachHi) {
				p.carrier = candidate
				claimHeight(candidate, reachLo, reachHi)
				placed = true
				break
			}
		}
		if !placed {
			// Every midpoint is spoken for. Go outside the boxes and keep
			// stepping down until there is room.
			y := bottom + edgeStubMM
			for attempt := 0; attempt < 512; attempt++ {
				if clearOfJacks(y) && !crossesBox(boxes, y, reachLo, reachHi) && free(y, reachLo, reachHi) {
					break
				}
				y += minLaneGapMM
			}
			p.carrier = y
			claimHeight(y, reachLo, reachHi)
		}
	}
}

// laneWithin spreads lanes evenly across a channel, inside the stub on either
// side. `half` selects the left or right part of the channel — 0 for a cable
// that owns the whole width, 1 and 2 for the two verticals of a carrier route,
// which must stay on their own sides so their horizontals never meet.
func laneWithin(columns []column, channel, lane, lanes, half int) float64 {
	if len(columns) == 0 {
		return 0
	}
	// Channel -1 is the margin left of the first column, and the last index is
	// the margin right of the last one. A cable running backwards needs both.
	var left, right float64
	switch {
	case channel < 0:
		right = columns[0].left
		left = right - 4*edgeStubMM
	case channel >= len(columns)-1:
		left = columns[len(columns)-1].right
		right = left + 4*edgeStubMM
	default:
		left = columns[channel].right
		right = columns[channel+1].left
	}

	// The stub belongs to the channel, not to each half of it. Insetting both
	// halves separately spent four stub-widths in a channel that only has room
	// for two, and left the lanes a fraction of a millimetre apart.
	inner, outer := left+edgeStubMM, right-edgeStubMM
	if outer <= inner {
		inner, outer = left, right
	}
	switch half {
	case 1:
		outer = inner + (outer-inner)/2
	case 2:
		inner = inner + (outer-inner)/2
	}

	usable := outer - inner
	if usable <= 0 {
		return inner
	}
	if lanes <= 0 {
		return inner + usable/2
	}
	return inner + usable*float64(lane)/float64(lanes+1)
}

// boxBetween reports whether any box in the columns a cable crosses stands at
// this height — the test R6 turns on.
func boxBetween(columns []column, fromCol, toCol int, y float64) bool {
	lo, hi := fromCol+1, toCol-1
	if fromCol > toCol {
		lo, hi = toCol+1, fromCol-1
	}
	for index := lo; index <= hi && index < len(columns); index++ {
		if index < 0 {
			continue
		}
		for _, box := range columns[index].boxes {
			if y > box.Y-epsilon && y < box.Y+box.H+epsilon {
				return true
			}
		}
	}
	return false
}

// gutterFor is the free band above or below the boxes a cable has to clear,
// whichever is closer to where it starts. `inclusive` covers the source and
// destination columns as well, which a backward cable needs because its own
// boxes stand on its route.
func gutterFor(columns []column, fromCol, toCol int, inclusive bool, y float64) float64 {
	lo, hi := fromCol+1, toCol-1
	if fromCol > toCol {
		lo, hi = toCol+1, fromCol-1
	}
	if inclusive {
		lo, hi = fromCol, toCol
		if fromCol > toCol {
			lo, hi = toCol, fromCol
		}
	}
	top, bottom := math.Inf(1), math.Inf(-1)
	for index := lo; index <= hi && index < len(columns); index++ {
		if index < 0 {
			continue
		}
		top = math.Min(top, columns[index].top)
		bottom = math.Max(bottom, columns[index].bottom)
	}
	if math.IsInf(top, 1) {
		return y
	}
	above := top - edgeStubMM
	below := bottom + edgeStubMM
	if math.Abs(y-above) <= math.Abs(y-below) {
		return above
	}
	return below
}
