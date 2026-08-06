package service

import (
	"fmt"
	"math"
	"testing"
)

func TestNodeSizeIsAFunctionOfItsJacks(t *testing.T) {
	cases := []struct {
		name   string
		rows   int
		footer string
		want   float64
	}{
		{"no jacks, no footer", 0, "", nodeHeaderMM},
		{"no jacks, footer", 0, "8 in / 8 out", nodeHeaderMM + nodeFooterMM},
		{"one jack", 1, "x", nodeHeaderMM + portRowMM + nodeFooterMM},
		{"a full stagebox", 32, "x", nodeHeaderMM + 32*portRowMM + nodeFooterMM},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			node := testNode("n", 0, 0, test.rows, 0)
			node.Footer = test.footer
			width, height := nodeSize(node, 1)
			if width != nodeWidthMM {
				t.Errorf("width = %v, want %v", width, nodeWidthMM)
			}
			if math.Abs(height-test.want) > 0.001 {
				t.Errorf("height = %v, want %v", height, test.want)
			}
		})
	}

	// A box is drawn from its two sides side by side, so its height comes from
	// the taller one and not from their sum.
	node := testNode("n", 0, 0, 3, 8)
	_, height := nodeSize(node, 1)
	if want := nodeHeaderMM + 8*portRowMM + nodeFooterMM; math.Abs(height-want) > 0.001 {
		t.Errorf("mixed-side height = %v, want %v (the taller side)", height, want)
	}
}

func TestPortYWalksDownTheBox(t *testing.T) {
	box := NodeBox{Node: testNode("n", 0, 0, 4, 0), X: 10, Y: 20, W: nodeWidthMM, H: 24}
	first := box.PortY(0)
	second := box.PortY(1)
	if got := second - first; math.Abs(got-portRowMM) > 0.001 {
		t.Errorf("jacks are %v apart, want the row height %v", got, portRowMM)
	}
	if first <= box.Y+nodeHeaderMM {
		t.Errorf("the first jack at %v is inside the header", first)
	}
}

func TestFitPreservesTheArrangement(t *testing.T) {
	graph := FlowGraph{Nodes: []FlowNode{
		testNode("left", 100, 500, 0, 4),
		testNode("middle", 800, 100, 4, 4),
		testNode("right", 1500, 900, 4, 0),
	}}
	layout := LayoutFlow(graph, testBlockW, testBlockH)

	left, _ := layout.Box("left")
	middle, _ := layout.Box("middle")
	right, _ := layout.Box("right")

	if !(left.X < middle.X && middle.X < right.X) {
		t.Errorf("the left-to-right order changed: %v, %v, %v", left.X, middle.X, right.X)
	}
	if !(middle.Y < left.Y && left.Y < right.Y) {
		t.Errorf("the top-to-bottom order changed: %v, %v, %v", middle.Y, left.Y, right.Y)
	}
	for _, box := range layout.Boxes {
		if box.X < -0.001 || box.Y < -0.001 {
			t.Errorf("%s is placed off the top or left at (%v,%v)", box.Node.Key, box.X, box.Y)
		}
		if box.X+box.W > testBlockW+0.001 || box.Y+box.H > testBlockH+0.001 {
			t.Errorf("%s runs off the block at (%v,%v) size %vx%v", box.Node.Key, box.X, box.Y, box.W, box.H)
		}
	}
	if layout.Tiled() {
		t.Error("a three-box graph needed tiling")
	}
}

// A graph the planner pushed into negative coordinates is placed the same way
// as one that starts at the origin — the arrangement is what matters, not where
// its numbers happen to start.
func TestNegativeCanvasCoordinatesArePlacedTheSame(t *testing.T) {
	base := FlowGraph{Nodes: []FlowNode{
		testNode("a", 0, 0, 0, 3),
		testNode("b", 700, 200, 3, 0),
	}}
	shifted := FlowGraph{Nodes: []FlowNode{
		testNode("a", -900, -400, 0, 3),
		testNode("b", -200, -200, 3, 0),
	}}

	one := LayoutFlow(base, testBlockW, testBlockH)
	two := LayoutFlow(shifted, testBlockW, testBlockH)
	for _, key := range []string{"a", "b"} {
		first, _ := one.Box(key)
		second, _ := two.Box(key)
		if math.Abs(first.X-second.X) > 0.001 || math.Abs(first.Y-second.Y) > 0.001 {
			t.Errorf("%s placed at (%v,%v) and (%v,%v)", key, first.X, first.Y, second.X, second.Y)
		}
	}
}

// The legibility floor: a drawing is never shrunk past the point where its jack
// labels stop being readable. Below that it tiles instead.
func TestAGraphTooLargeToFitTilesRatherThanShrinking(t *testing.T) {
	graph := FlowGraph{}
	for i := 0; i < 14; i++ {
		graph.Nodes = append(graph.Nodes, testNode(
			fmt.Sprintf("n%d", i),
			float64((i%5)*450),
			float64((i/5)*800),
			24, 24,
		))
	}
	layout := LayoutFlow(graph, testBlockW, testBlockH)

	if !layout.Tiled() {
		t.Fatal("fourteen full stageboxes fitted one page — the floor is not being honoured")
	}
	if layout.Shrink < minPortLabelPt/portLabelPt-0.001 {
		t.Errorf("shrink = %v, below the %v floor", layout.Shrink, minPortLabelPt/portLabelPt)
	}
	if got := portLabelPt * layout.Shrink; got < minPortLabelPt-0.001 {
		t.Errorf("jack labels would print at %.2f pt, below the %v pt floor", got, minPortLabelPt)
	}
}

func TestTilesCoverThePlaneAndCutNoBox(t *testing.T) {
	graph := FlowGraph{}
	for i := 0; i < 14; i++ {
		graph.Nodes = append(graph.Nodes, testNode(
			fmt.Sprintf("n%d", i),
			float64((i%5)*450),
			float64((i/5)*800),
			24, 24,
		))
	}
	layout := LayoutFlow(graph, testBlockW, testBlockH)
	if !layout.Tiled() {
		t.Skip("this graph fitted one page; the cut is not under test")
	}

	// No cut falls inside a box.
	for _, tile := range layout.Tiles {
		for _, box := range layout.Boxes {
			for _, cut := range []float64{tile.X, tile.X + tile.W} {
				if cut > box.X+epsilon && cut < box.X+box.W-epsilon {
					t.Errorf("a vertical cut at %v runs through %s (%v..%v)",
						cut, box.Node.Key, box.X, box.X+box.W)
				}
			}
			for _, cut := range []float64{tile.Y, tile.Y + tile.H} {
				if cut > box.Y+epsilon && cut < box.Y+box.H-epsilon {
					t.Errorf("a horizontal cut at %v runs through %s (%v..%v)",
						cut, box.Node.Key, box.Y, box.Y+box.H)
				}
			}
		}
	}

	// Every box lands on some tile, so nothing is lost between pages.
	for _, box := range layout.Boxes {
		placed := false
		for _, tile := range layout.Tiles {
			if box.X >= tile.X-epsilon && box.X < tile.X+tile.W+epsilon &&
				box.Y >= tile.Y-epsilon && box.Y < tile.Y+tile.H+epsilon {
				placed = true
			}
		}
		if !placed {
			t.Errorf("%s at (%v,%v) is on no page", box.Node.Key, box.X, box.Y)
		}
	}
}

func TestTheScaleIsReportedForThePageToState(t *testing.T) {
	graph := FlowGraph{Nodes: []FlowNode{
		testNode("a", 0, 0, 0, 4),
		testNode("b", 900, 300, 4, 0),
	}}
	layout := LayoutFlow(graph, testBlockW, testBlockH)
	if layout.Scale <= 0 {
		t.Errorf("scale = %v, which the page cannot state", layout.Scale)
	}
	// The scale means what it says: two boxes 900 canvas units apart are
	// 900 × scale millimetres apart on paper.
	a, _ := layout.Box("a")
	b, _ := layout.Box("b")
	if want := 900 * layout.Scale; math.Abs((b.X-a.X)-want) > 0.001 {
		t.Errorf("boxes are %v mm apart but the stated scale implies %v", b.X-a.X, want)
	}
}

func TestAnEmptyGraphStillLaysOut(t *testing.T) {
	layout := LayoutFlow(FlowGraph{}, testBlockW, testBlockH)
	if len(layout.Boxes) != 0 {
		t.Errorf("boxes = %d, want none", len(layout.Boxes))
	}
	if len(layout.Tiles) != 1 {
		t.Errorf("tiles = %d, want one empty page", len(layout.Tiles))
	}
}

// The drawing is the boxes *and* the cables. A cable routed into the gutter
// above the topmost box runs at a negative height, and one leaving past the
// rightmost box runs off the side; measuring the plane from the boxes alone put
// both outside the frame, where the page clip cut them off and a signal path
// disappeared for part of its length.
func TestTheFrameHoldsTheCablesToo(t *testing.T) {
	// A cable that has to leave its column, cross a box and come back — the
	// shape that produces a gutter run above everything.
	graph := FlowGraph{
		Nodes: []FlowNode{
			testNode("left", 0, 300, 0, 2),
			testNode("middle", 500, 0, 6, 6),
			testNode("right", 1000, 300, 2, 0),
		},
		Edges: []FlowEdge{
			edge("left", 0, "right", 0),
			edge("left", 1, "right", 1),
		},
	}
	layout, routing := routeGraph(graph)

	for _, segment := range routing.Segments() {
		for _, point := range [][2]float64{{segment.X1, segment.Y1}, {segment.X2, segment.Y2}} {
			if point[0] < -epsilon || point[1] < -epsilon {
				t.Errorf("a cable runs to (%.2f,%.2f), outside the top-left of the frame", point[0], point[1])
			}
			if point[0] > layout.PlaneW+epsilon || point[1] > layout.PlaneH+epsilon {
				t.Errorf("a cable runs to (%.2f,%.2f), past the plane at %.2fx%.2f",
					point[0], point[1], layout.PlaneW, layout.PlaneH)
			}
		}
	}
	for _, box := range layout.Boxes {
		if box.X < -epsilon || box.Y < -epsilon {
			t.Errorf("%s is placed at (%.2f,%.2f), outside the frame", box.Node.Key, box.X, box.Y)
		}
	}
}

// Overlap the planner already has is not a reason to shrink or to tile. Four
// output devices stacked at one spot on the canvas overlap at every scale, and
// tiling does not separate them — it deals them across pages.
func TestBoxesTheCanvasAlreadyStacksDoNotForceTiling(t *testing.T) {
	graph := FlowGraph{
		Nodes: []FlowNode{
			testNode("desk", 0, 100, 0, 4),
			// Four destinations the planner never dragged apart. They overlap
			// each other at every scale.
			testNode("spk1", 900, 150, 1, 0),
			testNode("spk2", 900, 153, 1, 0),
			testNode("spk3", 900, 156, 1, 0),
			testNode("spk4", 900, 159, 1, 0),
		},
		Edges: []FlowEdge{
			edge("desk", 0, "spk1", 0),
			edge("desk", 1, "spk2", 0),
			edge("desk", 2, "spk3", 0),
			edge("desk", 3, "spk4", 0),
		},
	}
	layout, routing := routeGraph(graph)

	if layout.Tiled() {
		t.Errorf("a five-box graph was tiled across %d pages because its destinations "+
			"were stacked on the canvas — no scale separates them and no page does either",
			len(layout.Tiles))
	}
	// Every cable is still drawn. What the routing cannot promise here is the
	// no-shared-ink invariant: boxes the planner left on top of each other have
	// jacks at the same point, and two cables arriving at the same point share
	// ink by definition. That is a property of the arrangement, not of the
	// router, and the document reproduces the arrangement.
	if len(routing.Edges) != len(graph.Edges) {
		t.Errorf("routed %d of %d cables", len(routing.Edges), len(graph.Edges))
	}
}

// A box belongs to one sheet. Clipping alone does not achieve that: fpdf reads a
// negative abscissa as measured from the right edge of the page, so an off-tile
// box has its rectangle clipped away while its labels wrap back onto the sheet.
func TestABoxBelongsToOneSheet(t *testing.T) {
	graph := FlowGraph{}
	for i := 0; i < 12; i++ {
		graph.Nodes = append(graph.Nodes, testNode(
			fmt.Sprintf("n%d", i), float64(i*700), float64((i%2)*400), 20, 20))
	}
	layout, _ := routeGraph(graph)
	if !layout.Tiled() {
		t.Skip("this graph fitted one page; the question does not arise")
	}

	for _, box := range layout.Boxes {
		sheets := 0
		for _, tile := range layout.Tiles {
			if boxOnTile(box, tile) {
				sheets++
			}
		}
		if sheets != 1 {
			t.Errorf("%s is drawn on %d sheets, want exactly 1", box.Node.Key, sheets)
		}
	}
}
