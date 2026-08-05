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
