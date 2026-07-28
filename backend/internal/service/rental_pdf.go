package service

import (
	"bytes"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

// PDF page geometry. 12mm margins match the app's existing print sheets
// (@page { margin: 12mm } in frontend/src/index.css), so a PDF and a
// printed patch sheet sit on paper the same way.
const (
	pdfMarginLeft   = 12.0
	pdfMarginTop    = 12.0
	pdfMarginRight  = 12.0
	pdfMarginBottom = 16.0
	pdfLineHeight   = 5.0
)

// pdfColumns are the line-table column widths in mm, left to right:
// item, description, audio, lighting, total, unit price, sum. They total
// 186mm — the A4 width (210) less both margins.
var pdfColumns = []float64{52, 50, 14, 14, 14, 20, 22}

// BuildRentalPDF renders an event's rental order as a supplier-facing PDF:
// grouped by category with per-category subtotals, a grand total, and
// status markers explained in a footnote.
//
// Available for every inventory whatever its source format (FR-024) — this
// is the export that guarantees no inventory is a dead end.
//
// A hard constraint runs through this file: the document uses built-in
// Helvetica with a cp1252 translator, so no font file is embedded and the
// binary stays small. Every string drawn therefore passes through tr() and
// must be cp1252-representable. "å ä ö é &" are fine; "▲", "–" (en dash)
// and "·" are NOT and would render as garbage. That is why the status
// markers and rules below are plain ASCII.
func (s ExportService) BuildRentalPDF(eventID int64) ([]byte, string, error) {
	event, err := db.GetEvent(s.DB, eventID)
	if err != nil {
		return nil, "", fmt.Errorf("load event: %w", err)
	}
	summary, err := db.GetRentalSummary(s.DB, eventID)
	if err != nil {
		return nil, "", err
	}
	inventory, err := db.GetInventory(s.DB, event.InventoryID)
	if err != nil {
		return nil, "", fmt.Errorf("load inventory: %w", err)
	}

	groups := groupRentalByCategory(summary.Items)

	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(pdfMarginLeft, pdfMarginTop, pdfMarginRight)
	pdf.SetAutoPageBreak(true, pdfMarginBottom)
	tr := pdf.UnicodeTranslatorFromDescriptor("cp1252")

	// Column headers repeat on every page (FR-029). fpdf calls this after
	// each automatic page break as well as on AddPage.
	// Page 1 is handled explicitly below, after the document header; fpdf
	// calls this before that has been drawn, so skipping it here is what
	// keeps the two from overlapping.
	pdf.SetHeaderFunc(func() {
		if pdf.PageNo() > 1 {
			writePDFTableHeader(pdf, tr)
		}
	})
	pdf.SetFooterFunc(func() {
		pdf.SetY(-12)
		pdf.SetFont("Helvetica", "I", 7)
		pdf.SetTextColor(120, 120, 120)
		pdf.CellFormat(0, 5, tr(fmt.Sprintf("%s   -   Page %d of {nb}", event.Name, pdf.PageNo())), "", 0, "C", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	})
	pdf.AliasNbPages("{nb}")
	pdf.AddPage()

	// Page 1's column header comes after the document header; every later
	// page gets it from the header func above.
	writePDFDocumentHeader(pdf, tr, event, inventory)
	writePDFTableHeader(pdf, tr)

	for _, group := range groups {
		writePDFCategory(pdf, tr, group)
	}

	writePDFTotals(pdf, tr, summary, len(groups))
	writePDFFootnotes(pdf, tr, summary)

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, "", fmt.Errorf("render pdf: %w", err)
	}
	return buf.Bytes(), exportFilename(event, ".pdf"), nil
}

// rentalCategoryGroup is one category's lines plus its subtotals.
type rentalCategoryGroup struct {
	Name     string
	Type     string
	Lines    []domain.EventRental
	Quantity int
	Total    float64
}

// groupRentalByCategory buckets the summary by category, ordered by
// category name. Lines keep the summary's own order within a group, so the
// document and the on-screen table agree line for line.
func groupRentalByCategory(lines []domain.EventRental) []rentalCategoryGroup {
	byName := map[string]*rentalCategoryGroup{}
	for _, line := range lines {
		name := line.CategoryName
		if name == "" {
			// An item whose category row vanished still has to appear —
			// dropping it would understate the order.
			name = "Uncategorised"
		}
		group, ok := byName[name]
		if !ok {
			group = &rentalCategoryGroup{Name: name, Type: line.CategoryType}
			byName[name] = group
		}
		group.Lines = append(group.Lines, line)
		group.Quantity += line.TotalQuantity
		group.Total += line.SubtotalExVAT
	}

	groups := make([]rentalCategoryGroup, 0, len(byName))
	for _, group := range byName {
		groups = append(groups, *group)
	}
	sort.Slice(groups, func(i, j int) bool { return groups[i].Name < groups[j].Name })
	return groups
}

func writePDFDocumentHeader(pdf *fpdf.Fpdf, tr func(string) string, event domain.Event, inventory domain.Inventory) {
	pdf.SetFont("Helvetica", "B", 16)
	pdf.CellFormat(0, 8, tr("RENTAL ORDER"), "", 1, "L", false, 0, "")

	pdf.SetFont("Helvetica", "B", 12)
	pdf.CellFormat(0, 6, tr(event.Name), "", 1, "L", false, 0, "")

	// Date and venue are both optional; join only what exists so the line
	// never reads "  -  " with nothing around it.
	pdf.SetFont("Helvetica", "", 9)
	pdf.SetTextColor(90, 90, 90)
	var where []string
	if date := strings.TrimSpace(event.StartDate); date != "" {
		where = append(where, date)
	}
	if venue := strings.TrimSpace(event.Venue); venue != "" {
		where = append(where, venue)
	}
	left := strings.Join(where, " - ")
	generated := "Generated " + time.Now().Format("2006-01-02")
	pdf.CellFormat(120, 5, tr(left), "", 0, "L", false, 0, "")
	pdf.CellFormat(0, 5, tr(generated), "", 1, "R", false, 0, "")
	if name := strings.TrimSpace(inventory.Name); name != "" {
		pdf.CellFormat(0, 5, tr("Inventory: "+name), "", 1, "L", false, 0, "")
	}
	pdf.SetTextColor(0, 0, 0)
	pdf.Ln(3)
}

func writePDFTableHeader(pdf *fpdf.Fpdf, tr func(string) string) {
	pdf.SetFont("Helvetica", "B", 8)
	pdf.SetTextColor(90, 90, 90)
	headers := []string{"Item", "Description", "Audio", "Light", "Total", "Unit", "Sum"}
	aligns := []string{"L", "L", "R", "R", "R", "R", "R"}
	for i, header := range headers {
		pdf.CellFormat(pdfColumns[i], 5, tr(header), "B", boolToInt(i == len(headers)-1), aligns[i], false, 0, "")
	}
	pdf.SetTextColor(0, 0, 0)
	pdf.Ln(1)
}

func writePDFCategory(pdf *fpdf.Fpdf, tr func(string) string, group rentalCategoryGroup) {
	// Keep a category heading with at least its first line; a heading
	// stranded at the foot of a page reads as an empty section.
	if pdf.GetY() > 250 {
		pdf.AddPage()
	}

	pdf.SetFont("Helvetica", "B", 9)
	pdf.CellFormat(140, 6, tr(strings.ToUpper(group.Name)), "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "I", 8)
	pdf.SetTextColor(120, 120, 120)
	pdf.CellFormat(0, 6, tr(group.Type), "", 1, "R", false, 0, "")
	pdf.SetTextColor(0, 0, 0)

	aligns := []string{"L", "L", "R", "R", "R", "R", "R"}
	pdf.SetFont("Helvetica", "", 8)
	for _, line := range group.Lines {
		name := line.InventoryItemName
		if line.IsOverStock {
			name += " *"
		}
		if line.IsDiscontinued {
			name += " (discontinued)"
		}
		cells := []string{
			truncatePDF(pdf, name, pdfColumns[0]),
			truncatePDF(pdf, line.Description, pdfColumns[1]),
			quantityCell(line.QuantityAudio),
			quantityCell(line.QuantityLighting),
			fmt.Sprintf("%d", line.TotalQuantity),
			formatMoney(line.PriceExVAT),
			formatMoney(line.SubtotalExVAT),
		}
		for i, value := range cells {
			pdf.CellFormat(pdfColumns[i], pdfLineHeight, tr(value), "", boolToInt(i == len(cells)-1), aligns[i], false, 0, "")
		}
	}

	pdf.SetFont("Helvetica", "B", 8)
	pdf.CellFormat(pdfColumns[0]+pdfColumns[1], pdfLineHeight, tr("Subtotal"), "T", 0, "R", false, 0, "")
	pdf.CellFormat(pdfColumns[2]+pdfColumns[3], pdfLineHeight, "", "T", 0, "R", false, 0, "")
	pdf.CellFormat(pdfColumns[4], pdfLineHeight, tr(fmt.Sprintf("%d", group.Quantity)), "T", 0, "R", false, 0, "")
	pdf.CellFormat(pdfColumns[5], pdfLineHeight, "", "T", 0, "R", false, 0, "")
	pdf.CellFormat(pdfColumns[6], pdfLineHeight, tr(formatMoney(group.Total)), "T", 1, "R", false, 0, "")
	pdf.Ln(3)
}

func writePDFTotals(pdf *fpdf.Fpdf, tr func(string) string, summary domain.RentalSummary, categories int) {
	if pdf.GetY() > 255 {
		pdf.AddPage()
	}
	pdf.Ln(2)
	pdf.SetLineWidth(0.4)
	y := pdf.GetY()
	pdf.Line(pdfMarginLeft, y, 210-pdfMarginRight, y)
	pdf.SetLineWidth(0.2)
	pdf.Ln(2)

	pdf.SetFont("Helvetica", "B", 10)
	pdf.CellFormat(40, 6, tr("TOTAL"), "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 9)
	pdf.CellFormat(90, 6, tr(fmt.Sprintf("%s, %s, %s",
		plural(categories, "category", "categories"),
		plural(summary.TotalItems, "item", "items"),
		plural(summary.TotalQuantity, "unit", "units"))), "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "B", 11)
	pdf.CellFormat(0, 6, tr(formatMoney(summary.TotalExVAT)+" SEK"), "", 1, "R", false, 0, "")
	pdf.SetFont("Helvetica", "I", 8)
	pdf.SetTextColor(120, 120, 120)
	pdf.CellFormat(0, 4, tr("excl. VAT"), "", 1, "R", false, 0, "")
	pdf.SetTextColor(0, 0, 0)
}

// writePDFFootnotes explains the ASCII status markers used on lines. They
// are markers rather than symbols because of the cp1252 constraint
// documented at the top of this file.
func writePDFFootnotes(pdf *fpdf.Fpdf, tr func(string) string, summary domain.RentalSummary) {
	var notes []string
	for _, line := range summary.Items {
		if line.IsOverStock {
			notes = append(notes, fmt.Sprintf("* %s: %d planned, %d available",
				line.InventoryItemName, line.TotalQuantity, line.QuantityAvailable))
		}
		if line.IsDiscontinued {
			notes = append(notes, fmt.Sprintf("(discontinued) %s is no longer in the catalog", line.InventoryItemName))
		}
	}
	if len(notes) == 0 {
		return
	}
	pdf.Ln(4)
	pdf.SetFont("Helvetica", "", 7)
	pdf.SetTextColor(120, 120, 120)
	for _, note := range notes {
		pdf.CellFormat(0, 4, tr(note), "", 1, "L", false, 0, "")
	}
	pdf.SetTextColor(0, 0, 0)
}

// quantityCell renders 0 as "-" so the audio/lighting split reads at a
// glance instead of as a wall of zeros.
func quantityCell(quantity int) string {
	if quantity == 0 {
		return "-"
	}
	return fmt.Sprintf("%d", quantity)
}

// formatMoney uses a space thousands separator, as Swedish invoices do.
func formatMoney(value float64) string {
	formatted := fmt.Sprintf("%.2f", value)
	parts := strings.SplitN(formatted, ".", 2)
	integer := parts[0]
	var grouped []byte
	for i, digit := range []byte(integer) {
		if i > 0 && (len(integer)-i)%3 == 0 {
			grouped = append(grouped, ' ')
		}
		grouped = append(grouped, digit)
	}
	return string(grouped) + "." + parts[1]
}

// truncatePDF clips text that would overflow its column, so a long
// equipment name never bleeds into the next column.
func truncatePDF(pdf *fpdf.Fpdf, text string, width float64) string {
	if text == "" {
		return ""
	}
	limit := width - 2
	if pdf.GetStringWidth(text) <= limit {
		return text
	}
	for len(text) > 1 {
		text = text[:len(text)-1]
		if pdf.GetStringWidth(text+"...") <= limit {
			return text + "..."
		}
	}
	return text
}

func plural(count int, singular, pluralWord string) string {
	if count == 1 {
		return fmt.Sprintf("%d %s", count, singular)
	}
	return fmt.Sprintf("%d %s", count, pluralWord)
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
