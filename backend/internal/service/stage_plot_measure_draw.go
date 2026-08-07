package service

import (
	"fmt"
	"math"

	"github.com/trionell/patchplanner/internal/domain"
)

// Measurements on paper (Slice 42).
//
// The document derives every value itself, from the stored anchors, using the
// same functions the canvas uses. It is never handed a number to print: a
// document that prints what a browser last believed is not a drawing of the
// plot, it is a drawing of a session.
//
// Separation from equipment is WEIGHT, not hue. patterns.md §8's rule is that a
// value nobody chose is not crossed onto paper at all, so a measurement takes
// the document's own ink and is told from the elements by how thin it is —
// which also survives a monochrome print, as the export spec requires.
const (
	measureLineWeight     = 0.18
	measureExtensionWidth = 0.12
	measureArrowLength    = 1.8
	measureArrowHalf      = 0.6
	measureExtensionGap   = 0.8
	measureOvershoot      = 1.0
	measureValueSize      = 6.5
)

// measurementAnchorsVisible reports whether every element this measurement
// anchors to is on the drawing.
func (d *plotDoc) measurementAnchorsVisible(measurement domain.StagePlotMeasurement) bool {
	for _, anchor := range []domain.MeasurementAnchor{measurement.From, measurement.To} {
		if !anchor.IsElement() {
			continue
		}
		if _, ok := d.elementByID[*anchor.ElementID]; !ok {
			return false
		}
	}
	return true
}

// resolveMeasurementEnd turns a stored anchor into geometry. A face whose
// projection has turned flat falls back to its centre as a point, exactly as
// the canvas does: the measurement bends rather than disappearing.
func (d *plotDoc) resolveMeasurementEnd(anchor domain.MeasurementAnchor, view PlotView) (MeasurementEnd, bool) {
	if !anchor.IsElement() {
		if anchor.UCm == nil || anchor.VCm == nil {
			return MeasurementEnd{}, false
		}
		return MeasurementEnd{Point: PlaneVec{U: *anchor.UCm, V: *anchor.VCm}}, true
	}
	element, ok := d.elementByID[*anchor.ElementID]
	if !ok {
		return MeasurementEnd{}, false
	}
	feature, err := ParseAnchorFeature(anchor.Feature)
	if err != nil {
		return MeasurementEnd{}, false
	}
	if anchor.Slide {
		if line, ok := ProjectFaceLine(element, view, feature); ok {
			return MeasurementEnd{Line: line, IsLine: true}, true
		}
	}
	return MeasurementEnd{Point: AnchorPoint(element, view, feature)}, true
}

// MeasurementDrawingFor is the drawn geometry of one measurement, or false
// where its ends state no distance.
func (d *plotDoc) measurementDrawingFor(measurement domain.StagePlotMeasurement, view PlotView) (MeasurementDrawing, bool) {
	from, ok := d.resolveMeasurementEnd(measurement.From, view)
	if !ok {
		return MeasurementDrawing{}, false
	}
	to, ok := d.resolveMeasurementEnd(measurement.To, view)
	if !ok {
		return MeasurementDrawing{}, false
	}
	span, ok := ComputeMeasurementSpan(from, to, measurement.Type)
	if !ok {
		return MeasurementDrawing{}, false
	}
	return ComputeMeasurementDrawing(span, measurement.OffsetCm), true
}

func (d *plotDoc) drawMeasurements(view PlotView, m plotMapper) {
	for _, measurement := range d.measurements {
		if PlotView(measurement.View) != view {
			continue
		}
		drawing, ok := d.measurementDrawingFor(measurement, view)
		if !ok {
			continue
		}
		d.drawMeasurement(measurement, drawing, m)
	}
}

func (d *plotDoc) drawMeasurement(measurement domain.StagePlotMeasurement, drawing MeasurementDrawing, m plotMapper) {
	ax, ay := m.X(drawing.A.U), m.Y(drawing.A.V)
	bx, by := m.X(drawing.B.U), m.Y(drawing.B.V)
	lax, lay := m.X(drawing.LineA.U), m.Y(drawing.LineA.V)
	lbx, lby := m.X(drawing.LineB.U), m.Y(drawing.LineB.V)

	length := math.Hypot(lbx-lax, lby-lay)
	if length <= 0 {
		return
	}
	ux, uy := (lbx-lax)/length, (lby-lay)/length
	nx, ny := -uy, ux

	d.setInk(17, 17, 17)

	// Extension lines: clear of what they point at, and past the line they
	// reach, so neither touches the other.
	d.pdf.SetLineWidth(measureExtensionWidth)
	for _, pair := range [][4]float64{{ax, ay, lax, lay}, {bx, by, lbx, lby}} {
		dx, dy := pair[2]-pair[0], pair[3]-pair[1]
		run := math.Hypot(dx, dy)
		if run < measureExtensionGap {
			continue
		}
		kx, ky := dx/run, dy/run
		d.pdf.Line(pair[0]+kx*measureExtensionGap, pair[1]+ky*measureExtensionGap,
			pair[2]+kx*measureOvershoot, pair[3]+ky*measureOvershoot)
	}

	d.pdf.SetLineWidth(measureLineWeight)
	d.pdf.Line(lax, lay, lbx, lby)

	d.drawFaceRunOut(measurement, drawing, m)

	label := fmt.Sprintf("%d cm", int(math.Round(drawing.Value)))
	if measurement.Note != "" {
		label = measurement.Note + "  " + label
	}
	// An arrowhead is the same size at 1:50 and at 1:500: it is a mark on
	// paper, not a distance on the stage.
	//
	// The fit test asks the font, not a guess: measureValueSize is a POINT
	// size and length is millimetres, so estimating characters against it
	// compares two different units and pushes labels outside that would have
	// fitted easily.
	d.pdf.SetFontSize(measureValueSize)
	labelWidth := d.pdf.GetStringWidth(d.tr(label))
	inside := labelWidth <= length-2*measureArrowLength
	sign := 1.0
	if !inside {
		sign = -1
	}
	for _, head := range []struct{ x, y, dir float64 }{{lax, lay, sign}, {lbx, lby, -sign}} {
		baseX := head.x + ux*measureArrowLength*head.dir
		baseY := head.y + uy*measureArrowLength*head.dir
		d.polygon([]fpdfPoint{
			{X: head.x, Y: head.y},
			{X: baseX + nx*measureArrowHalf, Y: baseY + ny*measureArrowHalf},
			{X: baseX - nx*measureArrowHalf, Y: baseY - ny*measureArrowHalf},
		})
	}

	// Where the value goes. A dimension that spans a sheet division is drawn on
	// every part it reaches, and each part has to state the distance in full —
	// so the label rides the part of the line this sheet can actually show,
	// rather than staying at a midpoint that may be on another sheet.
	labelX, labelY := (lax+lbx)/2, (lay+lby)/2
	if !inside {
		// Centred text placed just past the terminator puts half the label back
		// on the arrowhead, which is the overlap being outside exists to avoid.
		clear := measureArrowLength + labelWidth/2 + 1
		labelX = lbx + ux*clear
		labelY = lby + uy*clear
	}
	if vx, vy, ok := visibleMidpoint(lax, lay, lbx, lby); ok && inside {
		labelX, labelY = vx, vy
	}
	angle := math.Atan2(lby-lay, lbx-lax) * 180 / math.Pi
	if angle > 90 || angle < -90 {
		angle += 180
	}
	d.pdf.TransformBegin()
	d.pdf.TransformRotate(-angle, labelX, labelY)
	d.text(labelX, labelY-1.2, measureValueSize, "", "C", label)
	d.pdf.TransformEnd()
}

// visibleMidpoint is the middle of the part of a segment that falls inside the
// drawing frame, found by sampling. Sampling rather than clipping because the
// frame is an axis-aligned rectangle and the segment is short: 64 steps put the
// label within a millimetre of centre, which is closer than anyone reads.
func visibleMidpoint(x1, y1, x2, y2 float64) (float64, float64, bool) {
	const steps = 64
	firstT, lastT := -1.0, -1.0
	for i := 0; i <= steps; i++ {
		t := float64(i) / steps
		x := x1 + (x2-x1)*t
		y := y1 + (y2-y1)*t
		if x < plotFrameX || x > plotFrameX+plotFrameW || y < plotFrameY || y > plotFrameY+plotFrameH {
			continue
		}
		if firstT < 0 {
			firstT = t
		}
		lastT = t
	}
	if firstT < 0 {
		return 0, 0, false
	}
	mid := (firstT + lastT) / 2
	return x1 + (x2-x1)*mid, y1 + (y2-y1)*mid, true
}

// drawFaceRunOut extends a face's line to reach a perpendicular foot that falls
// beyond the side's drawn extent. Without it the foot, and its right angle, sit
// in empty space with nothing to be perpendicular TO.
func (d *plotDoc) drawFaceRunOut(measurement domain.StagePlotMeasurement, drawing MeasurementDrawing, m plotMapper) {
	view := PlotView(measurement.View)
	for i, anchor := range []domain.MeasurementAnchor{measurement.From, measurement.To} {
		if !anchor.IsElement() || !anchor.Slide {
			continue
		}
		element, ok := d.elementByID[*anchor.ElementID]
		if !ok {
			continue
		}
		feature, err := ParseAnchorFeature(anchor.Feature)
		if err != nil {
			continue
		}
		line, ok := ProjectFaceLine(element, view, feature)
		if !ok {
			continue
		}
		foot := drawing.A
		if i == 1 {
			foot = drawing.B
		}
		if near, out := runOutFrom(line, foot); out {
			d.pdf.SetLineWidth(measureExtensionWidth)
			d.pdf.Line(m.X(near.U), m.Y(near.V), m.X(foot.U), m.Y(foot.V))
			d.pdf.SetLineWidth(measureLineWeight)
		}
	}
}

// runOutFrom reports the end of the drawn side nearest a foot that lies beyond
// it, and whether the foot is outside at all.
func runOutFrom(line FaceLine, foot PlaneVec) (PlaneVec, bool) {
	along := func(p PlaneVec) float64 { return p.U*line.Dir.U + p.V*line.Dir.V }
	lo, hi := along(line.Segment[0]), along(line.Segment[1])
	if lo > hi {
		lo, hi = hi, lo
		line.Segment[0], line.Segment[1] = line.Segment[1], line.Segment[0]
	}
	at := along(foot)
	// A hair of tolerance: a foot exactly on the end needs no run-out.
	if at < lo-0.01 {
		return line.Segment[0], true
	}
	if at > hi+0.01 {
		return line.Segment[1], true
	}
	return PlaneVec{}, false
}
