package service

import (
	"fmt"
	"math"
	"math/rand"
	"sort"
	"testing"
)

// The A4 landscape text block the flow sections are drawn into.
const (
	testBlockW = 273.0
	testBlockH = 140.0
)

// box builds a node with n jacks on each side at a canvas position.
func testNode(key string, x, y float64, in, out int) FlowNode {
	node := FlowNode{Key: key, Title: key, X: x, Y: y, Footer: "footer"}
	for i := 0; i < in; i++ {
		node.Inputs = append(node.Inputs, FlowPort{Label: fmt.Sprintf("In %d", i+1)})
	}
	for i := 0; i < out; i++ {
		node.Outputs = append(node.Outputs, FlowPort{Label: fmt.Sprintf("Out %d", i+1)})
	}
	return node
}

func edge(fromKey string, fromPort int, toKey string, toPort int) FlowEdge {
	return FlowEdge{
		From: FlowEndpoint{NodeKey: fromKey, Side: SideOut, Port: fromPort},
		To:   FlowEndpoint{NodeKey: toKey, Side: SideIn, Port: toPort},
	}
}

// assertNoOverlap is the whole point of this file: run the invariant and report
// every pair that shares a line.
func assertNoOverlap(t *testing.T, routing FlowRouting) {
	t.Helper()
	overlaps := CollinearOverlaps(routing.Segments())
	for _, overlap := range overlaps {
		t.Errorf("cables %d and %d share ink: %s", overlap.A.Edge, overlap.B.Edge, overlap.Message)
	}
}

// assertOrthogonal is R1.
func assertOrthogonal(t *testing.T, routing FlowRouting) {
	t.Helper()
	for _, segment := range routing.Segments() {
		if !segment.horizontal() && !segment.vertical() {
			t.Errorf("cable %d has a diagonal run (%.2f,%.2f)-(%.2f,%.2f)",
				segment.Edge, segment.X1, segment.Y1, segment.X2, segment.Y2)
		}
	}
}

// The path the document actually takes: placed, routed, then framed with its
// cables included.
func routeGraph(graph FlowGraph) (FlowLayout, FlowRouting) {
	return LayoutAndRouteFlow(graph, testBlockW, testBlockH)
}

func TestOneCableIsTwoCornersAndNoOverlap(t *testing.T) {
	graph := FlowGraph{
		Nodes: []FlowNode{
			testNode("a", 0, 0, 0, 4),
			testNode("b", 600, 100, 4, 0),
		},
		Edges: []FlowEdge{edge("a", 0, "b", 2)},
	}
	_, routing := routeGraph(graph)

	assertOrthogonal(t, routing)
	assertNoOverlap(t, routing)
	if len(routing.Edges) != 1 {
		t.Fatalf("routed %d cables, want 1", len(routing.Edges))
	}
	if got := len(routing.Edges[0].Segments); got != 3 {
		t.Errorf("segments = %d, want 3 (stub, drop, run-in)", got)
	}
}

// R2 and R3, on the case the mockup calls out: eight cables fanning into one
// box across one channel. Drawn the obvious way, six of them share ink.
func TestFanIntoOneBoxGivesEveryCableItsOwnLane(t *testing.T) {
	graph := FlowGraph{
		Nodes: []FlowNode{
			testNode("sources", 0, 30, 0, 8),
			testNode("stagebox", 700, 0, 8, 8),
		},
	}
	for i := 0; i < 8; i++ {
		graph.Edges = append(graph.Edges, edge("sources", i, "stagebox", i))
	}
	_, routing := routeGraph(graph)

	assertOrthogonal(t, routing)
	assertNoOverlap(t, routing)

	// The lanes actually used are spread far enough apart to read as separate
	// lines. R2 is worth nothing if it hands out lanes a quarter of a
	// millimetre apart — that is the failure design.md flags as its own risk.
	var lanes []float64
	seen := map[float64]bool{}
	for _, segment := range routing.Segments() {
		if !segment.vertical() {
			continue
		}
		x := math.Round(segment.X1*100) / 100
		if !seen[x] {
			seen[x] = true
			lanes = append(lanes, x)
		}
	}
	if len(lanes) < 2 {
		t.Fatalf("lanes = %d — eight cables did not fan out at all", len(lanes))
	}
	sort.Float64s(lanes)
	for i := 0; i+1 < len(lanes); i++ {
		if gap := lanes[i+1] - lanes[i]; gap < minLaneGapMM {
			t.Errorf("lanes %.2f and %.2f are %.2f mm apart, closer than the %.2f mm floor",
				lanes[i], lanes[i+1], gap, minLaneGapMM)
		}
	}
}

// R3's other half: a lane may serve twice when the two runs cannot touch.
func TestALaneIsReusedWhenTheRunsCannotTouch(t *testing.T) {
	graph := FlowGraph{
		Nodes: []FlowNode{
			testNode("upper", 0, 0, 0, 2),
			testNode("lower", 0, 900, 0, 2),
			testNode("boxUpper", 700, 40, 2, 0),
			testNode("boxLower", 700, 940, 2, 0),
		},
		Edges: []FlowEdge{
			edge("upper", 0, "boxUpper", 0),
			edge("upper", 1, "boxUpper", 1),
			edge("lower", 0, "boxLower", 0),
			edge("lower", 1, "boxLower", 1),
		},
	}
	_, routing := routeGraph(graph)

	assertNoOverlap(t, routing)

	lanes := map[float64]bool{}
	for _, segment := range routing.Segments() {
		if segment.vertical() {
			lanes[math.Round(segment.X1*100)/100] = true
		}
	}
	// Four cables, but only two lanes are needed: the lower pair's runs start
	// well below where the upper pair's end.
	if len(lanes) > 2 {
		t.Errorf("lanes = %d, want at most 2 — a lane should be reused when the runs cannot touch", len(lanes))
	}
}

// R5: one jack feeding two destinations shares only the stub, and the stubs are
// staggered so the split is visible.
func TestOneJackFeedingTwoPlacesSplitsVisibly(t *testing.T) {
	graph := FlowGraph{
		Nodes: []FlowNode{
			testNode("src", 0, 200, 0, 1),
			testNode("up", 700, 0, 1, 0),
			testNode("down", 700, 500, 1, 0),
		},
		Edges: []FlowEdge{
			edge("src", 0, "up", 0),
			edge("src", 0, "down", 0),
		},
	}
	_, routing := routeGraph(graph)

	assertOrthogonal(t, routing)
	// The shared stub is permitted; anything else is not.
	assertNoOverlap(t, routing)

	// The two runs leaving the shared jack, as opposed to the two arriving at
	// their separate destinations.
	var stubs []Segment
	for _, segment := range routing.Segments() {
		if segment.Stub && segment.Anchor.NodeKey == "src" {
			stubs = append(stubs, segment)
		}
	}
	if len(stubs) != 2 {
		t.Fatalf("stubs off the shared jack = %d, want 2", len(stubs))
	}
	// Staggered: the two cables turn at different distances from the jack, so
	// a reader can see where they part.
	if math.Abs(stubs[0].X2-stubs[1].X2) < epsilon {
		t.Error("both cables turn at the same point — the split is invisible")
	}
}

// R6: a box in the way is routed around, never under.
func TestACableRoutesAroundABoxInTheWay(t *testing.T) {
	graph := FlowGraph{
		Nodes: []FlowNode{
			testNode("left", 0, 200, 0, 1),
			testNode("middle", 500, 150, 4, 4),
			testNode("right", 1000, 200, 1, 0),
		},
		Edges: []FlowEdge{edge("left", 0, "right", 0)},
	}
	layout, routing := routeGraph(graph)

	assertOrthogonal(t, routing)
	assertNoOverlap(t, routing)

	middle, ok := layout.Box("middle")
	if !ok {
		t.Fatal("middle box not placed")
	}
	for _, segment := range routing.Segments() {
		if !segment.horizontal() {
			continue
		}
		crossesX := math.Min(segment.X1, segment.X2) < middle.X+middle.W &&
			math.Max(segment.X1, segment.X2) > middle.X
		insideY := segment.Y1 > middle.Y+epsilon && segment.Y1 < middle.Y+middle.H-epsilon
		if crossesX && insideY {
			t.Errorf("a run passes beneath the box in the way at y=%.2f (box spans %.2f-%.2f)",
				segment.Y1, middle.Y, middle.Y+middle.H)
		}
	}
}

// R7: crossings are legal, and are left as plain intersections — no hop arcs,
// no gap breaks, nothing added at the meeting point.
//
// A swap is the expensive kind of crossing. Out 1 to in 2 and out 2 to in 1
// cannot be drawn with one corner each: whichever lane order suits one cable's
// horizontals is wrong for the other's, and equal lanes put both verticals on
// the same line. So the two cables drop to a carrier row between the columns.
// That is not a cable dodging another — it is the only orthogonal route a swap
// has.
func TestCrossingCablesAreLeftAlone(t *testing.T) {
	graph := FlowGraph{
		Nodes: []FlowNode{
			testNode("a", 0, 0, 0, 2),
			testNode("b", 700, 0, 2, 0),
		},
		// Deliberately swapped, so the two cables must cross.
		Edges: []FlowEdge{
			edge("a", 0, "b", 1),
			edge("a", 1, "b", 0),
		},
	}
	_, routing := routeGraph(graph)

	assertOrthogonal(t, routing)
	assertNoOverlap(t, routing)

	// The two cables do cross, and nothing is drawn at the crossing: every run
	// is one straight line from end to end, with no break and no third
	// coordinate inserted where they meet.
	if !segmentsCross(routing) {
		t.Error("the two cables never cross, but their endpoints are swapped")
	}
	for _, routed := range routing.Edges {
		if len(routed.Segments) > 5 {
			t.Errorf("a swapped cable has %d runs, want at most 5", len(routed.Segments))
		}
	}
}

// segmentsCross reports whether any horizontal run of one cable meets a
// vertical run of another at a right angle.
func segmentsCross(routing FlowRouting) bool {
	segments := routing.Segments()
	for _, a := range segments {
		if !a.horizontal() {
			continue
		}
		for _, b := range segments {
			if b.Edge == a.Edge || !b.vertical() {
				continue
			}
			withinX := b.X1 > math.Min(a.X1, a.X2)+epsilon && b.X1 < math.Max(a.X1, a.X2)-epsilon
			withinY := a.Y1 > math.Min(b.Y1, b.Y2)+epsilon && a.Y1 < math.Max(b.Y1, b.Y2)-epsilon
			if withinX && withinY {
				return true
			}
		}
	}
	return false
}

// The mockup's own graph, at the size it was drawn.
func TestTheMockupGraphRoutesClean(t *testing.T) {
	graph := FlowGraph{
		Nodes: []FlowNode{
			testNode("sources", 0, 80, 0, 10),
			testNode("vocals", 0, 330, 0, 4),
			testNode("sb1", 330, 55, 8, 8),
			testNode("sb3", 330, 380, 5, 5),
			testNode("multi", 640, 130, 8, 8),
			testNode("desk", 940, 85, 5, 0),
		},
	}
	for i := 0; i < 8; i++ {
		graph.Edges = append(graph.Edges, edge("sources", i, "sb1", i))
	}
	graph.Edges = append(graph.Edges,
		edge("sources", 8, "sb3", 0),
		edge("sources", 9, "sb3", 1),
		edge("vocals", 0, "sb3", 2),
		edge("vocals", 1, "sb3", 3),
		edge("vocals", 2, "sb3", 4),
		edge("sb1", 0, "multi", 0),
		edge("sb1", 1, "multi", 1),
		edge("sb1", 2, "multi", 2),
		edge("sb1", 3, "multi", 3),
		edge("sb3", 0, "multi", 4),
		edge("sb3", 1, "multi", 5),
		edge("sb3", 2, "multi", 6),
		edge("sb1", 7, "desk", 3), // the skip that must route around the multi
		edge("multi", 0, "desk", 0),
		edge("multi", 1, "desk", 1),
		edge("multi", 2, "desk", 2),
	)

	_, routing := routeGraph(graph)
	assertOrthogonal(t, routing)
	assertNoOverlap(t, routing)

	// 3.8 — every cable drawn exactly once.
	if len(routing.Edges) != len(graph.Edges) {
		t.Errorf("routed %d cables, want %d", len(routing.Edges), len(graph.Edges))
	}
}

// The dense-channel case design.md flags as the risk R2 could defeat: many
// cables between two boxes that sit close together.
func TestADenseChannelStillGivesEveryCableItsOwnLane(t *testing.T) {
	graph := FlowGraph{
		Nodes: []FlowNode{
			testNode("a", 0, 0, 0, 30),
			testNode("b", 260, 0, 30, 0),
		},
	}
	for i := 0; i < 30; i++ {
		graph.Edges = append(graph.Edges, edge("a", i, "b", 29-i))
	}
	_, routing := routeGraph(graph)

	assertOrthogonal(t, routing)
	assertNoOverlap(t, routing)
}

// A sweep over randomly arranged graphs. The invariant is not a property of the
// fixtures — it has to hold for whatever a planner drags onto the canvas.
//
// Nodes are placed on a jittered grid rather than at free random coordinates,
// because free coordinates produce boxes sitting on top of each other. A
// drawing whose boxes overlap has cables that share ink and nothing can be done
// about it: the document reproduces the arrangement it was given rather than
// inventing a better one, which flow_layout.go says in as many words. What is
// under test here is every arrangement in which the boxes are apart.
func TestRandomGraphsHoldTheInvariant(t *testing.T) {
	for seed := int64(1); seed <= 12; seed++ {
		random := rand.New(rand.NewSource(seed))
		runRandomTrials(t, random, seed)
	}
}

func runRandomTrials(t *testing.T, random *rand.Rand, seed int64) {
	t.Helper()
	for trial := 0; trial < 120; trial++ {
		nodeCount := 2 + random.Intn(8)
		graph := FlowGraph{}
		for i := 0; i < nodeCount; i++ {
			column := i % 4
			row := i / 4
			graph.Nodes = append(graph.Nodes, testNode(
				fmt.Sprintf("n%d", i),
				float64(column*600+random.Intn(120)),
				float64(row*700+random.Intn(250)),
				1+random.Intn(14),
				1+random.Intn(14),
			))
		}
		edgeCount := random.Intn(40)
		for i := 0; i < edgeCount; i++ {
			from := random.Intn(nodeCount)
			to := random.Intn(nodeCount)
			if from == to {
				continue
			}
			fromNode := graph.Nodes[from]
			toNode := graph.Nodes[to]
			graph.Edges = append(graph.Edges, edge(
				fromNode.Key, random.Intn(len(fromNode.Outputs)),
				toNode.Key, random.Intn(len(toNode.Inputs)),
			))
		}

		_, routing := routeGraph(graph)
		if overlaps := CollinearOverlaps(routing.Segments()); len(overlaps) > 0 {
			t.Fatalf("seed %d trial %d: %d cables share ink, first: %s",
				seed, trial, len(overlaps), overlaps[0].Message)
		}
		for _, segment := range routing.Segments() {
			if !segment.horizontal() && !segment.vertical() {
				t.Fatalf("seed %d trial %d: diagonal run", seed, trial)
			}
		}
		// 3.8 — every cable is drawn, exactly once.
		if len(routing.Edges) != len(graph.Edges) {
			t.Fatalf("seed %d trial %d: routed %d of %d cables",
				seed, trial, len(routing.Edges), len(graph.Edges))
		}
	}
}

// The checker itself has to be right, or every test above is worthless.
func TestCollinearOverlapsCatchesWhatItShould(t *testing.T) {
	shared := []Segment{
		{X1: 0, Y1: 10, X2: 50, Y2: 10, Edge: 1},
		{X1: 20, Y1: 10, X2: 70, Y2: 10, Edge: 2},
	}
	if got := CollinearOverlaps(shared); len(got) != 1 {
		t.Errorf("overlapping horizontals reported %d times, want 1", len(got))
	}

	crossing := []Segment{
		{X1: 0, Y1: 10, X2: 50, Y2: 10, Edge: 1},
		{X1: 25, Y1: 0, X2: 25, Y2: 40, Edge: 2},
	}
	if got := CollinearOverlaps(crossing); len(got) != 0 {
		t.Errorf("a crossing was reported as an overlap: %v", got)
	}

	touching := []Segment{
		{X1: 0, Y1: 10, X2: 50, Y2: 10, Edge: 1},
		{X1: 50, Y1: 10, X2: 90, Y2: 10, Edge: 2},
	}
	if got := CollinearOverlaps(touching); len(got) != 0 {
		t.Errorf("two runs meeting end to end were reported as an overlap: %v", got)
	}

	jack := FlowEndpoint{NodeKey: "a", Side: SideOut, Port: 0}
	stubs := []Segment{
		{X1: 0, Y1: 10, X2: 30, Y2: 10, Edge: 1, Stub: true, Anchor: jack},
		{X1: 0, Y1: 10, X2: 50, Y2: 10, Edge: 2, Stub: true, Anchor: jack},
	}
	if got := CollinearOverlaps(stubs); len(got) != 0 {
		t.Errorf("two stubs off one jack were reported as an overlap: %v", got)
	}

	otherJack := jack
	otherJack.Port = 1
	notStubs := []Segment{
		{X1: 0, Y1: 10, X2: 30, Y2: 10, Edge: 1, Stub: true, Anchor: jack},
		{X1: 0, Y1: 10, X2: 50, Y2: 10, Edge: 2, Stub: true, Anchor: otherJack},
	}
	if got := CollinearOverlaps(notStubs); len(got) != 1 {
		t.Errorf("stubs off different jacks reported %d times, want 1", len(got))
	}
}
