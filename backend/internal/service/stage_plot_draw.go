package service

import (
	"fmt"
	"math"
	"strings"

	"github.com/trionell/patchplanner/internal/domain"
	"github.com/trionell/patchplanner/internal/service/plotglyph"
)

// Drawing one sheet: the frame, the grid, the elements, the floor datum, and
// the title block that lets a single sheet be pulled out and still read.

// text draws a line at a baseline, in page millimetres. The drawing area is
// laid out geometrically rather than in a text flow, so fpdf's Text (which
// takes a baseline) is the right primitive here; the tables use CellFormat.
func (d *plotDoc) text(x, y float64, size float64, style, align string, value string) {
	d.pdf.SetFont("Helvetica", style, size)
	width := d.pdf.GetStringWidth(value)
	switch align {
	case "C":
		x -= width / 2
	case "R":
		x -= width
	}
	d.pdf.Text(x, y, d.tr(value))
}

// rotateAbout turns a page point about a centre, in degrees clockwise on the
// page — the same sense fpdf's TransformRotate uses negated.
func rotateAbout(x, y, cx, cy, degrees float64) (float64, float64) {
	radians := degrees * math.Pi / 180
	cos, sin := math.Cos(radians), math.Sin(radians)
	dx, dy := x-cx, y-cy
	return cx + dx*cos - dy*sin, cy + dx*sin + dy*cos
}

// setInk sets the pen, the brush and the lettering to one colour.
//
// The fill is not decoration here, it is what makes the other two reliable.
// fpdf's SetTextColor emits nothing on its own: it records the colour and sets
// a flag saying whether it differs from the fill, and the text routine only
// writes a colour operator when it does. SetFillColor, by contrast, always
// emits. Meanwhile ClipEnd writes a `Q`, which restores the PDF's own graphics
// state while leaving fpdf's tracking pointing at whatever was set inside the
// clip — so after a clipped drawing the two disagree, and text asked to be
// black comes out in the last element's layer colour.
//
// Setting all three together means every ink change puts a real operator in
// the stream, which re-syncs the two whatever the clip did.
func (d *plotDoc) setInk(red, green, blue int) {
	d.pdf.SetDrawColor(red, green, blue)
	d.pdf.SetFillColor(red, green, blue)
	d.pdf.SetTextColor(red, green, blue)
}

func (d *plotDoc) writeViewSheet(sheet plotSheetPlan) {
	m := d.mapper(sheet.view)
	m.tileU, m.tileV = sheet.tileU, sheet.tileV

	d.writeSheetHead(sheet)
	d.pdf.ClipRect(plotFrameX, plotFrameY, plotFrameW, plotFrameH, false)
	d.drawGrid(m)
	if !m.vDown {
		d.drawFloor(m)
	}
	for _, element := range d.elements {
		d.drawElement(element, sheet.view, m)
	}
	d.pdf.ClipEnd()

	// The frame goes on last so no element paints over its own boundary.
	d.setInk(17, 17, 17)
	d.pdf.SetLineWidth(plotFrameWeight)
	d.pdf.Rect(plotFrameX, plotFrameY, plotFrameW, plotFrameH, "D")
	d.drawAxisNames(sheet.view)

	if len(d.elements) == 0 {
		d.setInk(102, 102, 102)
		d.text(plotFrameX+plotFrameW/2, plotFrameY+plotFrameH/2, 9, "I", "C",
			"Nothing has been placed on this plot")
		d.setInk(17, 17, 17)
	}
	d.writeTitleBlock(sheet)
}

func (d *plotDoc) writeSheetHead(sheet plotSheetPlan) {
	d.setInk(17, 17, 17)
	title := sheet.title
	if sheet.parts > 1 {
		title = fmt.Sprintf("%s   (part %d of %d)", title, sheet.part, sheet.parts)
	}
	d.text(plotFrameX, plotFrameY-4.5, 11, "B", "L", title)
	d.setInk(119, 119, 119)
	d.text(plotFrameX+plotFrameW, plotFrameY-4.5, 7, "", "R",
		fmt.Sprintf("Sheet %d of %d", d.sheet, d.sheetCount))
	d.setInk(17, 17, 17)
}

// The grid is the stage's own coordinate mesh, so it runs to the edge of the
// frame rather than stopping where the furthest element happens to sit.
func (d *plotDoc) drawGrid(m plotMapper) {
	if !d.plot.GridVisible || d.gridCm <= 0 {
		return
	}
	d.pdf.SetDrawColor(221, 221, 221)
	d.pdf.SetLineWidth(plotGridWeight)
	left, right := plotFrameX, plotFrameX+plotFrameW
	top, bottom := plotFrameY, plotFrameY+plotFrameH

	for u := math.Ceil(m.uAt(left)/d.gridCm) * d.gridCm; u <= m.uAt(right); u += d.gridCm {
		x := m.X(u)
		d.pdf.Line(x, top, x, bottom)
	}
	lowV := math.Min(m.vAt(top), m.vAt(bottom))
	highV := math.Max(m.vAt(top), m.vAt(bottom))
	for v := math.Ceil(lowV/d.gridCm) * d.gridCm; v <= highV; v += d.gridCm {
		y := m.Y(v)
		d.pdf.Line(left, y, right, y)
	}
	d.pdf.SetDrawColor(17, 17, 17)
}

// The floor is a datum: a solid rule with hatching under it, the way every
// trade draws ground. Dashes stay reserved for what is unresolved.
func (d *plotDoc) drawFloor(m plotMapper) {
	y := m.Y(0)
	if y < plotFrameY || y > plotFrameY+plotFrameH {
		return // the floor is off this tile
	}
	left, right := plotFrameX, plotFrameX+plotFrameW
	d.pdf.SetDrawColor(17, 17, 17)
	d.pdf.SetLineWidth(plotFloorWeight)
	d.pdf.Line(left, y, right, y)

	d.pdf.SetDrawColor(119, 119, 119)
	d.pdf.SetLineWidth(plotHairWeight)
	for x := left + 3; x < right; x += 3 {
		d.pdf.Line(x, y, x-2, y+2)
	}
	d.setInk(119, 119, 119)
	d.text(right-1.5, y+6.2, 5, "", "R", "FLOOR 0")
	d.setInk(17, 17, 17)
}

func (d *plotDoc) drawAxisNames(view PlotView) {
	horizontal, vertical := "STAGE WIDTH", "STAGE DEPTH"
	switch view {
	case ViewFront:
		vertical = "HEIGHT"
	case ViewSide:
		horizontal, vertical = "STAGE DEPTH", "HEIGHT"
	}
	d.setInk(119, 119, 119)
	d.text(plotFrameX+plotFrameW, plotFrameY+plotFrameH+3.4, 5, "", "R", horizontal)
	// The vertical axis is named up the left edge, where a drawing names it.
	d.pdf.TransformBegin()
	d.pdf.TransformRotate(90, plotFrameX-2.4, plotFrameY+plotFrameH/2)
	d.text(plotFrameX-2.4, plotFrameY+plotFrameH/2, 5, "", "C", vertical)
	d.pdf.TransformEnd()
	d.setInk(17, 17, 17)
}

func (d *plotDoc) drawElement(element domain.StagePlotElement, view PlotView, m plotMapper) {
	rect := ProjectElement(element, view)
	cx, cy := m.X(rect.U), m.Y(rect.V)
	width, height := rect.Width*d.perCm, rect.Height*d.perCm
	// An elevation flips the vertical axis, so a drawn rotation flips with it.
	rotation := rect.RotationDeg
	if !m.vDown {
		rotation = -rotation
	}
	red, green, blue := d.ink(element.LayerID)
	d.setInk(red, green, blue)
	d.pdf.SetLineWidth(plotElementWeight)

	d.pdf.TransformBegin()
	if rotation != 0 {
		d.pdf.TransformRotate(-rotation, cx, cy)
	}

	switch {
	case element.Kind == "shape":
		d.drawShape(element, view, cx, cy, width, height)
	case element.Kind == "truss" && element.TrussID != nil:
		d.drawTruss(element, view, m, cx, cy)
	case element.Icon != "" || element.Kind == "fixture":
		d.drawIcon(element, view, cx, cy, width, height)
	default:
		d.pdf.SetDashPattern([]float64{1.2, 0.8}, 0)
		d.pdf.Rect(cx-width/2, cy-height/2, width, math.Max(height, 1), "D")
		d.pdf.SetDashPattern(nil, 0)
	}

	d.pdf.TransformEnd()

	// The plan is where a thing is identified; an elevation is where its height
	// is read. Labelling every element in both piles the whole floor-standing
	// rig into one illegible line along the datum, so an elevation names only
	// what is off the floor — the one thing the plan cannot tell you.
	//
	// The label's POSITION turns with the element, so it stays under the shape
	// it names; its ORIENTATION does not, because a drawing is read one way up.
	if element.Name != "" && (m.vDown || element.ZCm > 0) &&
		!(element.Kind == "shape" && element.ShapeKind == "text") {
		labelX, labelY := rotateAbout(cx, cy+height/2+2.1, cx, cy, -rotation)
		d.setInk(red, green, blue)
		d.text(labelX, labelY, 5.5, "", "C", element.Name)
	}
	d.setInk(17, 17, 17)
}

func (d *plotDoc) drawShape(element domain.StagePlotElement, view PlotView, cx, cy, width, height float64) {
	switch element.ShapeKind {
	case "ellipse":
		if view == ViewTop {
			d.pdf.Ellipse(cx, cy, width/2, height/2, 0, "D")
			return
		}
		// Straight on, a cylinder is a rectangle — the same call the editor makes.
		d.pdf.Rect(cx-width/2, cy-height/2, width, height, "D")
	case "line":
		d.pdf.Line(cx-width/2, cy, cx+width/2, cy)
	case "text":
		d.text(cx, cy, math.Max(height/plotPt, 5.5), "", "C", element.Name)
	default:
		d.pdf.Rect(cx-width/2, cy-height/2, width, height, "D")
	}
}

func (d *plotDoc) drawIcon(element domain.StagePlotElement, view PlotView, cx, cy, width, height float64) {
	id := element.Icon
	if element.Kind == "fixture" {
		id = "fixture"
	}
	boxW, boxH := plotglyph.Box(id, plotglyph.View(view))
	if boxW <= 0 || boxH <= 0 {
		return
	}
	transform := plotglyph.Transform{
		ScaleX:  width / boxW,
		ScaleY:  height / boxH,
		OriginX: cx - width/2,
		OriginY: cy - height/2,
	}
	// An unreadable glyph must not take the document down with it: the drawing
	// loses one icon, and the schedule still names the element.
	_ = plotglyph.Draw(d.pdf, plotglyph.Marks(id, plotglyph.View(view)), transform, plotElementWeight)
}

// A truss is drawn as the true silhouette of its oriented box — up to six
// corners once yaw and rake combine, which a rectangle cannot represent — with
// a numbered balloon at each fixture's real point on the bar.
//
// The balloon carries a number, not a name: at the scales a stage is drawn at a
// fixture is about 3 mm across and "ADJ, ULTRA LB18 · FID 1101 · 2.001" is
// 22 mm of type. The number is resolved in the title block and the schedule.
func (d *plotDoc) drawTruss(element domain.StagePlotElement, view PlotView, m plotMapper, cx, cy float64) {
	outline := ProjectedOutline(element, view)
	flip := 1.0
	if !m.vDown {
		flip = -1
	}
	if len(outline) >= 3 {
		points := make([]fpdfPoint, 0, len(outline))
		for _, corner := range outline {
			points = append(points, fpdfPoint{
				X: cx + corner.U*d.perCm,
				Y: cy + corner.V*d.perCm*flip,
			})
		}
		d.polygon(points)
	}

	truss, ok := d.trusses[*element.TrussID]
	if !ok {
		return
	}
	axes := ProjectAxes(element, view)
	barLength := math.Max(truss.TotalLengthCm, 20)
	hangV := (element.HeightCm / 2) * math.Abs(axes.Az.V)

	for index, fixture := range truss.Fixtures {
		if fixture.OffsetCm == nil {
			continue
		}
		offset, _ := ClampFixtureOffset(*fixture.OffsetCm, barLength)
		laneV := TrussLaneLocalV(fixture.Side, element.DepthCm/2)
		along := offset - barLength/2
		u := along*axes.Ax.U + laneV*axes.Ay.U
		v := along*axes.Ax.V + laneV*axes.Ay.V

		x := cx + u*d.perCm
		y := cy + v*d.perCm*flip
		if !m.vDown {
			// The elevations hang the marker below the bar's underside, on a
			// short leader so it is visibly attached to the bar.
			hung := y + hangV*d.perCm*flip*-1
			d.pdf.SetLineWidth(plotHairWeight)
			d.pdf.Line(x, y, x, hung)
			y = hung
		}
		d.drawBalloon(x, y, index+1)
	}
}

const plotBalloonRadius = 1.55

// drawBalloon is a numbered circle: filled white so the bar behind it does not
// run through the digit, then outlined and numbered.
func (d *plotDoc) drawBalloon(x, y float64, number int) {
	red, green, blue := d.pdf.GetDrawColor()
	d.pdf.SetFillColor(255, 255, 255)
	d.pdf.SetLineWidth(plotElementWeight)
	d.pdf.Circle(x, y, plotBalloonRadius, "FD")
	d.setInk(red, green, blue)
	d.text(x, y+0.62, 5, "B", "C", fmt.Sprintf("%d", number))
}

type fpdfPoint struct{ X, Y float64 }

func (d *plotDoc) polygon(points []fpdfPoint) {
	d.pdf.SetLineWidth(plotElementWeight)
	d.pdf.MoveTo(points[0].X, points[0].Y)
	for _, p := range points[1:] {
		d.pdf.LineTo(p.X, p.Y)
	}
	d.pdf.ClosePath()
	d.pdf.DrawPath("D")
}

// ---- The title block ----

// The title block is a key to the sheet it is on, and it repeats on all three
// drawing sheets: a rigger pulls one sheet out of the set and it has to still
// read. Scale, grid, layers, the truss fixtures and the conventions.
func (d *plotDoc) writeTitleBlock(sheet plotSheetPlan) {
	const pad = 2.6
	x := plotBlockX
	d.pdf.SetDrawColor(187, 187, 187)
	d.pdf.SetLineWidth(plotFrameWeight)
	d.pdf.Rect(x, plotFrameY, plotBlockW, plotFrameH, "D")
	d.setInk(17, 17, 17)

	y := plotFrameY
	label := func(caption string) {
		y += 4.4
		d.setInk(119, 119, 119)
		d.text(x+pad, y, 5, "B", "L", caption)
		y += 1.2
		d.pdf.SetDrawColor(187, 187, 187)
		d.pdf.SetLineWidth(plotHairWeight)
		d.pdf.Line(x+pad, y, x+plotBlockW-pad, y)
		d.setInk(17, 17, 17)
	}

	label("SCALE")
	y += 4.2
	d.text(x+pad, y, 11, "B", "L", "1:"+trimFloat(d.denom))
	d.setInk(119, 119, 119)
	d.text(x+plotBlockW-pad, y, 5.5, "", "R", "A4")
	d.setInk(17, 17, 17)
	y += 2.6
	d.drawScaleBar(x+pad, y, plotBlockW-pad*2)
	y += 6.4
	d.setInk(119, 119, 119)
	d.text(x+pad, y, 5, "", "L", d.gridStatement())
	d.setInk(17, 17, 17)
	y += 1.4

	label("LAYERS")
	for _, layer := range d.visibleLayers() {
		red, green, blue := d.ink(layer.ID)
		count := 0
		for _, element := range d.elements {
			if element.LayerID == layer.ID {
				count++
			}
		}
		y += 4.6
		d.pdf.SetFillColor(red, green, blue)
		d.pdf.Rect(x+pad, y-2.5, 5.5, 2.6, "F")
		d.setInk(17, 17, 17)
		d.text(x+pad+7.4, y, 6, "", "L", truncatePDF(d.pdf, layer.Name, plotBlockW-pad*2-14))
		d.setInk(119, 119, 119)
		d.text(x+plotBlockW-pad, y, 5.4, "", "R", fmt.Sprintf("%d", count))
		d.setInk(17, 17, 17)
	}
	y += 2

	for _, truss := range d.placedTrusses() {
		label("TRUSS " + strings.ToUpper(truss.Name))
		y += 3.6
		d.setInk(119, 119, 119)
		d.text(x+pad, y, 5, "", "L", fmt.Sprintf("%s bar at %s",
			metres(truss.TotalLengthCm), metres(truss.HeightCm)))
		d.setInk(17, 17, 17)
		for index, fixture := range truss.Fixtures {
			if y > plotFrameY+plotFrameH-14 {
				d.setInk(119, 119, 119)
				d.text(x+pad, y+4.5, 5, "I", "L", "…continued in the schedule")
				d.setInk(17, 17, 17)
				break
			}
			y += 4.5
			d.pdf.SetLineWidth(plotElementWeight)
			d.pdf.Circle(x+pad+1.6, y-1, plotBalloonRadius, "D")
			d.text(x+pad+1.6, y-0.4, 5, "B", "C", fmt.Sprintf("%d", index+1))
			d.text(x+pad+5.4, y-1.6, 5.4, "", "L",
				truncatePDF(d.pdf, fixture.FixtureName, plotBlockW-pad-8))
			d.setInk(119, 119, 119)
			d.text(x+pad+5.4, y+1.4, 4.6, "", "L",
				truncatePDF(d.pdf, fixtureBalloonDetail(fixture), plotBlockW-pad-8))
			d.setInk(17, 17, 17)
			y += 1.6
		}
		y += 2
	}

	label("CONVENTIONS")
	y += 4.6
	d.pdf.SetDrawColor(17, 17, 17)
	d.pdf.SetLineWidth(0.4)
	d.pdf.Line(x+pad, y-1, x+pad+6, y-1)
	d.pdf.SetDrawColor(119, 119, 119)
	d.pdf.SetLineWidth(0.12)
	for _, offset := range []float64{0, 2, 4} {
		d.pdf.Line(x+pad+offset+1.6, y-1, x+pad+offset, y+0.6)
	}
	d.setInk(119, 119, 119)
	d.text(x+pad+8.4, y, 5, "", "L", "Solid rule + hatch = floor, z 0")

	y += 4.6
	d.pdf.SetDrawColor(17, 17, 17)
	d.pdf.SetLineWidth(plotElementWeight)
	d.pdf.Circle(x+pad+3, y-1, 1.4, "D")
	d.setInk(119, 119, 119)
	d.text(x+pad+8.4, y, 5, "", "L", "Numbered circle = truss fixture")

	y += 4.6
	d.pdf.SetDrawColor(17, 17, 17)
	d.pdf.SetDashPattern([]float64{1, 0.7}, 0)
	d.pdf.Rect(x+pad, y-2.4, 6, 2.6, "D")
	d.pdf.SetDashPattern(nil, 0)
	d.setInk(119, 119, 119)
	d.text(x+pad+8.4, y, 5, "", "L", "Dashed outline = unresolved")
	d.setInk(17, 17, 17)

	if sheet.parts > 1 {
		y += 6
		d.setInk(119, 119, 119)
		d.text(x+pad, y, 5, "I", "L", fmt.Sprintf("Part %d of %d, same scale", sheet.part, sheet.parts))
		d.setInk(17, 17, 17)
	}
}

func (d *plotDoc) gridStatement() string {
	if d.gridCm <= 0 || !d.plot.GridVisible {
		return "No grid"
	}
	if d.gridStep == 1 {
		return fmt.Sprintf("Grid %s cm", trimFloat(d.plot.GridSizeCm))
	}
	return fmt.Sprintf("Grid %s cm - drawn every %s (%s cm)",
		trimFloat(d.plot.GridSizeCm), ordinal(d.gridStep), trimFloat(d.gridCm))
}

func ordinal(value int) string {
	switch {
	case value%100 >= 11 && value%100 <= 13:
		return fmt.Sprintf("%dth", value)
	case value%10 == 1:
		return fmt.Sprintf("%dst", value)
	case value%10 == 2:
		return fmt.Sprintf("%dnd", value)
	case value%10 == 3:
		return fmt.Sprintf("%drd", value)
	default:
		return fmt.Sprintf("%dth", value)
	}
}

func metres(cm float64) string {
	return trimFloat(cm/100) + " m"
}

// drawScaleBar is the scale as a drawn measure rather than a stated one. A
// photocopier resizes the sheet and the bar resizes with it, while "1:100"
// quietly becomes a lie.
func (d *plotDoc) drawScaleBar(x, y, available float64) {
	segment := 100 * d.perCm // one metre
	if segment <= 0 {
		return
	}
	count := int(available / segment)
	if count < 1 {
		// At a very small scale a metre is too short to draw; step up to a
		// length that is, so the bar always measures something round.
		for _, step := range []float64{5, 10, 25, 50, 100} {
			if step*100*d.perCm <= available {
				segment = step * 100 * d.perCm
				count = int(available / segment)
			}
		}
		if count < 1 {
			return
		}
	}
	if count > 6 {
		count = 6
	}
	unitMetres := segment / (100 * d.perCm)
	d.pdf.SetDrawColor(17, 17, 17)
	d.pdf.SetLineWidth(0.12)
	for i := 0; i < count; i++ {
		style := "FD"
		if i%2 == 1 {
			d.pdf.SetFillColor(255, 255, 255)
		} else {
			d.pdf.SetFillColor(17, 17, 17)
		}
		d.pdf.Rect(x+float64(i)*segment, y, segment, 1.4, style)
	}
	d.setInk(119, 119, 119)
	d.text(x, y+4.1, 4.6, "", "C", "0")
	d.text(x+float64(count)*segment, y+4.1, 4.6, "", "C",
		fmt.Sprintf("%s m", trimFloat(float64(count)*unitMetres)))
	d.setInk(17, 17, 17)
}

func fixtureBalloonDetail(fixture domain.PlotTrussFixture) string {
	var parts []string
	if fixture.FixtureNumber != nil {
		parts = append(parts, fmt.Sprintf("FID %d", *fixture.FixtureNumber))
	}
	if fixture.DMXStartAddress != nil {
		parts = append(parts, fmt.Sprintf("%d.%03d", fixture.DMXUniverse, *fixture.DMXStartAddress))
	}
	if fixture.OffsetCm != nil {
		parts = append(parts, fmt.Sprintf("%s cm %s", trimFloat(*fixture.OffsetCm), fixture.Side))
	}
	return strings.Join(parts, " - ")
}
