package service

import (
	"fmt"
	"strings"

	"github.com/trionell/patchplanner/internal/domain"
)

// The element schedule: the sheet somebody marking out a floor carries.
//
// The drawings answer "where is it"; this answers "what is it and how big". It
// is grouped by layer under that layer's paper ink, so the key on the drawings
// and the grouping here are the same fact stated twice — which is also what
// keeps the document complete in monochrome, since a layer is named as well as
// coloured.
//
// The idiom is the audio document's: a repeating column header, and a
// continuation line where a row needs more than its columns hold, rather than a
// column that is empty on every other row.

// Column widths in millimetres, totalling the landscape text block (273 mm).
// There is no layer column: the rows already sit under their layer's heading,
// and a value repeated on every row of a group is one the group already states.
var scheduleColumns = []float64{104, 24, 24, 24, 60, 37}

var scheduleHeaders = []string{"Element", "X cm", "Y cm", "Z cm", "W x D x H cm", "Yaw / rake"}

var scheduleAligns = []string{"L", "R", "R", "R", "R", "R"}

const (
	scheduleRowHeight  = 4.6
	scheduleNoteHeight = 3.6
)

func (d *plotDoc) writeSchedule(title string) {
	d.setInk(17, 17, 17)
	d.text(paperMarginLeft, plotFrameY-4.5, 11, "B", "L", title)
	d.setInk(119, 119, 119)
	d.text(plotPageW-paperMarginRight, plotFrameY-4.5, 7, "", "R",
		fmt.Sprintf("Sheet %d of %d", d.sheet, d.sheetCount))
	d.setInk(17, 17, 17)

	y := plotFrameY
	d.pdf.SetY(y)
	d.writeScheduleHeader()
	y = d.pdf.GetY()

	if len(d.elements) == 0 {
		d.setInk(102, 102, 102)
		d.text(paperMarginLeft, y+6, 8, "I", "L", "Nothing has been placed on this plot")
		d.setInk(17, 17, 17)
		return
	}

	for _, layer := range d.visibleLayers() {
		rows := d.elementsOnLayer(layer.ID)
		if len(rows) == 0 {
			continue
		}
		y = d.breakIfNeeded(y, scheduleRowHeight*2)
		y += 5.4
		red, green, blue := d.ink(layer.ID)
		d.pdf.SetFillColor(red, green, blue)
		d.pdf.Rect(paperMarginLeft, y-2.6, 5.5, 2.6, "F")
		d.setInk(17, 17, 17)
		d.text(paperMarginLeft+7.4, y, 7.4, "B", "L", layer.Name)
		d.setInk(119, 119, 119)
		d.text(plotPageW-paperMarginRight, y, 6, "", "R",
			plural(len(rows), "element", "elements"))
		d.setInk(17, 17, 17)
		y += 1.2
		d.pdf.SetDrawColor(187, 187, 187)
		d.pdf.SetLineWidth(plotHairWeight)
		d.pdf.Line(paperMarginLeft, y, plotPageW-paperMarginRight, y)
		d.pdf.SetDrawColor(17, 17, 17)

		for _, element := range rows {
			y = d.breakIfNeeded(y, scheduleRowHeight)
			y += scheduleRowHeight
			d.writeScheduleRow(y, element)
			y = d.writeScheduleContinuations(y, element)
			d.pdf.SetDrawColor(238, 238, 238)
			d.pdf.SetLineWidth(0.12)
			d.pdf.Line(paperMarginLeft, y+1.4, plotPageW-paperMarginRight, y+1.4)
			d.pdf.SetDrawColor(17, 17, 17)
		}
		y += 2.4
	}

	y = d.breakIfNeeded(y, 12)
	y += 4
	d.pdf.SetDrawColor(187, 187, 187)
	d.pdf.SetLineWidth(plotHairWeight)
	d.pdf.Line(paperMarginLeft, y, plotPageW-paperMarginRight, y)
	d.pdf.SetDrawColor(17, 17, 17)
	y += 4
	d.setInk(119, 119, 119)
	d.text(paperMarginLeft, y, 5.8, "", "L",
		"Positions are element centres, in centimetres from the stage origin.     "+
			"Z is the underside above the floor.     Yaw is the plan rotation, rake the tilt.")
	d.setInk(17, 17, 17)
}

// breakIfNeeded starts a new sheet when the next block will not fit, carrying
// the running head and the column header onto it. A schedule that runs past one
// page is still a schedule.
func (d *plotDoc) breakIfNeeded(y, needed float64) float64 {
	if y+needed <= plotPageH-paperMarginBottom-6 {
		return y
	}
	d.sheet++
	d.sheetCount++
	d.pdf.AddPage()
	d.paper.runningHead(d.event.Name+" - "+d.plot.Name+" - Element schedule", "continued")
	d.pdf.SetY(plotFrameY)
	d.writeScheduleHeader()
	return d.pdf.GetY()
}

func (d *plotDoc) writeScheduleHeader() {
	d.pdf.SetX(paperMarginLeft)
	d.pdf.SetFont("Helvetica", "B", 6.2)
	d.setInk(68, 68, 68)
	for i, header := range scheduleHeaders {
		d.pdf.CellFormat(scheduleColumns[i], 5, d.tr(header), "", boolToInt(i == len(scheduleHeaders)-1),
			scheduleAligns[i], false, 0, "")
	}
	d.setInk(17, 17, 17)
	y := d.pdf.GetY()
	d.pdf.SetDrawColor(17, 17, 17)
	d.pdf.SetLineWidth(plotFrameWeight)
	d.pdf.Line(paperMarginLeft, y, plotPageW-paperMarginRight, y)
	d.pdf.SetY(y + 1.4)
}

func (d *plotDoc) writeScheduleRow(y float64, element domain.StagePlotElement) {
	cells := []string{
		scheduleElementTitle(element),
		trimFloat(element.XCm), trimFloat(element.YCm), trimFloat(element.ZCm),
		fmt.Sprintf("%s x %s x %s", trimFloat(element.WidthCm), trimFloat(element.DepthCm), trimFloat(element.HeightCm)),
		fmt.Sprintf("%s%s / %s%s", trimFloat(element.RotationDeg), degreeSign, trimFloat(element.TiltDeg), degreeSign),
	}
	x := paperMarginLeft
	for i, cell := range cells {
		width := scheduleColumns[i]
		if scheduleAligns[i] == "R" {
			d.text(x+width-2, y, 6.6, "", "R", cell)
		} else {
			d.text(x, y, 6.6, "", "L", truncatePDF(d.pdf, cell, width-2))
		}
		x += width
	}
}

// writeScheduleContinuations puts what a row cannot hold underneath it: a
// truss's bar and its fixtures — which is where the numbered balloons on the
// drawings are resolved — and any note the planner left.
func (d *plotDoc) writeScheduleContinuations(y float64, element domain.StagePlotElement) float64 {
	if element.Kind == "truss" && element.TrussID != nil {
		if truss, ok := d.trusses[*element.TrussID]; ok {
			y += scheduleNoteHeight
			d.setInk(85, 85, 85)
			d.text(paperMarginLeft+4, y, 5.8, "I", "L", fmt.Sprintf("%s - %s bar hung at %s",
				truss.Name, metres(truss.TotalLengthCm), metres(truss.HeightCm)))
			for index, fixture := range truss.Fixtures {
				y = d.breakIfNeeded(y, scheduleNoteHeight)
				y += scheduleNoteHeight
				d.setInk(85, 85, 85)
				d.text(paperMarginLeft+4, y, 5.8, "", "L", fmt.Sprintf("%d.  %s", index+1,
					strings.TrimSpace(fixture.FixtureName+"  "+fixtureScheduleDetail(fixture))))
			}
			d.setInk(17, 17, 17)
		}
	}
	if note := strings.TrimSpace(element.Notes); note != "" {
		y += scheduleNoteHeight
		d.setInk(85, 85, 85)
		d.text(paperMarginLeft+4, y, 5.8, "I", "L",
			truncatePDF(d.pdf, note, plotPageW-paperMarginLeft-paperMarginRight-8))
		d.setInk(17, 17, 17)
	}
	return y
}

func fixtureScheduleDetail(fixture domain.PlotTrussFixture) string {
	var parts []string
	if fixture.FixtureNumber != nil {
		parts = append(parts, fmt.Sprintf("FID %d", *fixture.FixtureNumber))
	}
	if fixture.DMXStartAddress != nil {
		parts = append(parts, fmt.Sprintf("DMX %d.%03d", fixture.DMXUniverse, *fixture.DMXStartAddress))
	}
	if fixture.OffsetCm != nil {
		parts = append(parts, fmt.Sprintf("%s cm from the stage-left end", trimFloat(*fixture.OffsetCm)))
	}
	if fixture.Side != "" {
		parts = append(parts, fixture.Side+" lane")
	}
	return strings.Join(parts, " - ")
}

func (d *plotDoc) elementsOnLayer(layerID int64) []domain.StagePlotElement {
	var out []domain.StagePlotElement
	for _, element := range d.elements {
		if element.LayerID == layerID {
			out = append(out, element)
		}
	}
	return out
}

var scheduleShapeTitles = map[string]string{
	"rect": "Rectangle", "ellipse": "Ellipse", "line": "Line", "text": "Text",
}

// scheduleElementTitle never returns a blank: an unnamed element still has to
// be findable on the drawing, so the schedule falls back to what it is rather
// than to an empty cell or a raw icon id.
func scheduleElementTitle(element domain.StagePlotElement) string {
	if name := strings.TrimSpace(element.Name); name != "" {
		return name
	}
	if element.Kind == "shape" {
		if title, ok := scheduleShapeTitles[element.ShapeKind]; ok {
			return title
		}
		return "Shape"
	}
	if element.Icon != "" {
		title := strings.ReplaceAll(element.Icon, "_", " ")
		return strings.ToUpper(title[:1]) + title[1:]
	}
	return strings.ToUpper(element.Kind[:1]) + element.Kind[1:]
}
