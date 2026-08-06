package service

import (
	"bytes"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

// The stage plot as a scale drawing: four A4 landscape sheets for one plot —
// top view, front view, side view, element schedule.
//
// The document exists because browser print could not state a scale, could not
// draw all three views without depending on which one the editor was left on,
// and framed every view to its own content so that no two of them could be read
// against each other.
//
// Three properties do the work:
//
//   - ONE SCALE, chosen from a ladder as the largest at which every view fits,
//     stated in figures and drawn as a bar. A crew measures off this sheet.
//   - THREE SHARED WINDOWS — stage width, stage depth, height — so that two
//     views drawing the same world axis place it identically. A vertical
//     dropped from the plan meets its element in the elevation.
//   - COLOUR THAT SURVIVES THE CROSSING. Layer colour is the plot's whole
//     palette and every value was picked against a near-black canvas, so it is
//     crossed onto paper by PaperInk rather than used as stored.
//
// Like the audio document it is built-in Helvetica through a cp1252 translator,
// so anything carrying meaning is drawn: the scale bar, the floor hatching, the
// fixture balloons.

const (
	plotPageW = 297.0 // A4 landscape. AddPageFormat("L", …) swaps Wd/Ht, so
	plotPageH = 210.0 // these are stated rather than derived.

	// The drawing frame and the title block. Identical on all three drawing
	// sheets — that identity is what registers the views.
	plotFrameX = 12.0
	plotFrameY = 40.0
	plotFrameW = 218.0
	plotFrameH = 150.0

	plotBlockX = 234.0
	plotBlockW = 51.0

	// Room under the floor datum for its hatching and label. Reserved out of
	// the height the scale is chosen against, so the frame the ladder was
	// measured in is the frame the drawing lands in.
	plotFloorPad = 9.0
	plotUsableH  = plotFrameH - plotFloorPad

	// Breathing room around the content, in centimetres of stage.
	plotContentMarginCm = 100.0

	// Below this a drawn grid square is noise rather than a grid.
	plotGridFloorMm = 8.0

	// One point in millimetres, for talking about type sizes in page units.
	plotPt = 0.3528
)

// plotScaleLadder is walked from the largest drawing to the smallest. These are
// the scales a technical drawing is conventionally read at; a plot that does not
// fit at the last of them tiles instead of shrinking further.
var plotScaleLadder = []float64{10, 20, 25, 50, 100, 200, 250, 500}

// Drawn weights, in real millimetres on the page.
const (
	plotFrameWeight   = 0.25
	plotElementWeight = 0.3
	plotGridWeight    = 0.06
	plotFloorWeight   = 0.5
	plotHairWeight    = 0.15
)

// plotWindows are the three world windows, in centimetres. Each is shared by
// the views that draw that axis, which is the whole of the registration.
type plotWindows struct {
	X [2]float64 // stage width  — the top and front views' horizontal
	Y [2]float64 // stage depth  — the top view's vertical, the side view's horizontal
	Z [2]float64 // height       — both elevations' vertical
}

type plotDoc struct {
	pdf   *fpdf.Fpdf
	tr    func(string) string
	paper paperDoc

	event    domain.Event
	plot     domain.StagePlot
	layers   []domain.StagePlotLayer
	elements []domain.StagePlotElement // visible only, truss geometry applied
	trusses  map[int64]domain.PlotTruss

	layerByID  map[int64]domain.StagePlotLayer
	inkByLayer map[int64]string

	windows  plotWindows
	denom    float64 // the scale's denominator: 100 means 1:100
	perCm    float64 // millimetres per centimetre at that scale
	gridStep int     // how many of the plot's grid squares one drawn square spans
	gridCm   float64 // …and what that measures on the stage

	sheet      int // 1-based, for "Sheet n of m"
	sheetCount int
}

// BuildStagePlotPDF renders one stage plot as one document.
//
// One plot, not one event: an event holds several plots and they are different
// drawings of different rooms. Which plot is asked for is in the URL, and
// nothing about the document depends on editor state — the stored active view
// is not read at all.
func (s ExportService) BuildStagePlotPDF(eventID, plotID int64) ([]byte, string, error) {
	event, err := db.GetEvent(s.DB, eventID)
	if err != nil {
		return nil, "", fmt.Errorf("load event: %w", err)
	}
	response, err := db.GetStagePlotResponse(s.DB, eventID, plotID)
	if err != nil {
		return nil, "", fmt.Errorf("load stage plot: %w", err)
	}

	doc := newPlotDoc(event, response)
	data, err := doc.render()
	if err != nil {
		return nil, "", err
	}
	return data, stagePlotExportFilename(event, response.Plot), nil
}

func stagePlotExportFilename(event domain.Event, plot domain.StagePlot) string {
	base := strings.TrimPrefix(strings.TrimSuffix(exportFilename(event, ".pdf"), ".pdf"), "Hyrorder - ")
	name := unsafeFilenameChars.ReplaceAllString(plot.Name, "_")
	if strings.TrimSpace(name) == "" {
		name = fmt.Sprintf("Plot %d", plot.ID)
	}
	return base + " - " + name + " - Stage plot.pdf"
}

func newPlotDoc(event domain.Event, response domain.StagePlotResponse) *plotDoc {
	doc := &plotDoc{
		event:      event,
		plot:       response.Plot,
		layers:     response.Layers,
		trusses:    make(map[int64]domain.PlotTruss, len(response.Trusses)),
		layerByID:  make(map[int64]domain.StagePlotLayer, len(response.Layers)),
		inkByLayer: make(map[int64]string, len(response.Layers)),
	}
	for _, truss := range response.Trusses {
		doc.trusses[truss.ID] = truss
	}
	for _, layer := range response.Layers {
		doc.layerByID[layer.ID] = layer
		doc.inkByLayer[layer.ID] = PaperInk(layer.Color)
	}
	// A hidden layer is hidden on paper too — the planner turned it off.
	for _, element := range response.Elements {
		if layer, ok := doc.layerByID[element.LayerID]; !ok || !layer.Visible {
			continue
		}
		doc.elements = append(doc.elements, EffectiveElement(element, doc.trusses))
	}
	doc.windows = doc.computeWindows()
	doc.denom, doc.perCm = doc.chooseScale()
	doc.gridStep, doc.gridCm = doc.chooseGrid()
	return doc
}

// computeWindows takes the union of every visible element's projected bounds
// and derives one window per world axis. Two views that draw the same axis take
// the same window, which is what makes the sheets a projection set rather than
// three unrelated drawings.
func (d *plotDoc) computeWindows() plotWindows {
	windows := plotWindows{
		X: [2]float64{math.Inf(1), math.Inf(-1)},
		Y: [2]float64{math.Inf(1), math.Inf(-1)},
		Z: [2]float64{0, math.Inf(-1)},
	}
	for _, element := range d.elements {
		top := ProjectedBounds(element, ViewTop)     // u = x, v = y
		front := ProjectedBounds(element, ViewFront) // v = z
		windows.X[0] = math.Min(windows.X[0], top.MinU)
		windows.X[1] = math.Max(windows.X[1], top.MaxU)
		windows.Y[0] = math.Min(windows.Y[0], top.MinV)
		windows.Y[1] = math.Max(windows.Y[1], top.MaxV)
		windows.Z[0] = math.Min(windows.Z[0], front.MinV)
		windows.Z[1] = math.Max(windows.Z[1], front.MaxV)
	}
	if len(d.elements) == 0 {
		// An empty plot still gets a frame, a grid and a stated scale — the
		// sheet says in words that there is nothing on it.
		return plotWindows{X: [2]float64{0, 1000}, Y: [2]float64{0, 800}, Z: [2]float64{0, 400}}
	}
	pad := func(window [2]float64) [2]float64 {
		return [2]float64{window[0] - plotContentMarginCm, window[1] + plotContentMarginCm}
	}
	windows.X = pad(windows.X)
	windows.Y = pad(windows.Y)
	// The floor is a datum, not content: nothing is drawn below it, so the
	// height window starts exactly at zero and only gets headroom.
	windows.Z = [2]float64{0, math.Max(windows.Z[1], 0) + plotContentMarginCm}
	return windows
}

// chooseScale walks the ladder and takes the largest drawing that fits every
// view in the common frame. One scale for the document is what lets the three
// sheets be compared; a per-view fit would give each of them a different one.
func (d *plotDoc) chooseScale() (denom, perCm float64) {
	spanX := d.windows.X[1] - d.windows.X[0]
	spanY := d.windows.Y[1] - d.windows.Y[0]
	spanZ := d.windows.Z[1] - d.windows.Z[0]
	// Each view draws two of the three windows; a scale has to satisfy all of
	// them, so the binding constraint is the widest window horizontally and the
	// tallest one vertically.
	widest := math.Max(spanX, spanY)
	tallest := math.Max(spanY, spanZ)
	for _, candidate := range plotScaleLadder {
		k := 10 / candidate
		if widest*k <= plotFrameW && tallest*k <= plotUsableH {
			return candidate, k
		}
	}
	// Nothing on the ladder fits: the drawing divides across sheets at the
	// smallest scale rather than shrinking past what can be read.
	last := plotScaleLadder[len(plotScaleLadder)-1]
	return last, 10 / last
}

// chooseGrid steps the plot's own grid up until a drawn square is worth
// drawing. A 25 cm grid at 1:100 is a 2.5 mm mesh, which is noise; the sheet
// draws every fourth line instead and states both numbers.
func (d *plotDoc) chooseGrid() (step int, cm float64) {
	if d.plot.GridSizeCm <= 0 {
		return 1, 0
	}
	step = 1
	for d.plot.GridSizeCm*float64(step)*d.perCm < plotGridFloorMm {
		step++
		if step > 1000 { // a pathological grid size cannot spin forever
			break
		}
	}
	return step, d.plot.GridSizeCm * float64(step)
}

// viewWindows gives a view's horizontal and vertical windows, and whether its
// vertical grows down the sheet (the plan's downstage) or up (an elevation's
// height).
func (d *plotDoc) viewWindows(view PlotView) (uWin, vWin [2]float64, vDown bool) {
	switch view {
	case ViewTop:
		return d.windows.X, d.windows.Y, true
	case ViewFront:
		return d.windows.X, d.windows.Z, false
	default:
		return d.windows.Y, d.windows.Z, false
	}
}

// plotMapper turns stage centimetres into page millimetres for one view.
//
// Windows are centred in the frame, and centring costs no registration: two
// views sharing a world window share its span and therefore its offset. The
// elevations instead stand on the floor pad, so they share a datum line.
type plotMapper struct {
	uWin, vWin [2]float64
	vDown      bool
	perCm      float64
	x0         float64
	yTop       float64
	yBottom    float64
	// tileU and tileV shift the drawing when a view is divided across sheets.
	tileU, tileV float64
}

func (d *plotDoc) mapper(view PlotView) plotMapper {
	uWin, vWin, vDown := d.viewWindows(view)
	spanU := (uWin[1] - uWin[0]) * d.perCm
	spanV := (vWin[1] - vWin[0]) * d.perCm
	return plotMapper{
		uWin: uWin, vWin: vWin, vDown: vDown, perCm: d.perCm,
		x0:      plotFrameX + math.Max(0, (plotFrameW-spanU)/2),
		yTop:    plotFrameY + math.Max(0, (plotUsableH-spanV)/2),
		yBottom: plotFrameY + plotFrameH - plotFloorPad,
	}
}

func (m plotMapper) X(u float64) float64 {
	return m.x0 + (u-m.uWin[0])*m.perCm - m.tileU
}

func (m plotMapper) Y(v float64) float64 {
	if m.vDown {
		return m.yTop + (v-m.vWin[0])*m.perCm - m.tileV
	}
	return m.yBottom - (v-m.vWin[0])*m.perCm + m.tileV
}

// uAt and vAt are the inverse, used to find which stage coordinates the frame's
// edges fall on so the grid can run to them.
func (m plotMapper) uAt(x float64) float64 {
	return m.uWin[0] + (x+m.tileU-m.x0)/m.perCm
}

func (m plotMapper) vAt(y float64) float64 {
	if m.vDown {
		return m.vWin[0] + (y+m.tileV-m.yTop)/m.perCm
	}
	return m.vWin[0] + (m.yBottom+m.tileV-y)/m.perCm
}

func (d *plotDoc) render() ([]byte, error) {
	pdf := fpdf.New("L", "mm", "A4", "")
	pdf.SetMargins(paperMarginLeft, paperMarginTop, paperMarginRight)
	// The document paginates itself: every sheet is placed deliberately, and an
	// automatic break in the middle of a drawing would put half of it on a page
	// with no frame and no scale.
	pdf.SetAutoPageBreak(false, paperMarginBottom)
	translate := pdf.UnicodeTranslatorFromDescriptor("cp1252")

	d.pdf = pdf
	d.tr = translate
	d.paper = paperDoc{pdf: pdf, tr: translate, width: plotPageW}
	d.paper.installFooter(d.event.Name + " - " + d.plot.Name + " - Stage plot")

	sheets := d.planSheets()
	d.sheetCount = len(sheets)
	for index, sheet := range sheets {
		d.sheet = index + 1
		pdf.AddPage()
		if index == 0 {
			d.writeMasthead()
		} else {
			d.paper.runningHead(d.event.Name+" - "+d.plot.Name, fmt.Sprintf("Scale 1:%s   -   continued", trimFloat(d.denom)))
		}
		sheet.draw(d)
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("render pdf: %w", err)
	}
	return buf.Bytes(), nil
}

// plotSheetPlan is one page of the document.
type plotSheetPlan struct {
	title string
	view  PlotView
	// tile positions the drawing when a view is divided; part and parts
	// describe where this sheet sits in that division.
	tileU, tileV float64
	part, parts  int
	schedule     bool
}

func (p plotSheetPlan) draw(d *plotDoc) {
	if p.schedule {
		d.writeSchedule(p.title)
		return
	}
	d.writeViewSheet(p)
}

// planSheets lays out the document: the three views, then the schedule. A view
// too large for the frame at the smallest scale contributes several sheets
// instead of one.
func (d *plotDoc) planSheets() []plotSheetPlan {
	var sheets []plotSheetPlan
	titles := map[PlotView]string{ViewTop: "Top view", ViewFront: "Front view", ViewSide: "Side view"}
	for _, view := range PlotViews {
		tiles := d.tilesFor(view)
		for i, tile := range tiles {
			sheet := plotSheetPlan{title: titles[view], view: view, tileU: tile[0], tileV: tile[1]}
			if len(tiles) > 1 {
				sheet.part, sheet.parts = i+1, len(tiles)
			}
			sheets = append(sheets, sheet)
		}
	}
	return append(sheets, plotSheetPlan{title: "Element schedule", schedule: true})
}

// tilesFor divides a view whose drawing will not fit the frame at the chosen
// scale. Cuts fall between elements rather than through one: a nominal cut is
// pulled back to just before the first element that straddles it.
//
// The alternative to dividing is shrinking past the point where a label can be
// read, which produces a sheet nobody can use and does not say so.
func (d *plotDoc) tilesFor(view PlotView) [][2]float64 {
	m := d.mapper(view)
	spanU := (m.uWin[1] - m.uWin[0]) * d.perCm
	spanV := (m.vWin[1] - m.vWin[0]) * d.perCm
	if spanU <= plotFrameW && spanV <= plotUsableH {
		return [][2]float64{{0, 0}}
	}

	cutsU := d.cutPositions(view, spanU, plotFrameW, true)
	cutsV := d.cutPositions(view, spanV, plotUsableH, false)
	tiles := make([][2]float64, 0, len(cutsU)*len(cutsV))
	for _, v := range cutsV {
		for _, u := range cutsU {
			tiles = append(tiles, [2]float64{u, v})
		}
	}
	return tiles
}

// cutPositions walks one axis in frame-sized steps, pulling each cut back to
// clear whichever element straddles it. An element wider than a whole frame
// cannot be cleared and is allowed to straddle — the alternative would be no
// sheet at all.
func (d *plotDoc) cutPositions(view PlotView, span, frame float64, horizontal bool) []float64 {
	if span <= frame {
		return []float64{0}
	}
	edges := d.elementEdges(view, horizontal)
	positions := []float64{0}
	at := 0.0
	for at+frame < span {
		nominal := at + frame
		cut := nominal
		// Pulling the cut back to clear one element can land it inside another,
		// so this repeats until nothing straddles it. It terminates because the
		// cut only ever moves earlier and is bounded below by the last one.
		for moved := true; moved; {
			moved = false
			for _, edge := range edges {
				if edge[0] < cut && edge[1] > cut && edge[0] > at {
					cut = edge[0]
					moved = true
				}
			}
		}
		if cut <= at+1 {
			// Nowhere to cut: something here is wider than a whole frame, and
			// no division can keep it whole. Taking the nominal cut splits it,
			// which is worse than ideal and better than emitting no sheet.
			cut = nominal
		}
		positions = append(positions, cut)
		at = cut
	}
	return positions
}

// elementEdges are every element's extent along one axis of a view, in page
// millimetres from the drawing's own origin — what a cut has to avoid.
func (d *plotDoc) elementEdges(view PlotView, horizontal bool) [][2]float64 {
	m := d.mapper(view)
	edges := make([][2]float64, 0, len(d.elements))
	for _, element := range d.elements {
		bounds := ProjectedBounds(element, view)
		if horizontal {
			edges = append(edges, [2]float64{
				(bounds.MinU - m.uWin[0]) * d.perCm,
				(bounds.MaxU - m.uWin[0]) * d.perCm,
			})
		} else if m.vDown {
			edges = append(edges, [2]float64{
				(bounds.MinV - m.vWin[0]) * d.perCm,
				(bounds.MaxV - m.vWin[0]) * d.perCm,
			})
		} else {
			edges = append(edges, [2]float64{
				(m.vWin[1] - bounds.MaxV) * d.perCm,
				(m.vWin[1] - bounds.MinV) * d.perCm,
			})
		}
	}
	sort.Slice(edges, func(i, j int) bool { return edges[i][0] < edges[j][0] })
	return edges
}

func (d *plotDoc) writeMasthead() {
	truss, fixtures := d.trussCounts()
	meta := fmt.Sprintf("%s   -   %s   -   %s",
		plural(len(d.elements), "element", "elements"),
		plural(len(d.visibleLayers()), "layer", "layers"),
		fmt.Sprintf("%s, %s", plural(truss, "truss", "trusses"), plural(fixtures, "fixture", "fixtures")))
	right := fmt.Sprintf("Generated %s   -   Scale 1:%s",
		time.Now().Format("2006-01-02"), trimFloat(d.denom))
	d.paper.masthead(d.event.Name, "PLOT", d.plotSubtitle(), meta, right)
}

func (d *plotDoc) plotSubtitle() string {
	parts := []string{d.plot.Name}
	if subtitle := eventSubtitle(d.event); subtitle != "" {
		parts = append(parts, subtitle)
	}
	return strings.Join(parts, "   -   ")
}

func (d *plotDoc) visibleLayers() []domain.StagePlotLayer {
	var out []domain.StagePlotLayer
	for _, layer := range d.layers {
		if layer.Visible {
			out = append(out, layer)
		}
	}
	return out
}

// trussCounts counts the trusses actually placed on this plot, and the fixtures
// hanging on them — not the event's whole stock of bars.
func (d *plotDoc) trussCounts() (trusses, fixtures int) {
	seen := map[int64]bool{}
	for _, element := range d.elements {
		if element.Kind != "truss" || element.TrussID == nil || seen[*element.TrussID] {
			continue
		}
		seen[*element.TrussID] = true
		trusses++
		fixtures += len(d.trusses[*element.TrussID].Fixtures)
	}
	return trusses, fixtures
}

// placedTrusses are the trusses drawn on this plot, in the order they appear.
func (d *plotDoc) placedTrusses() []domain.PlotTruss {
	var out []domain.PlotTruss
	seen := map[int64]bool{}
	for _, element := range d.elements {
		if element.Kind != "truss" || element.TrussID == nil || seen[*element.TrussID] {
			continue
		}
		seen[*element.TrussID] = true
		if truss, ok := d.trusses[*element.TrussID]; ok {
			out = append(out, truss)
		}
	}
	return out
}

func (d *plotDoc) ink(layerID int64) (red, green, blue int) {
	red, green, blue, ok := parseHexColor(d.inkByLayer[layerID])
	if !ok {
		return 17, 17, 17
	}
	return red, green, blue
}

// degreeSign is one of the few marks this document types rather than draws,
// because cp1252 does have it at 0xB0 — unlike the arrow the audio document
// had to give up. TestCp1252RepresentsWhatTheStagePlotUses is what keeps that
// claim honest: an unrepresentable character comes out as a full stop, which
// reads as punctuation rather than as damage.
const degreeSign = "°"

// trimFloat prints a scale denominator without a trailing ".0".
func trimFloat(value float64) string {
	return strings.TrimSuffix(strings.TrimRight(fmt.Sprintf("%.2f", value), "0"), ".")
}
