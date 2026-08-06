package service

import (
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/go-pdf/fpdf"
)

// Drawing a routed graph onto the page.
//
// Every mark here is a vector. The document is built-in Helvetica with a cp1252
// translator, and an unrepresentable character does not come out as garbage —
// it comes out as a full stop, which reads as punctuation and is the worse
// failure. So the arrowhead is a filled triangle, a jack is a circle, phantom
// power is a filled square, and nothing that carries meaning is a glyph.

const (
	edgeLineWidth = 0.25
	boxLineWidth  = 0.2
	deskLineWidth = 0.45
	jackRadius    = 0.65
	arrowLength   = 2.2
	arrowHalfWide = 0.9
)

// drawFlowTile draws one page's worth. An untiled drawing is one tile covering
// the whole plane, so this is the only drawing path.
func drawFlowTile(pdf *fpdf.Fpdf, tr func(string) string, graph FlowGraph, layout FlowLayout,
	routing FlowRouting, originX, originY float64, tile FlowTile) {

	offsetX := originX - tile.X
	offsetY := originY - tile.Y

	// Cables first, so a box always sits on top of the lines reaching it.
	pdf.SetDrawColor(17, 17, 17)
	pdf.SetLineWidth(edgeLineWidth)
	for _, routed := range routing.Edges {
		for _, segment := range routed.Segments {
			pdf.Line(segment.X1+offsetX, segment.Y1+offsetY, segment.X2+offsetX, segment.Y2+offsetY)
		}
		drawArrowhead(pdf, routed, offsetX, offsetY)
	}

	// A box belonging to another sheet is not drawn at all.
	//
	// Clipping alone does not do this. fpdf's SetX treats a negative abscissa
	// as measured from the *right* edge of the page (fpdf.go:3610), so a box
	// placed off the left of the tile has its rectangle drawn off-page and
	// clipped away while its labels wrap back onto the sheet — which is a
	// borderless table of text belonging to a different page.
	for _, box := range layout.Boxes {
		if !boxOnTile(box, tile) {
			continue
		}
		drawFlowNode(pdf, tr, box, offsetX, offsetY)
	}
}

// boxOnTile is whether any part of this box falls on this sheet. Tiles are cut
// between boxes, so in practice a box belongs to exactly one.
func boxOnTile(box NodeBox, tile FlowTile) bool {
	return box.X < tile.X+tile.W-epsilon && box.X+box.W > tile.X+epsilon &&
		box.Y < tile.Y+tile.H-epsilon && box.Y+box.H > tile.Y+epsilon
}

// drawArrowhead points a filled triangle at the jack the cable lands on. Its
// direction comes from the last run, so a cable arriving from the left points
// right and one dropping in from above points down.
func drawArrowhead(pdf *fpdf.Fpdf, routed RoutedEdge, offsetX, offsetY float64) {
	if len(routed.Segments) == 0 {
		return
	}
	last := routed.Segments[len(routed.Segments)-1]
	tipX, tipY := routed.TipX+offsetX, routed.TipY+offsetY

	dx, dy := last.X2-last.X1, last.Y2-last.Y1
	length := math.Hypot(dx, dy)
	if length < epsilon {
		return
	}
	dx, dy = dx/length, dy/length
	// Perpendicular, for the two back corners.
	px, py := -dy, dx

	pdf.SetFillColor(17, 17, 17)
	pdf.Polygon([]fpdf.PointType{
		{X: tipX, Y: tipY},
		{X: tipX - dx*arrowLength + px*arrowHalfWide, Y: tipY - dy*arrowLength + py*arrowHalfWide},
		{X: tipX - dx*arrowLength - px*arrowHalfWide, Y: tipY - dy*arrowLength - py*arrowHalfWide},
	}, "F")
}

// drawFlowNode draws one box: its border, its header, a row per jack with a
// filled or hollow mark, and its footer.
func drawFlowNode(pdf *fpdf.Fpdf, tr func(string) string, box NodeBox, offsetX, offsetY float64) {
	x, y := box.X+offsetX, box.Y+offsetY
	shrink := box.shrink()

	pdf.SetFillColor(255, 255, 255)
	pdf.SetDrawColor(17, 17, 17)
	if box.Node.Desk {
		// The box every other box is arranged around wears a heavier border —
		// the same distinction the canvas draws in amber, in the one dimension
		// paper has to spare.
		pdf.SetLineWidth(deskLineWidth)
	} else {
		pdf.SetLineWidth(boxLineWidth)
	}
	pdf.Rect(x, y, box.W, box.H, "FD")

	header := box.header()
	pdf.SetLineWidth(boxLineWidth)
	pdf.Line(x, y+header, x+box.W, y+header)

	pdf.SetFont("Helvetica", "B", nodeTitlePt*shrink)
	pdf.SetTextColor(17, 17, 17)
	titleWidth := box.W - 2*shrink
	if box.Node.Badge != "" {
		titleWidth -= 9 * shrink
	}
	pdf.SetXY(x+shrink, y)
	pdf.CellFormat(titleWidth, header, tr(truncatePDF(pdf, box.Node.Title, titleWidth)), "", 0, "L", false, 0, "")
	if box.Node.Badge != "" {
		pdf.SetFont("Helvetica", "", (nodeTitlePt-0.8)*shrink)
		pdf.SetTextColor(110, 110, 110)
		pdf.SetXY(x+box.W-9*shrink-shrink, y)
		pdf.CellFormat(9*shrink, header, tr(box.Node.Badge), "", 0, "R", false, 0, "")
	}

	rowHeight := box.rowHeight()
	pdf.SetFont("Helvetica", "", portLabelPt*shrink)
	pdf.SetTextColor(17, 17, 17)
	labelWidth := box.W/2 - 4*shrink

	for index := 0; index < box.Node.Rows(); index++ {
		rowY := y + header + float64(index)*rowHeight
		if index < len(box.Node.Inputs) {
			port := box.Node.Inputs[index]
			drawJack(pdf, x+1.4*shrink, rowY+rowHeight/2, port, shrink)
			pdf.SetXY(x+2.6*shrink, rowY)
			pdf.CellFormat(labelWidth, rowHeight, tr(truncatePDF(pdf, port.Label, labelWidth)), "", 0, "L", false, 0, "")
		}
		if index < len(box.Node.Outputs) {
			port := box.Node.Outputs[index]
			drawJack(pdf, x+box.W-1.4*shrink, rowY+rowHeight/2, port, shrink)
			pdf.SetXY(x+box.W-2.6*shrink-labelWidth, rowY)
			pdf.CellFormat(labelWidth, rowHeight, tr(truncatePDF(pdf, port.Label, labelWidth)), "", 0, "R", false, 0, "")
		}
	}

	if box.Node.Footer != "" {
		footerY := y + box.H - nodeFooterMM*shrink
		pdf.SetLineWidth(boxLineWidth)
		pdf.SetDrawColor(170, 170, 170)
		pdf.Line(x, footerY, x+box.W, footerY)
		pdf.SetFont("Helvetica", "", nodeFooterPt*shrink)
		pdf.SetTextColor(110, 110, 110)
		pdf.SetXY(x+shrink, footerY)
		width := box.W - 2*shrink
		pdf.CellFormat(width, nodeFooterMM*shrink, tr(truncatePDF(pdf, box.Node.Footer, width)), "", 0, "L", false, 0, "")
		pdf.SetTextColor(17, 17, 17)
		pdf.SetDrawColor(17, 17, 17)
	}
}

// drawJack marks one jack: filled when a cable reaches it, hollow when nothing
// does. The distinction is in the shape, not the colour, so it survives a
// monochrome printer — and the strip colour, when the jack derives one, is a
// separate swatch that adds to what is already legible without it.
func drawJack(pdf *fpdf.Fpdf, x, y float64, port FlowPort, shrink float64) {
	radius := jackRadius * shrink
	pdf.SetLineWidth(boxLineWidth * shrink)
	pdf.SetDrawColor(17, 17, 17)
	if port.Patched {
		pdf.SetFillColor(17, 17, 17)
		pdf.Circle(x, y, radius, "FD")
	} else {
		pdf.SetFillColor(255, 255, 255)
		pdf.Circle(x, y, radius, "FD")
	}

	if red, green, blue, ok := parseHexColor(port.Color); ok {
		pdf.SetFillColor(red, green, blue)
		pdf.Rect(x+radius+0.5*shrink, y-1.1*shrink, 0.9*shrink, 2.2*shrink, "F")
	}
}

// drawFlowTitle is the line above the drawing: which section this is, what it
// contains, and the scale it is drawn at. A drawing whose scale is not stated
// cannot be measured.
func drawFlowTitle(pdf *fpdf.Fpdf, tr func(string) string, number int, title string,
	layout FlowLayout, sheet, tiles int) {

	pdf.SetFont("Helvetica", "B", 11)
	pdf.SetTextColor(17, 17, 17)
	pdf.CellFormat(120, 6, tr(fmt.Sprintf("%d   %s", number, title)), "", 0, "L", false, 0, "")

	detail := plural(len(layout.Boxes), "box", "boxes")
	if layout.Scale > 0 {
		detail = fmt.Sprintf("1 mm = %.1f canvas units   -   %s", 1/layout.Scale, detail)
	}
	if tiles > 1 {
		detail = fmt.Sprintf("sheet %d of %d   -   %s", sheet+1, tiles, detail)
	}
	pdf.SetFont("Helvetica", "", 7)
	pdf.SetTextColor(110, 110, 110)
	pdf.CellFormat(0, 6, tr(detail), "", 1, "R", false, 0, "")
	pdf.SetTextColor(17, 17, 17)
}

// drawFlowKey is the legend in the corner: what a filled jack means, what a
// hollow one means, and which colours are in play. It is the sentence that
// makes the drawing readable without the screen beside it.
func drawFlowKey(pdf *fpdf.Fpdf, tr func(string) string, graph FlowGraph, x, y float64) {
	colors := map[string]bool{}
	for _, node := range graph.Nodes {
		for _, port := range append(append([]FlowPort{}, node.Inputs...), node.Outputs...) {
			if port.Color != "" {
				colors[port.Color] = true
			}
		}
	}

	pdf.SetFont("Helvetica", "", 6)
	pdf.SetTextColor(70, 70, 70)

	pdf.SetXY(x, y)
	pdf.SetFillColor(17, 17, 17)
	pdf.Circle(x+1, y+1.6, jackRadius, "FD")
	pdf.SetXY(x+3, y)
	pdf.CellFormat(26, 3.2, tr("patched jack"), "", 1, "L", false, 0, "")

	pdf.SetFillColor(255, 255, 255)
	pdf.Circle(x+1, y+4.8, jackRadius, "FD")
	pdf.SetXY(x+3, y+3.2)
	pdf.CellFormat(26, 3.2, tr("free jack"), "", 1, "L", false, 0, "")

	if len(colors) > 0 {
		pdf.SetXY(x+3, y+6.4)
		pdf.CellFormat(40, 3.2, tr("colour repeats the strip colour"), "", 1, "L", false, 0, "")
	}
	pdf.SetTextColor(17, 17, 17)
}

// parseHexColor turns a stored "#rrggbb" into the components fpdf takes. A
// value that is not a colour is simply not drawn — the document never depends
// on one.
func parseHexColor(value string) (int, int, int, bool) {
	value = strings.TrimPrefix(strings.TrimSpace(value), "#")
	if len(value) != 6 {
		return 0, 0, 0, false
	}
	parsed, err := strconv.ParseUint(value, 16, 32)
	if err != nil {
		return 0, 0, 0, false
	}
	return int(parsed>>16) & 0xff, int(parsed>>8) & 0xff, int(parsed) & 0xff, true
}
