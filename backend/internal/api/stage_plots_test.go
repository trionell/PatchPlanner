package api

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

func seedStagePlot(t *testing.T, serverURL string, eventID int64, name string) domain.StagePlot {
	t.Helper()
	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/stage-plots", serverURL, eventID), map[string]string{"name": name})
	if status != http.StatusCreated {
		t.Fatalf("create stage plot: status %d body %s", status, raw)
	}
	return decodeJSON[domain.StagePlot](t, raw)
}

func getPlotResponse(t *testing.T, serverURL string, eventID, plotID int64) domain.StagePlotResponse {
	t.Helper()
	status, raw := doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/stage-plots/%d", serverURL, eventID, plotID), nil)
	if status != http.StatusOK {
		t.Fatalf("get stage plot: status %d body %s", status, raw)
	}
	return decodeJSON[domain.StagePlotResponse](t, raw)
}

// TestStagePlotCRUD covers plot creation (with its default layer),
// settings PATCH round-trips, and cascade deletion.
func TestStagePlotCRUD(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)

	plot := seedStagePlot(t, server.URL, eventID, "Main stage")
	if plot.GridSizeCm != 25 || !plot.GridVisible || plot.ActiveView != "top" {
		t.Errorf("unexpected defaults: %+v", plot)
	}

	// Creating a plot creates its default layer.
	response := getPlotResponse(t, server.URL, eventID, plot.ID)
	if len(response.Layers) != 1 || response.Layers[0].Name != "Layer 1" {
		t.Fatalf("expected default layer, got %+v", response.Layers)
	}
	if response.Elements == nil || response.Trusses == nil {
		t.Error("aggregate arrays must be present even when empty")
	}

	// Settings PATCH round-trip.
	status, raw := doJSON(t, http.MethodPatch, fmt.Sprintf("%s/events/%d/stage-plots/%d", server.URL, eventID, plot.ID),
		map[string]any{"grid_size_cm": 50, "snap_objects": false, "active_view": "front", "name": "Huvudscen"})
	if status != http.StatusOK {
		t.Fatalf("patch plot: status %d body %s", status, raw)
	}
	patched := decodeJSON[domain.StagePlot](t, raw)
	if patched.GridSizeCm != 50 || patched.SnapObjects || patched.ActiveView != "front" || patched.Name != "Huvudscen" {
		t.Errorf("patch not applied: %+v", patched)
	}
	if !patched.SnapGrid || !patched.GridVisible {
		t.Errorf("untouched settings must persist: %+v", patched)
	}

	// Validation: bad grid size and bad view.
	if status, _ = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/events/%d/stage-plots/%d", server.URL, eventID, plot.ID), map[string]any{"grid_size_cm": 0}); status != http.StatusBadRequest {
		t.Errorf("zero grid size: status %d, want 400", status)
	}
	if status, _ = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/events/%d/stage-plots/%d", server.URL, eventID, plot.ID), map[string]any{"active_view": "iso"}); status != http.StatusBadRequest {
		t.Errorf("bad view: status %d, want 400", status)
	}

	// A second plot lists in order; plots are event-scoped.
	seedStagePlot(t, server.URL, eventID, "FOH")
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/stage-plots", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("list plots: status %d", status)
	}
	plots := decodeJSON[[]domain.StagePlot](t, raw)
	if len(plots) != 2 || plots[0].Name != "Huvudscen" || plots[1].Name != "FOH" {
		t.Errorf("unexpected plot list: %+v", plots)
	}

	// Unknown event 404s on create; unknown plot 404s on read.
	if status, _ = doJSON(t, http.MethodPost, server.URL+"/events/99999/stage-plots", map[string]string{"name": "x"}); status != http.StatusNotFound {
		t.Errorf("create on missing event: status %d, want 404", status)
	}
	if status, _ = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/stage-plots/99999", server.URL, eventID), nil); status != http.StatusNotFound {
		t.Errorf("get missing plot: status %d, want 404", status)
	}

	// Delete cascades.
	if status, _ = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/events/%d/stage-plots/%d", server.URL, eventID, plot.ID), nil); status != http.StatusNoContent {
		t.Fatalf("delete plot: status %d", status)
	}
	if status, _ = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/stage-plots/%d", server.URL, eventID, plot.ID), nil); status != http.StatusNotFound {
		t.Errorf("deleted plot still readable: status %d", status)
	}
}

// TestStagePlotLayers covers layer CRUD and the last-layer 409 rule.
func TestStagePlotLayers(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	plot := seedStagePlot(t, server.URL, eventID, "Main stage")
	base := fmt.Sprintf("%s/events/%d/stage-plots/%d", server.URL, eventID, plot.ID)

	defaultLayer := getPlotResponse(t, server.URL, eventID, plot.ID).Layers[0]

	// The plot's only layer cannot be deleted.
	if status, _ := doJSON(t, http.MethodDelete, fmt.Sprintf("%s/layers/%d", base, defaultLayer.ID), nil); status != http.StatusConflict {
		t.Errorf("delete last layer: status %d, want 409", status)
	}

	status, raw := doJSON(t, http.MethodPost, base+"/layers", map[string]string{"name": "Lighting", "color": "#f59e0b"})
	if status != http.StatusCreated {
		t.Fatalf("create layer: status %d body %s", status, raw)
	}
	lighting := decodeJSON[domain.StagePlotLayer](t, raw)
	if lighting.Color != "#f59e0b" || !lighting.Visible || lighting.Locked {
		t.Errorf("unexpected layer defaults: %+v", lighting)
	}
	if lighting.SortOrder <= defaultLayer.SortOrder {
		t.Errorf("new layer must append after existing (got %d <= %d)", lighting.SortOrder, defaultLayer.SortOrder)
	}

	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/layers/%d", base, lighting.ID), map[string]any{"visible": false, "locked": true, "name": "Ljus"})
	if status != http.StatusOK {
		t.Fatalf("patch layer: status %d body %s", status, raw)
	}
	patched := decodeJSON[domain.StagePlotLayer](t, raw)
	if patched.Visible || !patched.Locked || patched.Name != "Ljus" {
		t.Errorf("layer patch not applied: %+v", patched)
	}

	// With two layers, deleting one works — and takes its elements with it.
	status, raw = doJSON(t, http.MethodPost, base+"/elements", map[string]any{
		"layer_id": lighting.ID, "kind": "shape", "shape_kind": "rect", "width_cm": 100, "depth_cm": 50})
	if status != http.StatusCreated {
		t.Fatalf("create element on layer: status %d body %s", status, raw)
	}
	if status, _ = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/layers/%d", base, lighting.ID), nil); status != http.StatusNoContent {
		t.Fatalf("delete layer: status %d", status)
	}
	response := getPlotResponse(t, server.URL, eventID, plot.ID)
	if len(response.Layers) != 1 || len(response.Elements) != 0 {
		t.Errorf("layer delete must cascade its elements: layers=%d elements=%d", len(response.Layers), len(response.Elements))
	}
}

// TestStagePlotElementLinks covers assignments/stack entries: kind and
// target validation, duplicate rejection, delete-path cleanup, dangling
// resolution, and rental invariance (FR-013/FR-014/FR-015).
func TestStagePlotElementLinks(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	micID := seedRoleItem(t, database, "", "Shure SM58", "", 4, 150)
	plot := seedStagePlot(t, server.URL, eventID, "Main stage")
	base := fmt.Sprintf("%s/events/%d/stage-plots/%d", server.URL, eventID, plot.ID)
	layerID := getPlotResponse(t, server.URL, eventID, plot.ID).Layers[0].ID

	// A drummer resource and a planned Source to assign to it.
	status, raw := doJSON(t, http.MethodPost, base+"/elements", map[string]any{
		"layer_id": layerID, "kind": "resource", "icon": "person", "name": "Anna — Drums", "width_cm": 60, "depth_cm": 40})
	if status != http.StatusCreated {
		t.Fatalf("create element: status %d body %s", status, raw)
	}
	element := decodeJSON[domain.StagePlotElement](t, raw)
	linksURL := fmt.Sprintf("%s/elements/%d/links", base, element.ID)

	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/input-sources", server.URL, eventID), map[string]any{
		"name": "Kick", "kind": "mic", "mic_item_id": micID, "connector_type": "xlr", "width": "mono"})
	if status != http.StatusCreated {
		t.Fatalf("create source: status %d body %s", status, raw)
	}
	source := decodeJSON[domain.InputSource](t, raw)

	rentalBefore, _ := doJSONBody(t, server.URL, eventID)

	// Validation: bad role, bad kind, missing target.
	if status, _ = doJSON(t, http.MethodPost, linksURL, map[string]any{"role": "tag", "entity_kind": "input_source", "entity_id": source.ID}); status != http.StatusBadRequest {
		t.Errorf("bad role accepted: %d", status)
	}
	if status, _ = doJSON(t, http.MethodPost, linksURL, map[string]any{"role": "assignment", "entity_kind": "widget", "entity_id": 1}); status != http.StatusBadRequest {
		t.Errorf("bad entity kind accepted: %d", status)
	}
	if status, _ = doJSON(t, http.MethodPost, linksURL, map[string]any{"role": "assignment", "entity_kind": "input_source", "entity_id": 99999}); status != http.StatusNotFound {
		t.Errorf("missing target accepted: %d", status)
	}

	// Create; duplicate → 409.
	status, raw = doJSON(t, http.MethodPost, linksURL, map[string]any{"role": "assignment", "entity_kind": "input_source", "entity_id": source.ID})
	if status != http.StatusCreated {
		t.Fatalf("create link: status %d body %s", status, raw)
	}
	link := decodeJSON[domain.StagePlotLink](t, raw)
	if link.DisplayName != "Kick" {
		t.Errorf("display name = %q, want Kick", link.DisplayName)
	}
	if status, _ = doJSON(t, http.MethodPost, linksURL, map[string]any{"role": "assignment", "entity_kind": "input_source", "entity_id": source.ID}); status != http.StatusConflict {
		t.Errorf("duplicate link accepted: %d", status)
	}

	// The aggregate read resolves the link on its element.
	response := getPlotResponse(t, server.URL, eventID, plot.ID)
	if len(response.Elements) != 1 || len(response.Elements[0].Links) != 1 || response.Elements[0].Links[0].DisplayName != "Kick" {
		t.Fatalf("aggregate link resolution wrong: %+v", response.Elements)
	}

	// FR-015: linking changed nothing on the rental order.
	rentalAfter, _ := doJSONBody(t, server.URL, eventID)
	if rentalBefore != rentalAfter {
		t.Errorf("rental summary changed by plot links:\nbefore %s\nafter  %s", rentalBefore, rentalAfter)
	}

	// Deleting the Source clears the link (delete-path cleanup).
	if status, _ = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/events/%d/input-sources/%d", server.URL, eventID, source.ID), nil); status != http.StatusNoContent {
		t.Fatalf("delete source failed: %d", status)
	}
	response = getPlotResponse(t, server.URL, eventID, plot.ID)
	if len(response.Elements[0].Links) != 0 {
		t.Errorf("link survived its entity's deletion: %+v", response.Elements[0].Links)
	}
	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM stage_plot_element_links`).Scan(&count); err != nil || count != 0 {
		t.Errorf("link row not cleaned up (count %d, err %v)", count, err)
	}

	// Stack entries: same table, ordered, reorderable.
	speakerID := seedRoleItem(t, database, "", "RCF ART 732", "", 4, 300)
	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/output-devices", server.URL, eventID), map[string]any{
		"name": "RCF 732 top", "inventory_item_id": speakerID, "input_port_count": 1, "input_connector_type": "speakon", "output_port_count": 0, "output_connector_type": ""})
	if status != http.StatusCreated {
		t.Fatalf("create output device: status %d body %s", status, raw)
	}
	device := decodeJSON[domain.OutputDevice](t, raw)
	status, raw = doJSON(t, http.MethodPost, linksURL, map[string]any{"role": "stack", "entity_kind": "output_device", "entity_id": device.ID, "sort_order": 1})
	if status != http.StatusCreated {
		t.Fatalf("create stack entry: status %d body %s", status, raw)
	}
	stackLink := decodeJSON[domain.StagePlotLink](t, raw)
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", linksURL, stackLink.ID), map[string]any{"sort_order": 3})
	if status != http.StatusOK {
		t.Fatalf("reorder stack entry: status %d body %s", status, raw)
	}
	if decodeJSON[domain.StagePlotLink](t, raw).SortOrder != 3 {
		t.Error("sort_order not updated")
	}
	if status, _ = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/%d", linksURL, stackLink.ID), nil); status != http.StatusNoContent {
		t.Errorf("delete link failed")
	}
}

// TestPlotTrusses covers event-scoped truss CRUD, pieces (summed
// length), fixture attach/move/detach, and plot placement rules (US5).
func TestPlotTrusses(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	trussesURL := fmt.Sprintf("%s/events/%d/plot-trusses", server.URL, eventID)
	trussItemID := seedRoleItem(t, database, "truss", "Tross F34 2m", "", 10, 100)

	// Create truss; height validation.
	if status, _ := doJSON(t, http.MethodPost, trussesURL, map[string]any{"name": "Front truss", "height_cm": -1}); status != http.StatusBadRequest {
		t.Errorf("negative height accepted: %d", status)
	}
	status, raw := doJSON(t, http.MethodPost, trussesURL, map[string]any{"name": "Front truss", "height_cm": 400})
	if status != http.StatusCreated {
		t.Fatalf("create truss: status %d body %s", status, raw)
	}
	truss := decodeJSON[domain.PlotTruss](t, raw)
	trussURL := fmt.Sprintf("%s/%d", trussesURL, truss.ID)

	// Pieces: validation and exact summed length (FR-023).
	if status, _ = doJSON(t, http.MethodPost, trussURL+"/pieces", map[string]any{"length_cm": 0}); status != http.StatusBadRequest {
		t.Errorf("zero-length piece accepted: %d", status)
	}
	if status, _ = doJSON(t, http.MethodPost, trussURL+"/pieces", map[string]any{"inventory_item_id": 99999, "length_cm": 200}); status != http.StatusBadRequest {
		t.Errorf("missing item accepted: %d", status)
	}
	for i := 0; i < 3; i++ {
		status, raw = doJSON(t, http.MethodPost, trussURL+"/pieces", map[string]any{"inventory_item_id": trussItemID, "length_cm": 200})
		if status != http.StatusCreated {
			t.Fatalf("create piece %d: status %d body %s", i, status, raw)
		}
	}
	truss = decodeJSON[domain.PlotTruss](t, raw)
	if truss.TotalLengthCm != 600 || len(truss.Pieces) != 3 || truss.Pieces[0].ItemName != "Tross F34 2m" {
		t.Fatalf("truss after pieces: total %v pieces %d", truss.TotalLengthCm, len(truss.Pieces))
	}

	// Fixture attach at an offset; moving to another truss is an upsert.
	rigID, _ := lightingRigOf(t, server.URL, eventID)
	status, raw = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/lighting-rigs/%d/fixtures", server.URL, eventID, rigID), map[string]any{
		"custom_name": "Spot 1", "dmx_universe": 1, "dmx_start_address": 1, "power_connection": "grid", "power_connector_in": "schuko"})
	if status != http.StatusCreated {
		t.Fatalf("create fixture: status %d body %s", status, raw)
	}
	fixture := decodeJSON[domain.LightingFixture](t, raw)

	status, raw = doJSON(t, http.MethodPut, fmt.Sprintf("%s/fixtures/%d", trussURL, fixture.ID), map[string]any{"offset_cm": 100})
	if status != http.StatusOK {
		t.Fatalf("attach fixture: status %d body %s", status, raw)
	}
	truss = decodeJSON[domain.PlotTruss](t, raw)
	if len(truss.Fixtures) != 1 || truss.Fixtures[0].OffsetCm == nil || *truss.Fixtures[0].OffsetCm != 100 || truss.Fixtures[0].FixtureName != "Spot 1" {
		t.Fatalf("attached fixture wrong: %+v", truss.Fixtures)
	}
	if truss.Fixtures[0].Side != "middle" {
		t.Fatalf("side must default to middle, got %q", truss.Fixtures[0].Side)
	}

	// Side lanes (drag-and-drop placement): persisted and validated.
	status, raw = doJSON(t, http.MethodPut, fmt.Sprintf("%s/fixtures/%d", trussURL, fixture.ID), map[string]any{"offset_cm": 100, "side": "top"})
	if status != http.StatusOK {
		t.Fatalf("re-attach with side: status %d body %s", status, raw)
	}
	if truss = decodeJSON[domain.PlotTruss](t, raw); truss.Fixtures[0].Side != "top" {
		t.Fatalf("side not persisted: %+v", truss.Fixtures[0])
	}
	if status, _ = doJSON(t, http.MethodPut, fmt.Sprintf("%s/fixtures/%d", trussURL, fixture.ID), map[string]any{"side": "diagonal"}); status != http.StatusBadRequest {
		t.Fatalf("invalid side must 400, got %d", status)
	}

	status, raw = doJSON(t, http.MethodPost, trussesURL, map[string]any{"name": "Back truss"})
	if status != http.StatusCreated {
		t.Fatal("create second truss failed")
	}
	backTruss := decodeJSON[domain.PlotTruss](t, raw)
	status, raw = doJSON(t, http.MethodPut, fmt.Sprintf("%s/%d/fixtures/%d", trussesURL, backTruss.ID, fixture.ID), map[string]any{"offset_cm": 50})
	if status != http.StatusOK {
		t.Fatalf("move fixture: status %d body %s", status, raw)
	}
	if moved := decodeJSON[domain.PlotTruss](t, raw); len(moved.Fixtures) != 1 {
		t.Fatal("fixture did not move to second truss")
	}
	status, raw = doJSON(t, http.MethodGet, trussesURL, nil)
	if status != http.StatusOK {
		t.Fatal("list trusses failed")
	}
	all := decodeJSON[[]domain.PlotTruss](t, raw)
	if len(all[0].Fixtures) != 0 {
		t.Error("fixture still attached to first truss after move (must hang on at most one)")
	}

	// Plot placement: once per plot, twice across plots.
	plot := seedStagePlot(t, server.URL, eventID, "Main stage")
	base := fmt.Sprintf("%s/events/%d/stage-plots/%d", server.URL, eventID, plot.ID)
	layerID := getPlotResponse(t, server.URL, eventID, plot.ID).Layers[0].ID
	body := map[string]any{"layer_id": layerID, "kind": "truss", "truss_id": truss.ID, "depth_cm": 30}
	if status, raw = doJSON(t, http.MethodPost, base+"/elements", body); status != http.StatusCreated {
		t.Fatalf("place truss: status %d body %s", status, raw)
	}
	if status, _ = doJSON(t, http.MethodPost, base+"/elements", body); status != http.StatusConflict {
		t.Errorf("second placement on same plot accepted: %d", status)
	}
	otherPlot := seedStagePlot(t, server.URL, eventID, "FOH")
	otherBase := fmt.Sprintf("%s/events/%d/stage-plots/%d", server.URL, eventID, otherPlot.ID)
	otherLayer := getPlotResponse(t, server.URL, eventID, otherPlot.ID).Layers[0].ID
	if status, _ = doJSON(t, http.MethodPost, otherBase+"/elements", map[string]any{"layer_id": otherLayer, "kind": "truss", "truss_id": truss.ID, "depth_cm": 30}); status != http.StatusCreated {
		t.Errorf("placement on second plot rejected: %d", status)
	}

	// Aggregate read carries the event's trusses.
	if response := getPlotResponse(t, server.URL, eventID, plot.ID); len(response.Trusses) != 2 {
		t.Errorf("aggregate trusses = %d, want 2", len(response.Trusses))
	}

	// Deleting the truss removes placements but never the rig fixture.
	if status, _ = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/%d", trussesURL, backTruss.ID), nil); status != http.StatusNoContent {
		t.Fatal("delete truss failed")
	}
	if _, fixtures := lightingRigOf(t, server.URL, eventID); len(fixtures) != 1 {
		t.Error("rig fixture deleted with truss")
	}
}

// doJSONBody fetches the rental summary body for byte-identical
// comparison (FR-015).
func doJSONBody(t *testing.T, serverURL string, eventID int64) (string, int) {
	t.Helper()
	status, raw := doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/rentals", serverURL, eventID), nil)
	return string(raw), status
}

// TestStagePlotElementValidation covers the kind-field matrix and
// spatial PATCHes.
func TestStagePlotElementValidation(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	plot := seedStagePlot(t, server.URL, eventID, "Main stage")
	base := fmt.Sprintf("%s/events/%d/stage-plots/%d", server.URL, eventID, plot.ID)
	layerID := getPlotResponse(t, server.URL, eventID, plot.ID).Layers[0].ID

	badBodies := []map[string]any{
		{"layer_id": layerID, "kind": "shape", "width_cm": 100},                                           // missing shape_kind
		{"layer_id": layerID, "kind": "shape", "shape_kind": "blob", "width_cm": 100},                     // bad shape_kind
		{"layer_id": layerID, "kind": "shape", "shape_kind": "rect", "icon": "person", "width_cm": 100},   // shape with icon
		{"layer_id": layerID, "kind": "resource", "width_cm": 50},                                         // missing icon
		{"layer_id": layerID, "kind": "resource", "icon": "person", "shape_kind": "rect", "width_cm": 50}, // resource with shape_kind
		{"layer_id": layerID, "kind": "resource", "icon": "person", "width_cm": 0},                        // zero width
		{"layer_id": layerID, "kind": "resource", "icon": "person", "width_cm": 50, "depth_cm": -1},       // negative depth
		{"layer_id": layerID, "kind": "truss"},                                                            // missing truss_id
		{"layer_id": layerID, "kind": "fixture"},                                                          // missing fixture_id
		{"layer_id": layerID, "kind": "sticker", "width_cm": 10},                                          // unknown kind
	}
	for i, body := range badBodies {
		if status, _ := doJSON(t, http.MethodPost, base+"/elements", body); status != http.StatusBadRequest {
			t.Errorf("bad element body %d accepted (status %d)", i, status)
		}
	}

	// A truss placement referencing a truss that doesn't exist → 404.
	if status, _ := doJSON(t, http.MethodPost, base+"/elements", map[string]any{"layer_id": layerID, "kind": "truss", "truss_id": 999}); status != http.StatusNotFound {
		t.Errorf("truss element with missing truss: want 404")
	}
	// Same for a fixture element.
	if status, _ := doJSON(t, http.MethodPost, base+"/elements", map[string]any{"layer_id": layerID, "kind": "fixture", "fixture_id": 999, "width_cm": 30}); status != http.StatusNotFound {
		t.Errorf("fixture element with missing fixture: want 404")
	}

	// Valid create + spatial patch.
	status, raw := doJSON(t, http.MethodPost, base+"/elements", map[string]any{
		"layer_id": layerID, "kind": "resource", "icon": "speaker", "name": "PA R",
		"x_cm": 530, "y_cm": 355, "width_cm": 46, "depth_cm": 38, "height_cm": 90})
	if status != http.StatusCreated {
		t.Fatalf("create resource: status %d body %s", status, raw)
	}
	element := decodeJSON[domain.StagePlotElement](t, raw)
	if element.Links == nil {
		t.Error("element links array must be present")
	}

	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/elements/%d", base, element.ID),
		map[string]any{"x_cm": 500, "rotation_deg": 45, "tilt_deg": 15, "name": "PA Right"})
	if status != http.StatusOK {
		t.Fatalf("patch element: status %d body %s", status, raw)
	}
	patched := decodeJSON[domain.StagePlotElement](t, raw)
	if patched.XCm != 500 || patched.RotationDeg != 45 || patched.TiltDeg != 15 || patched.Name != "PA Right" {
		t.Errorf("element patch not applied: %+v", patched)
	}
	if patched.YCm != 355 || patched.WidthCm != 46 {
		t.Errorf("untouched element fields must persist: %+v", patched)
	}

	// Width validation on PATCH, and icon only on resources.
	if status, _ = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/elements/%d", base, element.ID), map[string]any{"width_cm": 0}); status != http.StatusBadRequest {
		t.Errorf("zero width patch accepted")
	}

	// A cross-plot layer id is rejected.
	other := seedStagePlot(t, server.URL, eventID, "Other")
	otherLayer := getPlotResponse(t, server.URL, eventID, other.ID).Layers[0]
	if status, _ = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/elements/%d", base, element.ID), map[string]any{"layer_id": otherLayer.ID}); status != http.StatusBadRequest {
		t.Errorf("cross-plot layer move accepted")
	}

	// Delete.
	if status, _ = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/elements/%d", base, element.ID), nil); status != http.StatusNoContent {
		t.Errorf("delete element failed")
	}
	if got := len(getPlotResponse(t, server.URL, eventID, plot.ID).Elements); got != 0 {
		t.Errorf("element still present after delete: %d", got)
	}
}
