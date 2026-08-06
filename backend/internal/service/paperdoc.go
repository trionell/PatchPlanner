package service

import (
	"fmt"
	"strings"

	"github.com/go-pdf/fpdf"
)

// The furniture every generated document wears: the masthead on page one, the
// running head on the pages after it, and the footer.
//
// Slice 40 wrote this for the audio plan with the note that the same block
// would serve a plot document "with one word changed", and Slice 41 is that
// word. What actually differs between the two is the page width — the audio
// plan is portrait, the stage plot landscape — so that is the parameter, and
// the rest is shared rather than kept in two copies that drift.

const (
	paperMarginLeft   = 12.0
	paperMarginTop    = 12.0
	paperMarginRight  = 12.0
	paperMarginBottom = 16.0
)

// paperDoc is the page furniture bound to one document's page geometry.
type paperDoc struct {
	pdf   *fpdf.Fpdf
	tr    func(string) string
	width float64 // the page's width in mm, so landscape and portrait share this
}

func (d paperDoc) textWidth() float64 { return d.width - paperMarginLeft - paperMarginRight }

// masthead is page one's identity block, and a document's only large type.
// The word stands opposite the title — "AUDIO" for the audio plan, "PLOT" for
// a stage plot — which is what tells the two apart at arm's length.
func (d paperDoc) masthead(title, word, subtitle, metaLeft, metaRight string) {
	d.pdf.SetFont("Helvetica", "B", 17)
	d.pdf.SetTextColor(17, 17, 17)
	d.pdf.CellFormat(d.textWidth()-36, 8, d.tr(title), "", 0, "L", false, 0, "")
	d.pdf.SetFont("Helvetica", "B", 8)
	d.pdf.SetTextColor(102, 102, 102)
	d.pdf.CellFormat(0, 8, d.tr(word), "", 1, "R", false, 0, "")

	d.pdf.SetFont("Helvetica", "", 9)
	d.pdf.SetTextColor(51, 51, 51)
	d.pdf.CellFormat(0, 4.6, d.tr(subtitle), "", 1, "L", false, 0, "")

	d.pdf.SetFont("Helvetica", "", 7)
	d.pdf.SetTextColor(119, 119, 119)
	d.pdf.CellFormat(d.textWidth()/2.6, 4, d.tr(metaLeft), "", 0, "L", false, 0, "")
	d.pdf.CellFormat(0, 4, d.tr(metaRight), "", 1, "R", false, 0, "")

	// The heaviest rule in the document, used exactly once.
	d.pdf.Ln(1)
	d.pdf.SetLineWidth(0.5)
	y := d.pdf.GetY()
	d.pdf.Line(paperMarginLeft, y, d.width-paperMarginRight, y)
	d.pdf.SetLineWidth(0.2)
	d.pdf.SetTextColor(17, 17, 17)
	d.pdf.Ln(4)
}

// runningHead names what the reader is inside, on every page after the first.
func (d paperDoc) runningHead(left, right string) {
	d.pdf.SetY(paperMarginTop)
	d.pdf.SetFont("Helvetica", "B", 6.5)
	d.pdf.SetTextColor(17, 17, 17)
	d.pdf.CellFormat(d.textWidth()-40, 4, d.tr(strings.ToUpper(left)), "", 0, "L", false, 0, "")
	d.pdf.SetFont("Helvetica", "", 7)
	d.pdf.SetTextColor(102, 102, 102)
	d.pdf.CellFormat(0, 4, d.tr(right), "", 1, "R", false, 0, "")
	d.pdf.SetDrawColor(187, 187, 187)
	y := d.pdf.GetY()
	d.pdf.Line(paperMarginLeft, y, d.width-paperMarginRight, y)
	d.pdf.SetDrawColor(17, 17, 17)
	d.pdf.SetTextColor(17, 17, 17)
	d.pdf.Ln(2)
}

// installFooter registers the page footer: what the document is on the left,
// the page over the total on the right. AliasNbPages resolves the total.
func (d paperDoc) installFooter(label string) {
	d.pdf.SetFooterFunc(func() {
		d.pdf.SetY(-11)
		d.pdf.SetFont("Helvetica", "", 6.6)
		d.pdf.SetTextColor(140, 140, 140)
		d.pdf.CellFormat(d.textWidth()-40, 4, d.tr(label), "T", 0, "L", false, 0, "")
		d.pdf.CellFormat(0, 4, d.tr(fmt.Sprintf("%d / {nb}", d.pdf.PageNo())), "T", 0, "R", false, 0, "")
		d.pdf.SetTextColor(17, 17, 17)
	})
	d.pdf.AliasNbPages("{nb}")
}
