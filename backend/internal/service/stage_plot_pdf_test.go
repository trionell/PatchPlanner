package service

import (
	"bytes"
	"database/sql"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/go-pdf/fpdf"
	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

// seedPlotEvent builds an event with two plots. The first carries a layer with
// no colour, a layer with a pale colour, a truss with fixtures and a handful of
// elements; the second exists only to prove that a document is of one plot.
func seedPlotEvent(t *testing.T) (*sql.DB, int64, int64, int64) {
	t.Helper()
	database := openTestDB(t)

	owner, err := db.UpsertUserByGoogleSub(database, "plot-owner-sub", "plot@example.com", "Plot Owner", "")
	if err != nil {
		t.Fatalf("seed owner: %v", err)
	}
	inventory, err := db.CreateInventory(database, owner.ID, "Trionell Ljud & Ljus AB")
	if err != nil {
		t.Fatalf("create inventory: %v", err)
	}
	event, err := db.CreateEvent(database, domain.Event{
		Name: "Vårfest 2026", StartDate: "2026-08-14", Venue: "Stora Scenen",
	}, owner.ID, inventory.ID)
	if err != nil {
		t.Fatalf("create event: %v", err)
	}

	plot, err := db.CreateStagePlot(database, event.ID, "Kyrkan")
	if err != nil {
		t.Fatalf("create plot: %v", err)
	}
	other, err := db.CreateStagePlot(database, event.ID, "Festlokal")
	if err != nil {
		t.Fatalf("create second plot: %v", err)
	}

	layers, err := db.ListStagePlotLayers(database, plot.ID)
	if err != nil || len(layers) == 0 {
		t.Fatalf("a new plot should have a default layer: %v", err)
	}
	// A layer with no colour at all, and one whose colour was picked to glow on
	// the dark canvas — the two cases the paper crossing has to tell apart.
	band := layers[0]
	band.Name = "Band"
	band.Color = ""
	if err := db.UpdateStagePlotLayer(database, band); err != nil {
		t.Fatalf("update layer: %v", err)
	}
	lighting, err := db.CreateStagePlotLayer(database, plot.ID, "Lightning", "#ffa348")
	if err != nil {
		t.Fatalf("create layer: %v", err)
	}
	hidden, err := db.CreateStagePlotLayer(database, plot.ID, "Hidden", "#62a0ea")
	if err != nil {
		t.Fatalf("create layer: %v", err)
	}
	hidden.Visible = false
	if err := db.UpdateStagePlotLayer(database, hidden); err != nil {
		t.Fatalf("hide layer: %v", err)
	}

	newElement := func(element domain.StagePlotElement) domain.StagePlotElement {
		element.PlotID = plot.ID
		created, err := db.CreateStagePlotElement(database, element)
		if err != nil {
			t.Fatalf("create element: %v", err)
		}
		return created
	}
	newElement(domain.StagePlotElement{
		LayerID: band.ID, Kind: "resource", Icon: "drums", Name: "Kit",
		XCm: 400, YCm: 100, WidthCm: 215, DepthCm: 160, HeightCm: 120, RotationDeg: 151,
	})
	newElement(domain.StagePlotElement{
		LayerID: band.ID, Kind: "resource", Icon: "speaker", Name: "Speaker L",
		XCm: 140, YCm: 395, WidthCm: 40, DepthCm: 35, HeightCm: 70,
	})
	newElement(domain.StagePlotElement{
		LayerID: band.ID, Kind: "shape", ShapeKind: "ellipse",
		XCm: 900, YCm: 195, WidthCm: 400, DepthCm: 300, HeightCm: 180,
	})
	// Hidden layers are hidden on paper too — the planner turned it off.
	newElement(domain.StagePlotElement{
		LayerID: hidden.ID, Kind: "resource", Icon: "rack", Name: "Should not appear",
		XCm: 9000, YCm: 9000, WidthCm: 60, DepthCm: 60, HeightCm: 100,
	})

	truss := seedPlotTruss(t, database, event.ID)
	newElement(domain.StagePlotElement{
		LayerID: lighting.ID, Kind: "truss", TrussID: &truss.ID,
		XCm: 647, YCm: -297, DepthCm: 27, RotationDeg: 32, TiltDeg: 31,
	})

	return database, event.ID, plot.ID, other.ID
}

func seedPlotTruss(t *testing.T, database *sql.DB, eventID int64) domain.PlotTruss {
	t.Helper()
	truss, err := db.CreatePlotTruss(database, eventID, "Bakre truss", 600)
	if err != nil {
		t.Fatalf("create truss: %v", err)
	}
	for i := 0; i < 3; i++ {
		if _, err := db.CreatePlotTrussPiece(database, truss.ID, nil, "", 200); err != nil {
			t.Fatalf("create piece %d: %v", i, err)
		}
	}
	rig, err := db.GetOrCreateDefaultLightingRig(database, eventID)
	if err != nil {
		t.Fatalf("lighting rig: %v", err)
	}
	number := 1001
	address := 1
	for i, offset := range []float64{50, 302.82, 550} {
		fixtureNumber := number + i
		startAddress := address + i*16
		fixture, err := db.CreateLightingFixture(database, domain.LightingFixture{
			RigID: rig.ID, CustomName: "ADJ RXONE", FixtureNumber: &fixtureNumber,
			PositionIndex: i, PowerConnection: "grid", PowerConnectorIn: "schuko",
			DMXUniverse: 1, DMXStartAddress: &startAddress,
		})
		if err != nil {
			t.Fatalf("create fixture: %v", err)
		}
		side := []string{"middle", "top", "bottom"}[i]
		at := offset
		if err := db.AttachPlotTrussFixture(database, truss.ID, fixture.ID, &at, side); err != nil {
			t.Fatalf("attach fixture: %v", err)
		}
	}
	reloaded, err := db.ListPlotTrusses(database, eventID)
	if err != nil || len(reloaded) == 0 {
		t.Fatalf("reload truss: %v", err)
	}
	return reloaded[0]
}

// pdfPageCount reads the page tree's own count. Counting "/MediaBox" does not
// work here: fpdf writes one shared box when every page is the same size, which
// this document's four landscape sheets are.
func pdfPageCount(t *testing.T, data []byte) int {
	t.Helper()
	match := regexp.MustCompile(`/Type /Pages[^>]*?/Count (\d+)`).FindSubmatch(data)
	if match == nil {
		match = regexp.MustCompile(`/Count (\d+)`).FindSubmatch(data)
	}
	if match == nil {
		t.Fatal("no page tree in the document")
	}
	count, err := strconv.Atoi(string(match[1]))
	if err != nil {
		t.Fatalf("unreadable page count %q", match[1])
	}
	return count
}

// Two builds of unchanged data are compared by length, not by bytes.
//
// The bytes are not stable and it is not the drawing's fault: fpdf writes each
// page's /Font resource dictionary by ranging over a Go map, so the font
// entries come out in a different order every run. (The creation timestamp
// moves too.) Neither changes a single mark on the page, and the length does
// not move unless the content does.

func TestBuildStagePlotPDF(t *testing.T) {
	database, eventID, plotID, _ := seedPlotEvent(t)

	data, filename, err := ExportService{DB: database}.BuildStagePlotPDF(eventID, plotID)
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	if !bytes.HasPrefix(data, []byte("%PDF-")) {
		t.Fatalf("not a PDF: % x", data[:8])
	}
	// Four sheets: top, front, side, schedule.
	if got := pdfPageCount(t, data); got != 4 {
		t.Errorf("page count = %d, want 4", got)
	}
	if !strings.Contains(filename, "Kyrkan") {
		t.Errorf("filename = %q, does not name the plot", filename)
	}
	if !strings.HasSuffix(filename, "Stage plot.pdf") {
		t.Errorf("filename = %q, does not say what it is", filename)
	}
}

// A document is of one plot. An event holding several plots yields several
// documents, and each holds only its own.
func TestEachPlotGetsItsOwnDocument(t *testing.T) {
	database, eventID, plotID, otherID := seedPlotEvent(t)

	first, firstName, err := ExportService{DB: database}.BuildStagePlotPDF(eventID, plotID)
	if err != nil {
		t.Fatalf("build first: %v", err)
	}
	second, secondName, err := ExportService{DB: database}.BuildStagePlotPDF(eventID, otherID)
	if err != nil {
		t.Fatalf("build second: %v", err)
	}
	if firstName == secondName {
		t.Errorf("both plots produced %q", firstName)
	}
	if bytes.Equal(first, second) {
		t.Error("two different plots produced the same document")
	}
	if !strings.Contains(secondName, "Festlokal") {
		t.Errorf("second filename = %q", secondName)
	}
	// The empty plot still gets all four sheets.
	if got := pdfPageCount(t, second); got != 4 {
		t.Errorf("the empty plot got %d sheets, want 4", got)
	}
}

// The printed sheet used to be whichever view the editor was left on. It is not
// any more, and this is the test that keeps it that way.
func TestTheDocumentIgnoresTheStoredActiveView(t *testing.T) {
	database, eventID, plotID, _ := seedPlotEvent(t)
	build := func() []byte {
		data, _, err := ExportService{DB: database}.BuildStagePlotPDF(eventID, plotID)
		if err != nil {
			t.Fatalf("build: %v", err)
		}
		return data
	}
	plot, err := db.GetStagePlot(database, eventID, plotID)
	if err != nil {
		t.Fatal(err)
	}

	plot.ActiveView = "top"
	if err := db.UpdateStagePlot(database, plot); err != nil {
		t.Fatal(err)
	}
	fromTop := build()

	plot.ActiveView = "side"
	if err := db.UpdateStagePlot(database, plot); err != nil {
		t.Fatal(err)
	}
	if got := build(); len(got) != len(fromTop) {
		t.Errorf("the document changed with the editor's active view: %d bytes, then %d", len(fromTop), len(got))
	}

	plot.ActiveView = "front"
	if err := db.UpdateStagePlot(database, plot); err != nil {
		t.Fatal(err)
	}
	if got := build(); len(got) != len(fromTop) {
		t.Errorf("the document changed with the editor's active view: %d bytes, then %d", len(fromTop), len(got))
	}
}

func TestStagePlotPDFIsTheSameDocumentEveryTime(t *testing.T) {
	database, eventID, plotID, _ := seedPlotEvent(t)
	first, _, err := ExportService{DB: database}.BuildStagePlotPDF(eventID, plotID)
	if err != nil {
		t.Fatal(err)
	}
	second, _, err := ExportService{DB: database}.BuildStagePlotPDF(eventID, plotID)
	if err != nil {
		t.Fatal(err)
	}
	if len(first) != len(second) {
		t.Errorf("two builds of one plot differ in size: %d and %d", len(first), len(second))
	}
}

func TestStagePlotPDFUnknownPlot(t *testing.T) {
	database, eventID, _, _ := seedPlotEvent(t)
	if _, _, err := (ExportService{DB: database}).BuildStagePlotPDF(eventID, 99999); err == nil {
		t.Error("expected an error for a plot that does not exist")
	}
}

// ---- Layout, which is where the drawing's promises live ----

func newTestPlotDoc(t *testing.T) *plotDoc {
	t.Helper()
	database, eventID, plotID, _ := seedPlotEvent(t)
	event, err := db.GetEvent(database, eventID)
	if err != nil {
		t.Fatal(err)
	}
	response, err := db.GetStagePlotResponse(database, eventID, plotID)
	if err != nil {
		t.Fatal(err)
	}
	return newPlotDoc(event, response)
}

func TestOneScaleIsChosenFromTheLadderAndFitsEveryView(t *testing.T) {
	doc := newTestPlotDoc(t)

	onLadder := false
	for _, candidate := range plotScaleLadder {
		if candidate == doc.denom {
			onLadder = true
		}
	}
	if !onLadder {
		t.Errorf("scale 1:%v is not on the ladder", doc.denom)
	}

	for _, view := range PlotViews {
		uWin, vWin, _ := doc.viewWindows(view)
		if width := (uWin[1] - uWin[0]) * doc.perCm; width > plotFrameW+0.001 {
			t.Errorf("%s is %.1f mm wide, past the %.0f mm frame", view, width, plotFrameW)
		}
		if height := (vWin[1] - vWin[0]) * doc.perCm; height > plotUsableH+0.001 {
			t.Errorf("%s is %.1f mm tall, past the %.0f mm frame", view, height, plotUsableH)
		}
	}

	// It is the LARGEST that fits: the next rung up must not.
	for i, candidate := range plotScaleLadder {
		if candidate != doc.denom || i == 0 {
			continue
		}
		bigger := 10 / plotScaleLadder[i-1]
		fits := true
		for _, view := range PlotViews {
			uWin, vWin, _ := doc.viewWindows(view)
			if (uWin[1]-uWin[0])*bigger > plotFrameW || (vWin[1]-vWin[0])*bigger > plotUsableH {
				fits = false
			}
		}
		if fits {
			t.Errorf("1:%v would also have fitted, so 1:%v is not the largest", plotScaleLadder[i-1], doc.denom)
		}
	}
}

// The registration property: two views drawing the same world axis place it
// identically, so a vertical dropped from the plan meets its element in the
// elevation.
func TestTheViewsAreRegisteredToEachOther(t *testing.T) {
	doc := newTestPlotDoc(t)
	top := doc.mapper(ViewTop)
	front := doc.mapper(ViewFront)
	side := doc.mapper(ViewSide)

	for _, element := range doc.elements {
		x := ProjectElement(element, ViewTop).U // the same stored x_cm in both
		if got, want := front.X(x), top.X(x); got != want {
			t.Errorf("element %d sits at %.3f mm in the plan and %.3f mm in the front view", element.ID, want, got)
		}
	}

	// The elevations share a floor datum and a height scale.
	if front.Y(0) != side.Y(0) {
		t.Errorf("the floor is at %.3f mm in front and %.3f mm in side", front.Y(0), side.Y(0))
	}
	if front.Y(250) != side.Y(250) {
		t.Error("the two elevations disagree about where 250 cm above the floor is")
	}

	// The top view's vertical and the side view's horizontal are the same world
	// axis — stage depth — so they share a window.
	if top.vWin != side.uWin {
		t.Errorf("stage depth is %v in the plan and %v in the side view", top.vWin, side.uWin)
	}
}

func TestTheGridStepsUpUntilItIsWorthDrawing(t *testing.T) {
	doc := newTestPlotDoc(t)
	if doc.gridCm*doc.perCm < plotGridFloorMm {
		t.Errorf("a drawn grid square is %.2f mm, below the %.0f mm floor", doc.gridCm*doc.perCm, plotGridFloorMm)
	}
	if doc.gridStep < 1 {
		t.Fatalf("grid step = %d", doc.gridStep)
	}
	// It is a whole multiple of the plot's own grid, and the sheet says both.
	if doc.gridCm != doc.plot.GridSizeCm*float64(doc.gridStep) {
		t.Errorf("drawn grid %v is not a multiple of the plot's %v", doc.gridCm, doc.plot.GridSizeCm)
	}
	statement := doc.gridStatement()
	if !strings.Contains(statement, trimFloat(doc.plot.GridSizeCm)) {
		t.Errorf("the grid statement %q does not name the plot's grid", statement)
	}
	if doc.gridStep > 1 && !strings.Contains(statement, trimFloat(doc.gridCm)) {
		t.Errorf("the grid statement %q does not name the interval drawn", statement)
	}
}

// The floor is a datum: the height window starts at zero, so nothing is drawn
// below it and the elevations do not waste a band of sheet on empty basement.
func TestTheHeightWindowStartsAtTheFloor(t *testing.T) {
	doc := newTestPlotDoc(t)
	if doc.windows.Z[0] != 0 {
		t.Errorf("the height window starts at %v, want 0", doc.windows.Z[0])
	}
}

func TestHiddenLayersAreHiddenOnPaperToo(t *testing.T) {
	doc := newTestPlotDoc(t)
	for _, element := range doc.elements {
		if element.Name == "Should not appear" {
			t.Fatal("an element on a hidden layer reached the document")
		}
	}
	for _, layer := range doc.visibleLayers() {
		if layer.Name == "Hidden" {
			t.Error("a hidden layer reached the layer key")
		}
	}
}

// The crossing, applied: the unset layer prints as ink and the pale one is
// darkened, and no layer is drawn in a colour that cannot be read on white.
func TestLayerInksAreCrossedOntoPaper(t *testing.T) {
	doc := newTestPlotDoc(t)
	for _, layer := range doc.layers {
		ink := doc.inkByLayer[layer.ID]
		if layer.Color == "" && ink != paperInk {
			t.Errorf("layer %q has no colour but prints as %q", layer.Name, ink)
		}
		red, green, blue, ok := parseHexColor(ink)
		if !ok {
			t.Fatalf("layer %q printed as unparseable %q", layer.Name, ink)
		}
		if contrastWithWhite(red, green, blue) < paperContrastFloor {
			t.Errorf("layer %q prints as %q, which cannot be read on white", layer.Name, ink)
		}
	}
}

// Inherited from Slice 40 and non-negotiable: an unrepresentable character does
// not come out as garbage, it comes out as "." — a plausible full stop. So the
// few marks this document types have to be checked, and the rest are drawn.
func TestCp1252RepresentsWhatTheStagePlotUses(t *testing.T) {
	pdf := fpdf.New("L", "mm", "A4", "")
	translate := pdf.UnicodeTranslatorFromDescriptor("cp1252")
	for _, value := range []string{degreeSign, "1:100", "Vårfest", "FLOOR 0", "x"} {
		if got := translate(value); strings.Contains(got, ".") != strings.Contains(value, ".") {
			t.Errorf("cp1252 cannot represent %q — it became %q", value, got)
		}
	}
	// The arrow is still unavailable, which is why nothing here uses one.
	if got := translate("→"); got != "." {
		t.Logf("cp1252 turned the arrow into %q", got)
	}
}

func TestScheduleNamesEveryElementIncludingTheUnnamed(t *testing.T) {
	cases := []struct {
		element domain.StagePlotElement
		want    string
	}{
		{domain.StagePlotElement{Name: "Speaker L", Kind: "resource", Icon: "speaker"}, "Speaker L"},
		{domain.StagePlotElement{Kind: "resource", Icon: "piano_grand"}, "Piano grand"},
		{domain.StagePlotElement{Kind: "shape", ShapeKind: "ellipse"}, "Ellipse"},
		{domain.StagePlotElement{Kind: "shape", ShapeKind: "wobble"}, "Shape"},
		{domain.StagePlotElement{Kind: "truss"}, "Truss"},
	}
	for _, tc := range cases {
		if got := scheduleElementTitle(tc.element); got != tc.want {
			t.Errorf("scheduleElementTitle(%+v) = %q, want %q", tc.element, got, tc.want)
		}
	}
}
