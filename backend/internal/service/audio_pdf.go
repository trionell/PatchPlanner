package service

import (
	"bytes"
	"fmt"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

// The audio documentation: one file, five sections, the whole audio plan.
//
// This is the rental order's sibling — same writer, same page furniture, same
// hard constraint. The document uses built-in Helvetica with a cp1252
// translator, so no font file is embedded and the binary stays the size it is.
// A character cp1252 cannot represent does not render as garbage; it renders as
// "." That is why nothing here depends on one: "->" is spelled, and every mark
// that carries meaning is drawn as a vector in flow_draw.go.
//
// The document exists because browser print could not repeat a column header
// across a page break, could not put a landscape page inside a portrait one,
// could not state a scale, and could not be told how to route a line.

const (
	audioMarginLeft   = 12.0
	audioMarginTop    = 12.0
	audioMarginRight  = 12.0
	audioMarginBottom = 16.0

	// The text block: A4 less both margins, portrait and landscape.
	audioBlockW          = 210.0 - audioMarginLeft - audioMarginRight
	audioLandscapeBlockW = 297.0 - audioMarginLeft - audioMarginRight

	audioRowHeight  = 4.2
	audioNoteHeight = 3.4
)

// Column widths, in millimetres, from the approved mockup. Each set totals the
// 186 mm text block.
var (
	inputColumns  = []float64{9, 33, 6, 27, 40, 23, 9, 16, 23}
	outputColumns = []float64{9, 33, 21, 6, 57, 43, 17}
	rigColumns    = []float64{38, 46, 20, 24, 16, 16, 26}
)

// audioDoc carries the state the header and footer callbacks need. fpdf calls
// those at page breaks, from inside the table writers, so what they print has
// to be reachable from there.
type audioDoc struct {
	pdf   *fpdf.Fpdf
	tr    func(string) string
	event domain.Event

	// section is what the running head names, updated as the document walks.
	section string
	// repeatHeader draws the current table's column header after a break.
	repeatHeader func()
}

// BuildAudioPDF renders an event's whole audio plan as one document: input
// patch, output patch, stage rig, and the two signal-flow drawings.
//
// The same document whichever surface asked for it — there is one audio
// document and where the request came from does not change what is in it.
func (s ExportService) BuildAudioPDF(eventID int64) ([]byte, string, error) {
	event, err := db.GetEvent(s.DB, eventID)
	if err != nil {
		return nil, "", fmt.Errorf("load event: %w", err)
	}
	inventory, err := db.GetInventory(s.DB, event.InventoryID)
	if err != nil {
		return nil, "", fmt.Errorf("load inventory: %w", err)
	}
	data, err := loadAudioGraphData(s.DB, eventID, event.InventoryID)
	if err != nil {
		return nil, "", err
	}

	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(audioMarginLeft, audioMarginTop, audioMarginRight)
	pdf.SetAutoPageBreak(true, audioMarginBottom)
	doc := &audioDoc{pdf: pdf, tr: pdf.UnicodeTranslatorFromDescriptor("cp1252"), event: event}

	// The running head and the repeated column header are the two things
	// browser print could never give. fpdf calls this after every automatic
	// break as well as on AddPage; page 1 carries the masthead instead, which
	// is why it is skipped there.
	pdf.SetHeaderFunc(func() {
		if pdf.PageNo() <= 1 || doc.section == "" {
			return
		}
		doc.writeRunningHead()
		if doc.repeatHeader != nil {
			doc.repeatHeader()
		}
	})
	pdf.SetFooterFunc(func() {
		pdf.SetY(-11)
		pdf.SetFont("Helvetica", "", 6.6)
		pdf.SetTextColor(140, 140, 140)
		pdf.CellFormat(120, 4, doc.tr(event.Name+" - Audio documentation"), "T", 0, "L", false, 0, "")
		pdf.CellFormat(0, 4, doc.tr(fmt.Sprintf("%d / {nb}", pdf.PageNo())), "T", 0, "R", false, 0, "")
		pdf.SetTextColor(17, 17, 17)
	})
	pdf.AliasNbPages("{nb}")
	pdf.AddPage()

	doc.writeMasthead(inventory, data)
	doc.writeInputPatch(data)
	doc.writeOutputPatch(data)
	doc.writeRig(data)
	doc.writeFlowSection(4, "Signal flow - inputs", buildInputGraph(data))
	doc.writeFlowSection(5, "Signal flow - outputs", buildOutputGraph(data))

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, "", fmt.Errorf("render pdf: %w", err)
	}
	return buf.Bytes(), audioExportFilename(event), nil
}

func audioExportFilename(event domain.Event) string {
	return strings.TrimSuffix(exportFilename(event, ".pdf"), ".pdf") + "-audio.pdf"
}

// writeMasthead is page one's identity block, and the document's only large
// type. "Audio" stands opposite the event name so the same block serves a plot
// document with one word changed.
func (d *audioDoc) writeMasthead(inventory domain.Inventory, data audioGraphData) {
	d.pdf.SetFont("Helvetica", "B", 17)
	d.pdf.SetTextColor(17, 17, 17)
	d.pdf.CellFormat(150, 8, d.tr(d.event.Name), "", 0, "L", false, 0, "")
	d.pdf.SetFont("Helvetica", "B", 8)
	d.pdf.SetTextColor(102, 102, 102)
	d.pdf.CellFormat(0, 8, d.tr("AUDIO"), "", 1, "R", false, 0, "")

	d.pdf.SetFont("Helvetica", "", 9)
	d.pdf.SetTextColor(51, 51, 51)
	d.pdf.CellFormat(0, 4.6, d.tr(eventSubtitle(d.event)), "", 1, "L", false, 0, "")

	d.pdf.SetFont("Helvetica", "", 7)
	d.pdf.SetTextColor(119, 119, 119)
	left := "Inventory: " + inventory.Name
	right := fmt.Sprintf("Generated %s   -   %s, %s, %s, %s",
		time.Now().Format("2006-01-02"),
		plural(len(data.channels), "input", "inputs"),
		plural(len(data.outputs), "output", "outputs"),
		plural(len(buildRig(data).Rows), "box", "boxes"),
		plural(len(data.inCables)+len(data.outCables), "cable", "cables"))
	d.pdf.CellFormat(70, 4, d.tr(left), "", 0, "L", false, 0, "")
	d.pdf.CellFormat(0, 4, d.tr(right), "", 1, "R", false, 0, "")

	// The heaviest rule in the document, used exactly once.
	d.pdf.Ln(1)
	d.pdf.SetLineWidth(0.5)
	y := d.pdf.GetY()
	d.pdf.Line(audioMarginLeft, y, 210-audioMarginRight, y)
	d.pdf.SetLineWidth(0.2)
	d.pdf.SetTextColor(17, 17, 17)
	d.pdf.Ln(4)
}

func eventSubtitle(event domain.Event) string {
	var parts []string
	if event.Venue != "" {
		parts = append(parts, event.Venue)
	}
	dates := event.StartDate
	if event.EndDate != "" && event.EndDate != event.StartDate {
		dates += " - " + event.EndDate
	}
	if dates != "" {
		parts = append(parts, dates)
	}
	return strings.Join(parts, "   -   ")
}

// writeRunningHead names the section the reader is inside, on every page after
// the first.
func (d *audioDoc) writeRunningHead() {
	d.pdf.SetY(audioMarginTop)
	d.pdf.SetFont("Helvetica", "B", 6.5)
	d.pdf.SetTextColor(17, 17, 17)
	d.pdf.CellFormat(120, 4, d.tr(strings.ToUpper(d.event.Name+" - "+d.section)), "", 0, "L", false, 0, "")
	d.pdf.SetFont("Helvetica", "", 7)
	d.pdf.SetTextColor(102, 102, 102)
	d.pdf.CellFormat(0, 4, d.tr("continued"), "", 1, "R", false, 0, "")
	d.pdf.SetDrawColor(187, 187, 187)
	y := d.pdf.GetY()
	d.pdf.Line(audioMarginLeft, y, 210-audioMarginRight, y)
	d.pdf.SetDrawColor(17, 17, 17)
	d.pdf.SetTextColor(17, 17, 17)
	d.pdf.Ln(2)
}

// writeSectionHead opens a section. Sections flow one after another rather than
// each claiming a fresh page: paper is the scarce thing at a production desk.
func (d *audioDoc) writeSectionHead(number int, title, count string) {
	// Keep a heading with at least a row or two under it.
	if d.pdf.GetY() > 250 {
		d.pdf.AddPage()
	}
	d.section = title
	d.pdf.SetFont("Helvetica", "B", 8)
	d.pdf.SetTextColor(17, 17, 17)
	d.pdf.CellFormat(5, 5.4, d.tr(fmt.Sprintf("%d", number)), "", 0, "L", false, 0, "")
	d.pdf.SetFont("Helvetica", "B", 11)
	d.pdf.CellFormat(120, 5.4, d.tr(title), "", 0, "L", false, 0, "")
	d.pdf.SetFont("Helvetica", "", 7)
	d.pdf.SetTextColor(119, 119, 119)
	d.pdf.CellFormat(0, 5.4, d.tr(count), "", 1, "R", false, 0, "")
	d.pdf.SetTextColor(17, 17, 17)
}

// writeTableHeader draws a column header and registers it to repeat after every
// page break until the next section replaces it.
func (d *audioDoc) writeTableHeader(columns []float64, headers []string, aligns []string) {
	draw := func() {
		d.pdf.SetFont("Helvetica", "B", 7)
		d.pdf.SetTextColor(68, 68, 68)
		for i, header := range headers {
			d.pdf.CellFormat(columns[i], 5, d.tr(header), "B", boolToInt(i == len(headers)-1), aligns[i], false, 0, "")
		}
		d.pdf.SetTextColor(17, 17, 17)
		d.pdf.Ln(0.6)
	}
	d.repeatHeader = draw
	draw()
}

// writeNoteLine is the continuation line: a note, or the statement that a
// channel has no source. It spans the text block beneath its row rather than
// living in a column that is empty on almost every row.
func (d *audioDoc) writeNoteLine(indent float64, text string) {
	if text == "" {
		return
	}
	d.pdf.SetFont("Helvetica", "I", 6.8)
	d.pdf.SetTextColor(85, 85, 85)
	d.pdf.SetX(audioMarginLeft + indent)
	d.pdf.CellFormat(audioBlockW-indent, audioNoteHeight,
		d.tr(truncatePDF(d.pdf, text, audioBlockW-indent)), "", 1, "L", false, 0, "")
	d.pdf.SetTextColor(17, 17, 17)
}

// writeStripe draws the channel or output strip colour as a bar at the row's
// left edge. It repeats what the row already says in words — a monochrome print
// loses nothing.
func (d *audioDoc) writeStripe(color string) {
	red, green, blue, ok := parseHexColor(color)
	if !ok {
		return
	}
	x, y := d.pdf.GetX(), d.pdf.GetY()
	d.pdf.SetFillColor(red, green, blue)
	d.pdf.Rect(x, y+0.4, 1.2, audioRowHeight-0.8, "F")
}

// writeLegend closes a section with the conventions it used. It prints once,
// where the section ends, because it is read once.
func (d *audioDoc) writeLegend(notes []string) {
	d.pdf.Ln(1)
	d.pdf.SetDrawColor(187, 187, 187)
	y := d.pdf.GetY()
	d.pdf.Line(audioMarginLeft, y, 210-audioMarginRight, y)
	d.pdf.SetDrawColor(17, 17, 17)
	d.pdf.Ln(1)
	d.pdf.SetFont("Helvetica", "", 6.6)
	d.pdf.SetTextColor(119, 119, 119)
	d.pdf.CellFormat(0, 3.4, d.tr(strings.Join(notes, "     ")), "", 1, "L", false, 0, "")
	d.pdf.SetTextColor(17, 17, 17)
	d.pdf.Ln(3)
}

func (d *audioDoc) writeEmptySection(text string) {
	d.pdf.SetFont("Helvetica", "I", 8)
	d.pdf.SetTextColor(102, 102, 102)
	d.pdf.CellFormat(0, 6, d.tr(text), "", 1, "L", false, 0, "")
	d.pdf.SetTextColor(17, 17, 17)
	d.pdf.Ln(3)
	d.repeatHeader = nil
}
