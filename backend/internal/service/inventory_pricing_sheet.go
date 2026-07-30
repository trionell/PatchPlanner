package service

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/trionell/patchplanner/internal/domain"
	"github.com/xuri/excelize/v2"
)

// Reading a supplier's pricing out of a spreadsheet (Slice 31).
//
// One parser serves both importers, because both formats state the same fact in
// the same shape: a table of days -> multiplier, found by its headings rather
// than by its position. What they do not share is where VAT lives — the generic
// sheet states it as a labelled value, and LL.xlsx states it only inside a
// formula — so that is a second, separate reader below.

// pricingSheetNames are the sheet names the rate card is looked for under. LL's
// own is "Hyresfaktor"; the generated template's is "Pricing".
var pricingSheetNames = []string{"pricing", "rent factor", "rental factor", "hyresfaktor", "prissattning"}

// The rate card's two column headings, matched after normalization so that
// "Antal \ndagar" reads as "antal dagar".
var (
	daysHeaders   = []string{"days", "antal dagar", "dagar", "day"}
	factorHeaders = []string{"factor", "hyresfaktor", "rent factor", "rental factor", "faktor"}
	vatLabels     = []string{"vat %", "vat", "vat percent", "moms", "moms %"}
)

// pricingSheet is what a file had to say about pricing. Found is false when the
// workbook has no such sheet at all — which is the ordinary case for every
// generic file written before this slice, and the case that must leave a
// catalog's existing rate card alone.
type pricingSheet struct {
	Found bool
	// Factors is empty when the sheet exists but carries no usable rows —
	// which is exactly the blank generated template. An empty card carries no
	// table, and a table it does not carry it cannot replace.
	Factors []domain.RentFactor
	// VATPercent is nil when the sheet states no rate.
	VATPercent *float64
	Warnings   []string
}

// parsePricingSheet reads the optional rate-card sheet.
//
// Every problem it finds is a WARNING and never an error: a malformed factor row
// must not reject a 308-item price list (FR-007). The catalog's items are the
// point of an import; its rate card is a bonus the file may or may not carry.
func parsePricingSheet(file *excelize.File) pricingSheet {
	sheet, ok := findPricingSheet(file)
	if !ok {
		return pricingSheet{}
	}
	result := pricingSheet{Found: true, Factors: make([]domain.RentFactor, 0)}

	rows, err := file.GetRows(sheet, excelize.Options{RawCellValue: true})
	if err != nil {
		result.Warnings = append(result.Warnings, fmt.Sprintf("could not read the %q sheet: %v", sheet, err))
		return result
	}

	// One pass. Before the Days/Factor heading, a labelled row may state the
	// VAT rate; after it, every row is a rate-card row. LL's own sheet has
	// eighteen blank rows above its heading, which is why the heading is
	// searched for rather than assumed.
	daysCol, factorCol := -1, -1
	seenDays := map[int]int{} // day count -> the sheet row that claimed it

	for index, row := range rows {
		sheetRow := index + 1

		if daysCol < 0 {
			if rate, ok := readLabelledVAT(row); ok {
				result.VATPercent = &rate
				continue
			}
			if d, f, ok := findRateCardHeaders(row); ok {
				daysCol, factorCol = d, f
			}
			continue
		}

		rawDays := strings.TrimSpace(cell(row, daysCol))
		rawFactor := strings.TrimSpace(cell(row, factorCol))
		if rawDays == "" && rawFactor == "" {
			continue
		}

		days, err := strconv.Atoi(strings.TrimSpace(strings.ReplaceAll(rawDays, ",", ".")))
		if err != nil || days < 1 {
			result.Warnings = append(result.Warnings,
				fmt.Sprintf("rent factor row %d: %q is not a number of days - row skipped", sheetRow, rawDays))
			continue
		}
		factor := atof(rawFactor)
		if factor <= 0 {
			result.Warnings = append(result.Warnings,
				fmt.Sprintf("rent factor row %d: %q is not a usable factor for %d days - row skipped", sheetRow, rawFactor, days))
			continue
		}

		// The table is one curve, so a repeated day count is a typo rather
		// than a second opinion. The last row wins — it is the one further down
		// the sheet, which is what a person editing by hand would expect — and
		// the user is told rather than left with a silent choice.
		if previous, seen := seenDays[days]; seen {
			result.Warnings = append(result.Warnings,
				fmt.Sprintf("rent factor: %d days appears on rows %d and %d; the later row wins", days, previous, sheetRow))
			for i := range result.Factors {
				if result.Factors[i].Days == days {
					result.Factors[i].Factor = factor
					break
				}
			}
			seenDays[days] = sheetRow
			continue
		}
		seenDays[days] = sheetRow
		result.Factors = append(result.Factors, domain.RentFactor{Days: days, Factor: factor})
	}

	if daysCol < 0 {
		result.Warnings = append(result.Warnings,
			fmt.Sprintf("the %q sheet has no %q/%q heading, so no rent factors were read", sheet, "Days", "Factor"))
	}
	// Ascending, whatever order the file listed them in: domain.LookupRentFactor
	// assumes it, and so does everything that renders the curve.
	sort.Slice(result.Factors, func(i, j int) bool { return result.Factors[i].Days < result.Factors[j].Days })
	sort.Strings(result.Warnings)
	return result
}

func findPricingSheet(file *excelize.File) (string, bool) {
	for _, name := range file.GetSheetList() {
		normalized := normalizeHeader(name)
		for _, candidate := range pricingSheetNames {
			if normalized == candidate {
				return name, true
			}
		}
	}
	return "", false
}

func findRateCardHeaders(row []string) (daysCol, factorCol int, ok bool) {
	daysCol, factorCol = -1, -1
	for index, value := range row {
		header := normalizeHeader(value)
		if daysCol < 0 && matchesAny(header, daysHeaders) {
			daysCol = index
			continue
		}
		if factorCol < 0 && matchesAny(header, factorHeaders) {
			factorCol = index
		}
	}
	return daysCol, factorCol, daysCol >= 0 && factorCol >= 0
}

// readLabelledVAT reads a `VAT % | 25` row, which is how the generic format
// states a rate. Values are accepted as a percentage (25) or as a fraction
// (0.25) — a spreadsheet cell formatted as a percentage stores the latter, and
// nobody typing into that template should have to know which.
func readLabelledVAT(row []string) (float64, bool) {
	if len(row) < 2 || !matchesAny(normalizeHeader(row[0]), vatLabels) {
		return 0, false
	}
	raw := strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(cell(row, 1)), "%"))
	if raw == "" {
		return 0, false
	}
	value := atof(raw)
	if value < 0 {
		return 0, false
	}
	if value > 0 && value < 1 {
		value *= 100
	}
	return value, true
}

// llVATRowLabel is the row whose formula states LL.xlsx's VAT rate. It is the
// equipment row, chosen over the six other `*1.25` formulas in that sheet
// because equipment is the only part of Sammanställning PatchPlanner models.
const llVATRowLabel = "summa utrustning ink"

// vatMultiplierPattern pulls 1.25 out of `=B6*1.25`.
var vatMultiplierPattern = regexp.MustCompile(`\*\s*([0-9]+(?:[.,][0-9]+)?)`)

// readLLVATPercent recovers LL.xlsx's VAT rate, which that file never states as
// a value: it states it as `*1.25`, seven times over, inside formulas.
//
// This is a heuristic and is treated as one. A missing sheet, a renamed row, an
// absent formula, an unparseable multiplier or a result that is not greater than
// 1 all mean the same thing — THIS FILE STATES NO RATE — and the catalog simply
// keeps the rate it has. Nothing fails, and nothing is guessed from a partial
// read (research.md R2).
func readLLVATPercent(file *excelize.File) (float64, bool) {
	rows, err := file.GetRows(summarySheet, excelize.Options{RawCellValue: true})
	if err != nil {
		return 0, false
	}
	for index, row := range rows {
		if normalizeHeader(cell(row, 0)) != llVATRowLabel {
			continue
		}
		// Column B, the equipment column, on this row.
		cellName, err := excelize.CoordinatesToCellName(2, index+1)
		if err != nil {
			return 0, false
		}
		formula, err := file.GetCellFormula(summarySheet, cellName)
		if err != nil || formula == "" {
			return 0, false
		}
		match := vatMultiplierPattern.FindStringSubmatch(formula)
		if match == nil {
			return 0, false
		}
		multiplier := atof(match[1])
		if multiplier <= 1 {
			return 0, false
		}
		// 1.25 -> 25%. Rounded to two decimals so a float artefact never
		// becomes a VAT rate of 24.999999999999996.
		return float64(int((multiplier-1)*10000+0.5)) / 100, true
	}
	return 0, false
}

func matchesAny(value string, candidates []string) bool {
	for _, candidate := range candidates {
		if value == candidate {
			return true
		}
	}
	return false
}
