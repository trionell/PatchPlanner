package service

import (
	"math"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// The document derives every printed value from the stored anchors. These
// assert that it derives, that it obeys the canvas's visibility rules, and that
// a dimension crossing a sheet division still states its distance on both
// parts.

func measurementDoc(t *testing.T, measurements []domain.StagePlotMeasurement, elements []domain.StagePlotElement, layers []domain.StagePlotLayer) *plotDoc {
	t.Helper()
	return newPlotDoc(domain.Event{ID: 1, Name: "Test"}, domain.StagePlotResponse{
		Plot:         domain.StagePlot{ID: 1, Name: "Plot", GridSizeCm: 25, ActiveView: "top"},
		Layers:       layers,
		Elements:     elements,
		Measurements: measurements,
	})
}

func visibleLayer(id int64) domain.StagePlotLayer {
	return domain.StagePlotLayer{ID: id, PlotID: 1, Name: "Layer", Visible: true}
}

func TestDocumentDerivesTheMeasurementValue(t *testing.T) {
	left := domain.StagePlotElement{ID: 1, PlotID: 1, LayerID: 1, Kind: "shape", ShapeKind: "rect",
		XCm: 0, YCm: 0, WidthCm: 40, DepthCm: 30, HeightCm: 20}
	right := domain.StagePlotElement{ID: 2, PlotID: 1, LayerID: 1, Kind: "shape", ShapeKind: "rect",
		XCm: 500, YCm: 0, WidthCm: 40, DepthCm: 30, HeightCm: 20}
	one, two := int64(1), int64(2)
	measurement := domain.StagePlotMeasurement{
		ID: 1, PlotID: 1, LayerID: 1, View: "top", Type: "horizontal",
		From: domain.MeasurementAnchor{ElementID: &one, Feature: "face:+x"},
		To:   domain.MeasurementAnchor{ElementID: &two, Feature: "face:-x"},
	}
	doc := measurementDoc(t, []domain.StagePlotMeasurement{measurement},
		[]domain.StagePlotElement{left, right}, []domain.StagePlotLayer{visibleLayer(1)})

	if len(doc.measurements) != 1 {
		t.Fatalf("document carried %d measurements, want 1", len(doc.measurements))
	}
	drawing, ok := doc.measurementDrawingFor(measurement, ViewTop)
	if !ok {
		t.Fatal("the document could not derive the measurement")
	}
	// The inner faces are at u = 20 and u = 480 — the same 460 the TypeScript
	// suite asserts for the same geometry.
	if drawing.Value != 460 {
		t.Errorf("printed value = %v, want 460", drawing.Value)
	}
}

func TestDocumentDropsAMeasurementWhoseAnchorIsHidden(t *testing.T) {
	shown := domain.StagePlotElement{ID: 1, PlotID: 1, LayerID: 1, Kind: "shape", ShapeKind: "rect",
		XCm: 0, YCm: 0, WidthCm: 40, DepthCm: 30, HeightCm: 20}
	hiddenElement := domain.StagePlotElement{ID: 2, PlotID: 1, LayerID: 2, Kind: "shape", ShapeKind: "rect",
		XCm: 500, YCm: 0, WidthCm: 40, DepthCm: 30, HeightCm: 20}
	one, two := int64(1), int64(2)
	u, v := 900.0, 900.0

	layers := []domain.StagePlotLayer{visibleLayer(1), {ID: 2, PlotID: 1, Name: "Hidden", Visible: false}}
	measurements := []domain.StagePlotMeasurement{
		{ID: 1, PlotID: 1, LayerID: 1, View: "top", Type: "aligned",
			From: domain.MeasurementAnchor{ElementID: &one, Feature: "centre"},
			To:   domain.MeasurementAnchor{ElementID: &two, Feature: "centre"}},
		{ID: 2, PlotID: 1, LayerID: 2, View: "top", Type: "aligned",
			From: domain.MeasurementAnchor{UCm: &u, VCm: &v},
			To:   domain.MeasurementAnchor{ElementID: &one, Feature: "centre"}},
		{ID: 3, PlotID: 1, LayerID: 1, View: "top", Type: "aligned",
			From: domain.MeasurementAnchor{ElementID: &one, Feature: "centre"},
			To:   domain.MeasurementAnchor{UCm: &u, VCm: &v}},
	}
	doc := measurementDoc(t, measurements, []domain.StagePlotElement{shown, hiddenElement}, layers)

	// 1 anchors to something not on the drawing; 2 is on a hidden layer; only
	// 3 survives.
	if len(doc.measurements) != 1 || doc.measurements[0].ID != 3 {
		t.Fatalf("document carried %+v, want only measurement 3", doc.measurements)
	}
}

func TestDocumentDrawsOnlyThisViewsMeasurements(t *testing.T) {
	element := domain.StagePlotElement{ID: 1, PlotID: 1, LayerID: 1, Kind: "shape", ShapeKind: "rect",
		XCm: 0, YCm: 0, ZCm: 0, WidthCm: 40, DepthCm: 30, HeightCm: 200}
	one := int64(1)
	u, v := 300.0, 300.0
	measurements := []domain.StagePlotMeasurement{
		{ID: 1, PlotID: 1, LayerID: 1, View: "top", Type: "aligned",
			From: domain.MeasurementAnchor{ElementID: &one, Feature: "centre"},
			To:   domain.MeasurementAnchor{UCm: &u, VCm: &v}},
		{ID: 2, PlotID: 1, LayerID: 1, View: "front", Type: "vertical",
			From: domain.MeasurementAnchor{ElementID: &one, Feature: "face:-z"},
			To:   domain.MeasurementAnchor{ElementID: &one, Feature: "face:+z"}},
	}
	doc := measurementDoc(t, measurements, []domain.StagePlotElement{element}, []domain.StagePlotLayer{visibleLayer(1)})

	// The front view's measurement states the element's height and belongs to
	// that sheet alone.
	drawing, ok := doc.measurementDrawingFor(measurements[1], ViewFront)
	if !ok || drawing.Value != 200 {
		t.Errorf("height in the elevation = %v (ok=%v), want 200", drawing.Value, ok)
	}
	for _, measurement := range doc.measurements {
		if PlotView(measurement.View) == ViewTop && measurement.ID == 2 {
			t.Error("an elevation's measurement was claimed by the top view")
		}
	}
}

func TestVisibleMidpointFollowsTheSheet(t *testing.T) {
	// A dimension crossing a sheet division is drawn on every part it reaches,
	// and each part states the value in full — so the label rides the part of
	// the line THIS sheet can show, not a midpoint that may be on another.
	midX, midY, ok := visibleMidpoint(plotFrameX-200, plotFrameY+20, plotFrameX+40, plotFrameY+20)
	if !ok {
		t.Fatal("a line reaching into the frame reported nothing visible")
	}
	if midX < plotFrameX || midX > plotFrameX+plotFrameW {
		t.Errorf("label x = %v, outside the frame", midX)
	}
	// The visible part runs from the frame's left edge to x+40, so the label
	// sits near the middle of THAT, not at the segment's own midpoint.
	wantX := (plotFrameX + plotFrameX + 40) / 2
	if math.Abs(midX-wantX) > 4 {
		t.Errorf("label x = %v, want near %v", midX, wantX)
	}
	if math.Abs(midY-(plotFrameY+20)) > 0.001 {
		t.Errorf("label y = %v, want %v", midY, plotFrameY+20)
	}

	if _, _, ok := visibleMidpoint(plotFrameX-500, plotFrameY-500, plotFrameX-400, plotFrameY-400); ok {
		t.Error("a line entirely off the sheet reported a visible midpoint")
	}
}

// TestAMeasurementCrossingASheetDivisionStatesItselfOnBothParts is the
// requirement task 6.5 claims: a plot too wide for one sheet divides, and a
// dimension spanning the division is drawn on every part it reaches with its
// value in full — not clipped to one and left as a bare line on the other.
func TestAMeasurementCrossingASheetDivisionStatesItselfOnBothParts(t *testing.T) {
	// Far wider than the smallest scale on the ladder can fit in one frame.
	left := domain.StagePlotElement{ID: 1, PlotID: 1, LayerID: 1, Kind: "shape", ShapeKind: "rect",
		XCm: 0, YCm: 0, WidthCm: 100, DepthCm: 100, HeightCm: 100}
	right := domain.StagePlotElement{ID: 2, PlotID: 1, LayerID: 1, Kind: "shape", ShapeKind: "rect",
		XCm: 90000, YCm: 0, WidthCm: 100, DepthCm: 100, HeightCm: 100}
	one, two := int64(1), int64(2)
	measurement := domain.StagePlotMeasurement{
		ID: 1, PlotID: 1, LayerID: 1, View: "top", Type: "horizontal",
		From: domain.MeasurementAnchor{ElementID: &one, Feature: "centre"},
		To:   domain.MeasurementAnchor{ElementID: &two, Feature: "centre"},
	}
	doc := measurementDoc(t, []domain.StagePlotMeasurement{measurement},
		[]domain.StagePlotElement{left, right}, []domain.StagePlotLayer{visibleLayer(1)})

	topParts := 0
	for _, sheet := range doc.planSheets() {
		if sheet.view == ViewTop {
			topParts++
		}
	}
	if topParts < 2 {
		t.Fatalf("the top view drew on %d sheets; this plot is meant to divide", topParts)
	}

	drawing, ok := doc.measurementDrawingFor(measurement, ViewTop)
	if !ok {
		t.Fatal("the measurement stated no distance")
	}
	if drawing.Value != 90000 {
		t.Fatalf("value = %v, want 90000", drawing.Value)
	}

	// On every part the dimension reaches, the label finds somewhere visible to
	// sit — which is what makes each part state the distance rather than show a
	// line running off the edge.
	reached := 0
	for _, sheet := range doc.planSheets() {
		if sheet.view != ViewTop {
			continue
		}
		m := doc.mapper(sheet.view)
		m.tileU, m.tileV = sheet.tileU, sheet.tileV
		x1, y1 := m.X(drawing.LineA.U), m.Y(drawing.LineA.V)
		x2, y2 := m.X(drawing.LineB.U), m.Y(drawing.LineB.V)
		if _, _, ok := visibleMidpoint(x1, y1, x2, y2); ok {
			reached++
		}
	}
	if reached < 2 {
		t.Errorf("the measurement stated itself on %d parts, want at least 2", reached)
	}
}
