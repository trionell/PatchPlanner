package api

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

func seedMeasurableElement(t *testing.T, serverURL string, eventID, plotID, layerID int64, x, y float64) domain.StagePlotElement {
	t.Helper()
	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/stage-plots/%d/elements", serverURL, eventID, plotID),
		map[string]any{"layer_id": layerID, "kind": "shape", "shape_kind": "rect",
			"x_cm": x, "y_cm": y, "width_cm": 100, "depth_cm": 60, "height_cm": 40})
	if status != http.StatusCreated {
		t.Fatalf("create element: status %d body %s", status, raw)
	}
	return decodeJSON[domain.StagePlotElement](t, raw)
}

func measurementsURL(serverURL string, eventID, plotID int64) string {
	return fmt.Sprintf("%s/events/%d/stage-plots/%d/measurements", serverURL, eventID, plotID)
}

// TestMeasurementCRUD covers the round trip, the aggregate read, and that a
// measurement's value is never stored — only the anchors it is derived from.
func TestMeasurementCRUD(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	plot := seedStagePlot(t, server.URL, eventID, "Main stage")
	layer := getPlotResponse(t, server.URL, eventID, plot.ID).Layers[0]
	left := seedMeasurableElement(t, server.URL, eventID, plot.ID, layer.ID, 0, 0)
	right := seedMeasurableElement(t, server.URL, eventID, plot.ID, layer.ID, 500, 0)

	status, raw := doJSON(t, http.MethodPost, measurementsURL(server.URL, eventID, plot.ID), map[string]any{
		"layer_id": layer.ID, "view": "top", "type": "horizontal",
		"from":      map[string]any{"element_id": left.ID, "feature": "face:+x"},
		"to":        map[string]any{"element_id": right.ID, "feature": "face:-x"},
		"offset_cm": 150, "note": "PA span",
	})
	if status != http.StatusCreated {
		t.Fatalf("create measurement: status %d body %s", status, raw)
	}
	created := decodeJSON[domain.StagePlotMeasurement](t, raw)
	if created.From.ElementID == nil || *created.From.ElementID != left.ID || created.From.Feature != "face:+x" {
		t.Errorf("from end not stored as a reference: %+v", created.From)
	}
	if created.OffsetCm != 150 || created.Note != "PA span" {
		t.Errorf("offset or note not stored: %+v", created)
	}

	response := getPlotResponse(t, server.URL, eventID, plot.ID)
	if len(response.Measurements) != 1 {
		t.Fatalf("aggregate read carried %d measurements, want 1", len(response.Measurements))
	}

	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", measurementsURL(server.URL, eventID, plot.ID), created.ID),
		map[string]any{"type": "aligned", "offset_cm": -80})
	if status != http.StatusOK {
		t.Fatalf("patch measurement: status %d body %s", status, raw)
	}
	patched := decodeJSON[domain.StagePlotMeasurement](t, raw)
	if patched.Type != "aligned" || patched.OffsetCm != -80 {
		t.Errorf("patch not applied: %+v", patched)
	}
	// A PATCH that names neither end leaves both as they were.
	if patched.From.ElementID == nil || *patched.From.ElementID != left.ID || patched.To.Feature != "face:-x" {
		t.Errorf("patch lost an anchor: %+v / %+v", patched.From, patched.To)
	}

	status, raw = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/%d", measurementsURL(server.URL, eventID, plot.ID), created.ID), nil)
	if status != http.StatusNoContent {
		t.Fatalf("delete measurement: status %d body %s", status, raw)
	}
	if got := len(getPlotResponse(t, server.URL, eventID, plot.ID).Measurements); got != 0 {
		t.Errorf("measurements after delete = %d, want 0", got)
	}
}

// TestMeasurementReAnchorChangesKind is the edit a grip drag makes: an end
// stops being an element feature and becomes a free point, or the reverse.
func TestMeasurementReAnchorChangesKind(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	plot := seedStagePlot(t, server.URL, eventID, "Main stage")
	layer := getPlotResponse(t, server.URL, eventID, plot.ID).Layers[0]
	element := seedMeasurableElement(t, server.URL, eventID, plot.ID, layer.ID, 0, 0)

	status, raw := doJSON(t, http.MethodPost, measurementsURL(server.URL, eventID, plot.ID), map[string]any{
		"layer_id": layer.ID, "view": "top", "type": "aligned",
		"from": map[string]any{"element_id": element.ID, "feature": "centre"},
		"to":   map[string]any{"u_cm": 500, "v_cm": 0},
	})
	if status != http.StatusCreated {
		t.Fatalf("create: status %d body %s", status, raw)
	}
	created := decodeJSON[domain.StagePlotMeasurement](t, raw)
	url := fmt.Sprintf("%s/%d", measurementsURL(server.URL, eventID, plot.ID), created.ID)

	// Element end dragged onto open space.
	status, raw = doJSON(t, http.MethodPatch, url, map[string]any{"from": map[string]any{"u_cm": -300, "v_cm": -300}})
	if status != http.StatusOK {
		t.Fatalf("element end to a free point: status %d body %s", status, raw)
	}
	freed := decodeJSON[domain.StagePlotMeasurement](t, raw)
	if freed.From.ElementID != nil {
		t.Errorf("the from end kept its element: %+v", freed.From)
	}
	if freed.From.UCm == nil || *freed.From.UCm != -300 {
		t.Errorf("the from end did not become the free point: %+v", freed.From)
	}

	// …and back onto the element.
	status, raw = doJSON(t, http.MethodPatch, url, map[string]any{"from": map[string]any{"element_id": element.ID, "feature": "face:+x"}})
	if status != http.StatusOK {
		t.Fatalf("free point back onto an element: status %d body %s", status, raw)
	}
	reanchored := decodeJSON[domain.StagePlotMeasurement](t, raw)
	if reanchored.From.ElementID == nil || *reanchored.From.ElementID != element.ID {
		t.Errorf("the from end did not take the element: %+v", reanchored.From)
	}
	if reanchored.From.UCm != nil || reanchored.From.VCm != nil {
		t.Errorf("the from end kept its free point beside the element: %+v", reanchored.From)
	}

	// An untouched end stays exactly as it was.
	if reanchored.To.UCm == nil || *reanchored.To.UCm != 500 {
		t.Errorf("the to end moved when only the from end was patched: %+v", reanchored.To)
	}
}

func TestMeasurementFreeEndpoints(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	plot := seedStagePlot(t, server.URL, eventID, "Main stage")
	layer := getPlotResponse(t, server.URL, eventID, plot.ID).Layers[0]
	element := seedMeasurableElement(t, server.URL, eventID, plot.ID, layer.ID, 0, 0)

	status, raw := doJSON(t, http.MethodPost, measurementsURL(server.URL, eventID, plot.ID), map[string]any{
		"layer_id": layer.ID, "view": "top", "type": "aligned",
		"from": map[string]any{"u_cm": -400, "v_cm": -400},
		"to":   map[string]any{"element_id": element.ID, "feature": "centre"},
	})
	if status != http.StatusCreated {
		t.Fatalf("free-to-element measurement: status %d body %s", status, raw)
	}
	created := decodeJSON[domain.StagePlotMeasurement](t, raw)
	if created.From.UCm == nil || *created.From.UCm != -400 || created.From.ElementID != nil {
		t.Errorf("free end not stored as a point: %+v", created.From)
	}

	// Two free points are a valid measurement: nothing has to exist to state a
	// distance between two places on the stage.
	status, raw = doJSON(t, http.MethodPost, measurementsURL(server.URL, eventID, plot.ID), map[string]any{
		"layer_id": layer.ID, "view": "top", "type": "aligned",
		"from": map[string]any{"u_cm": 0, "v_cm": 0},
		"to":   map[string]any{"u_cm": 300, "v_cm": 400},
	})
	if status != http.StatusCreated {
		t.Fatalf("free-to-free measurement: status %d body %s", status, raw)
	}
}

// TestMeasurementSlideSurvives is the field the plane anchor hinges on: stored
// as an INTEGER, read back as a bool, and omitted from JSON when false. If it
// silently came back false, every plane measurement would quietly become a
// measurement to that face's midpoint.
func TestMeasurementSlideSurvives(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	plot := seedStagePlot(t, server.URL, eventID, "Main stage")
	layer := getPlotResponse(t, server.URL, eventID, plot.ID).Layers[0]
	element := seedMeasurableElement(t, server.URL, eventID, plot.ID, layer.ID, 0, 0)

	status, raw := doJSON(t, http.MethodPost, measurementsURL(server.URL, eventID, plot.ID), map[string]any{
		"layer_id": layer.ID, "view": "top", "type": "aligned",
		"from": map[string]any{"element_id": element.ID, "feature": "face:+x", "slide": true},
		"to":   map[string]any{"u_cm": 900, "v_cm": 900},
	})
	if status != http.StatusCreated {
		t.Fatalf("create a plane measurement: status %d body %s", status, raw)
	}
	if created := decodeJSON[domain.StagePlotMeasurement](t, raw); !created.From.Slide {
		t.Fatalf("slide was lost on the way out: %+v", created.From)
	}

	reread := getPlotResponse(t, server.URL, eventID, plot.ID).Measurements
	if len(reread) != 1 || !reread[0].From.Slide {
		t.Errorf("slide was lost on the way back: %+v", reread)
	}
	if reread[0].To.Slide {
		t.Errorf("a free point came back sliding: %+v", reread[0].To)
	}
}

// TestMeasurementOnATrussFace: a truss element carries no geometry of its own —
// the row is all zeros and its size comes from its truss. Validated raw it is a
// zero-sized box, and every plane anchor on it is refused in every view.
func TestMeasurementOnATrussFace(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	plot := seedStagePlot(t, server.URL, eventID, "Main stage")
	layer := getPlotResponse(t, server.URL, eventID, plot.ID).Layers[0]

	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/plot-trusses", server.URL, eventID),
		map[string]any{"name": "Bar", "height_cm": 400})
	if status != http.StatusCreated {
		t.Fatalf("create truss: status %d body %s", status, raw)
	}
	truss := decodeJSON[domain.PlotTruss](t, raw)
	if status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/plot-trusses/%d/pieces", server.URL, eventID, truss.ID),
		map[string]any{"length_cm": 600}); status != http.StatusCreated {
		t.Fatalf("add piece: status %d body %s", status, raw)
	}

	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/stage-plots/%d/elements", server.URL, eventID, plot.ID),
		map[string]any{"layer_id": layer.ID, "kind": "truss", "truss_id": truss.ID})
	if status != http.StatusCreated {
		t.Fatalf("place truss: status %d body %s", status, raw)
	}
	element := decodeJSON[domain.StagePlotElement](t, raw)
	if element.WidthCm != 0 || element.HeightCm != 0 {
		t.Fatalf("this test assumes a truss row stores no geometry; it stored %+v", element)
	}

	// Its long sides, in each view that draws them edge-on.
	for _, tc := range []struct{ view, feature string }{
		{"top", "face:+y"},
		{"front", "face:+z"},
		{"side", "face:+y"},
	} {
		status, raw := doJSON(t, http.MethodPost, measurementsURL(server.URL, eventID, plot.ID), map[string]any{
			"layer_id": layer.ID, "view": tc.view, "type": "aligned",
			"from": map[string]any{"element_id": element.ID, "feature": tc.feature, "slide": true},
			"to":   map[string]any{"u_cm": 1500, "v_cm": 1500},
		})
		if status != http.StatusCreated {
			t.Errorf("%s view, %s: status %d body %s", tc.view, tc.feature, status, raw)
		}
	}
}

func TestMeasurementValidation(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	plot := seedStagePlot(t, server.URL, eventID, "Main stage")
	layer := getPlotResponse(t, server.URL, eventID, plot.ID).Layers[0]
	element := seedMeasurableElement(t, server.URL, eventID, plot.ID, layer.ID, 0, 0)

	otherPlot := seedStagePlot(t, server.URL, eventID, "Second stage")
	otherLayer := getPlotResponse(t, server.URL, eventID, otherPlot.ID).Layers[0]
	foreign := seedMeasurableElement(t, server.URL, eventID, otherPlot.ID, otherLayer.ID, 0, 0)

	ellipseStatus, ellipseRaw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/stage-plots/%d/elements", server.URL, eventID, plot.ID),
		map[string]any{"layer_id": layer.ID, "kind": "shape", "shape_kind": "ellipse", "width_cm": 200, "depth_cm": 200, "height_cm": 10})
	if ellipseStatus != http.StatusCreated {
		t.Fatalf("create ellipse: status %d body %s", ellipseStatus, ellipseRaw)
	}
	ellipse := decodeJSON[domain.StagePlotElement](t, ellipseRaw)

	elementEnd := map[string]any{"element_id": element.ID, "feature": "centre"}
	cases := []struct {
		name string
		body map[string]any
	}{
		{"unknown view", map[string]any{"layer_id": layer.ID, "view": "isometric", "type": "aligned",
			"from": elementEnd, "to": map[string]any{"u_cm": 100, "v_cm": 100}}},
		{"unknown type", map[string]any{"layer_id": layer.ID, "view": "top", "type": "diagonal",
			"from": elementEnd, "to": map[string]any{"u_cm": 100, "v_cm": 100}}},
		{"an end that is both", map[string]any{"layer_id": layer.ID, "view": "top", "type": "aligned",
			"from": map[string]any{"element_id": element.ID, "feature": "centre", "u_cm": 10, "v_cm": 10},
			"to":   map[string]any{"u_cm": 100, "v_cm": 100}}},
		{"an end that is neither", map[string]any{"layer_id": layer.ID, "view": "top", "type": "aligned",
			"from": map[string]any{}, "to": map[string]any{"u_cm": 100, "v_cm": 100}}},
		{"an unreadable feature", map[string]any{"layer_id": layer.ID, "view": "top", "type": "aligned",
			"from": map[string]any{"element_id": element.ID, "feature": "corner:++"},
			"to":   map[string]any{"u_cm": 100, "v_cm": 100}}},
		{"an element on another plot", map[string]any{"layer_id": layer.ID, "view": "top", "type": "aligned",
			"from": map[string]any{"element_id": foreign.ID, "feature": "centre"},
			"to":   map[string]any{"u_cm": 100, "v_cm": 100}}},
		{"a face seen flat", map[string]any{"layer_id": layer.ID, "view": "top", "type": "aligned",
			"from": map[string]any{"element_id": element.ID, "feature": "face:+z", "slide": true},
			"to":   map[string]any{"u_cm": 100, "v_cm": 100}}},
		{"a sliding ellipse", map[string]any{"layer_id": layer.ID, "view": "top", "type": "aligned",
			"from": map[string]any{"element_id": ellipse.ID, "feature": "face:+x", "slide": true},
			"to":   map[string]any{"u_cm": 100, "v_cm": 100}}},
		{"two faces that are not parallel", map[string]any{"layer_id": layer.ID, "view": "top", "type": "aligned",
			"from": map[string]any{"element_id": element.ID, "feature": "face:+x", "slide": true},
			"to":   map[string]any{"element_id": element.ID, "feature": "face:+y", "slide": true}}},
		{"two points in the same place", map[string]any{"layer_id": layer.ID, "view": "top", "type": "aligned",
			"from": map[string]any{"u_cm": 50, "v_cm": 50}, "to": map[string]any{"u_cm": 50, "v_cm": 50}}},
		{"a free point that slides", map[string]any{"layer_id": layer.ID, "view": "top", "type": "aligned",
			"from": map[string]any{"u_cm": 50, "v_cm": 50, "slide": true},
			"to":   map[string]any{"u_cm": 100, "v_cm": 100}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, raw := doJSON(t, http.MethodPost, measurementsURL(server.URL, eventID, plot.ID), tc.body)
			if status != http.StatusBadRequest {
				t.Errorf("status %d body %s, want 400", status, raw)
			}
		})
	}
}

// TestMeasurementCascade is the schema's promise that no measurement can
// outlive what it points at.
func TestMeasurementCascade(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	plot := seedStagePlot(t, server.URL, eventID, "Main stage")
	layer := getPlotResponse(t, server.URL, eventID, plot.ID).Layers[0]
	doomed := seedMeasurableElement(t, server.URL, eventID, plot.ID, layer.ID, 0, 0)
	survivor := seedMeasurableElement(t, server.URL, eventID, plot.ID, layer.ID, 500, 0)

	create := func(body map[string]any) {
		t.Helper()
		status, raw := doJSON(t, http.MethodPost, measurementsURL(server.URL, eventID, plot.ID), body)
		if status != http.StatusCreated {
			t.Fatalf("create measurement: status %d body %s", status, raw)
		}
	}
	base := func(from, to map[string]any) map[string]any {
		return map[string]any{"layer_id": layer.ID, "view": "top", "type": "aligned", "from": from, "to": to}
	}
	doomedEnd := map[string]any{"element_id": doomed.ID, "feature": "centre"}
	survivorEnd := map[string]any{"element_id": survivor.ID, "feature": "centre"}
	freePoint := map[string]any{"u_cm": -300, "v_cm": -300}

	create(base(doomedEnd, survivorEnd))                                                   // anchored at the from end
	create(base(freePoint, doomedEnd))                                                     // anchored at the to end
	create(base(map[string]any{"element_id": doomed.ID, "feature": "face:+x"}, doomedEnd)) // both ends on it
	create(base(freePoint, map[string]any{"u_cm": 400, "v_cm": 400}))                      // touches nothing
	create(base(survivorEnd, map[string]any{"u_cm": 900, "v_cm": 900}))                    // touches the survivor

	if got := len(getPlotResponse(t, server.URL, eventID, plot.ID).Measurements); got != 5 {
		t.Fatalf("seeded %d measurements, want 5", got)
	}

	status, raw := doJSON(t, http.MethodDelete, fmt.Sprintf("%s/events/%d/stage-plots/%d/elements/%d", server.URL, eventID, plot.ID, doomed.ID), nil)
	if status != http.StatusNoContent {
		t.Fatalf("delete element: status %d body %s", status, raw)
	}

	remaining := getPlotResponse(t, server.URL, eventID, plot.ID).Measurements
	if len(remaining) != 2 {
		t.Fatalf("measurements after the delete = %d, want 2 (the free-to-free one and the survivor's)", len(remaining))
	}
	for _, m := range remaining {
		if (m.From.ElementID != nil && *m.From.ElementID == doomed.ID) || (m.To.ElementID != nil && *m.To.ElementID == doomed.ID) {
			t.Errorf("a measurement still points at the deleted element: %+v", m)
		}
	}
}
