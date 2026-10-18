package service

import (
	"fmt"
	"sort"
	"strings"

	"github.com/trionell/patchplanner/internal/domain"
)

// LocalUse is a desk's patched local jacks.
type LocalUse = domain.LocalUse

// JackUse is one patched local jack.
type JackUse = domain.JackUse

// MappedRow is one channel before and after a switch or a placing.
type MappedRow struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	FromNumber    int    `json:"from_number"`
	FromPool      string `json:"from_pool"`
	FromWidth     int    `json:"from_width"`
	ToNumber      int    `json:"to_number"`
	ToPool        string `json:"to_pool"`
	ToWidth       int    `json:"to_width"`
	MixerBehavior string `json:"mixer_behavior"`
	// Over is past the target pool's last strip: kept, flagged (B2).
	Over    bool `json:"over"`
	WasOver bool `json:"was_over"`
}

// Figure is one before/after line of the preview's table.
type Figure struct {
	Label     string `json:"label"`
	Before    int    `json:"before"`
	BeforeCap int    `json:"before_capacity"`
	After     int    `json:"after"`
	AfterCap  int    `json:"after_capacity"`
}

// Preview words (A3 + B1).
const (
	WordLeftOut   = "Left out"
	WordChanged   = "Changed"
	WordMoved     = "Moved"
	WordFitsAgain = "Fits again"
)

// PreviewLine is one word-led line; Items is the folded list under it.
type PreviewLine struct {
	Word  string   `json:"word"`
	Text  string   `json:"text"`
	Items []string `json:"items,omitempty"`
}

// Mapping is what a switch or a placing will do — the preview and, applied,
// the result. One function computes it for both, so they cannot disagree.
type Mapping struct {
	Rows    []MappedRow   `json:"rows"`
	Figures []Figure      `json:"figures"`
	Lines   []PreviewLine `json:"lines"`
}

// DeskSide is one side of a switch: the model, plus the console's typed
// input count (Generic's channel capacity; 0 = undeclared) and local counts.
type DeskSide struct {
	Model    domain.DeskModel
	Inputs   int
	LocalIn  int
	LocalOut int
}

func (s DeskSide) capacity(pool string) int {
	if s.Model.Engine == domain.EngineGeneric {
		if pool == domain.PoolAux {
			return 0
		}
		return s.Inputs
	}
	return s.Model.PoolCapacity(pool, 0)
}

func (s DeskSide) width(row domain.StripRow, mixerBehavior string) int {
	return s.Model.StripWidth(row.Width, mixerBehavior)
}

func rowName(row domain.StripRow) string {
	if row.Name == "" {
		return "unnamed"
	}
	return row.Name
}

// MapRows maps a desk's channels from one model to another (Slice 47 D4):
// rows in strip order, each keeping its number where it is legal and free,
// a stereo row on X32 · M32 bumped to the next odd pair, later rows moved
// along as far as they have to, and what does not fit kept past the end and
// flagged over. Switching onto X32 never fills aux; leaving X32 puts aux rows
// on strips after the last channel; X32 → X32 keeps each row's pool.
func MapRows(rows []domain.StripRow, jacks LocalUse, from, to DeskSide) Mapping {
	ordered := append([]domain.StripRow(nil), rows...)
	domain.SortStripRows(ordered)

	targetPool := func(row domain.StripRow) string {
		if to.Model.Engine == domain.EngineX32 && from.Model.Engine == domain.EngineX32 {
			return row.Pool
		}
		return domain.PoolChannel
	}
	forced := to.Model.ForcedMixerBehavior()

	cursor := map[string]int{domain.PoolChannel: 1, domain.PoolAux: 1}
	mapped := make([]MappedRow, 0, len(ordered))
	for _, row := range ordered {
		mb := row.MixerBehavior
		if forced != "" {
			mb = forced
		}
		pool := targetPool(row)
		w := to.width(row, mb)
		fromCap := from.capacity(row.Pool)
		fromW := from.width(row, row.MixerBehavior)

		number := row.Number
		// A row leaving its pool (aux onto strips) has no number to keep:
		// it goes after whatever is already placed.
		if pool != row.Pool {
			number = cursor[pool]
		}
		n := max(number, cursor[pool])
		if to.Model.Engine == domain.EngineX32 && w == 2 && n%2 == 0 {
			n++
		}
		capacity := to.capacity(pool)
		over := capacity > 0 && n+w-1 > capacity
		cursor[pool] = n + w

		mapped = append(mapped, MappedRow{
			ID: row.ID, Name: rowName(row),
			FromNumber: row.Number, FromPool: row.Pool, FromWidth: fromW,
			ToNumber: n, ToPool: pool, ToWidth: w, MixerBehavior: mb,
			Over:    over,
			WasOver: fromCap > 0 && row.Number+fromW-1 > fromCap,
		})
	}

	return Mapping{Rows: mapped, Figures: switchFigures(mapped, jacks, from, to), Lines: switchLines(mapped, ordered, jacks, from, to)}
}

func used(rows []MappedRow, pool string, after bool) int {
	total := 0
	for _, row := range rows {
		if after && row.ToPool == pool {
			total += row.ToWidth
		}
		if !after && row.FromPool == pool {
			total += row.FromWidth
		}
	}
	return total
}

func switchFigures(rows []MappedRow, jacks LocalUse, from, to DeskSide) []Figure {
	figures := []Figure{{
		Label:  "Strips",
		Before: used(rows, domain.PoolChannel, false), BeforeCap: from.capacity(domain.PoolChannel),
		After: used(rows, domain.PoolChannel, true), AfterCap: to.capacity(domain.PoolChannel),
	}}
	if from.Model.Engine == domain.EngineX32 || to.Model.Engine == domain.EngineX32 {
		figures = append(figures, Figure{
			Label:  "Aux in",
			Before: used(rows, domain.PoolAux, false), BeforeCap: from.capacity(domain.PoolAux),
			After: used(rows, domain.PoolAux, true), AfterCap: to.capacity(domain.PoolAux),
		})
	}
	figures = append(figures,
		Figure{Label: "Local in", Before: len(jacks.Inputs), BeforeCap: from.LocalIn, After: len(jacks.Inputs), AfterCap: to.LocalIn},
		Figure{Label: "Local out", Before: len(jacks.Outputs), BeforeCap: from.LocalOut, After: len(jacks.Outputs), AfterCap: to.LocalOut},
	)
	return figures
}

func label(pool string, number, width int) string {
	return domain.StripLabel(pool, number, width)
}

func names(rows []MappedRow) []string {
	out := make([]string, len(rows))
	for i, row := range rows {
		out[i] = row.Name
	}
	return out
}

func count(n int, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return fmt.Sprintf("%d %s", n, many)
}

func switchLines(rows []MappedRow, source []domain.StripRow, jacks LocalUse, from, to DeskSide) []PreviewLine {
	var lines []PreviewLine
	target := to.Model.Label

	var leftOut, fitsAgain, moved, auxMoved, toPairs, toStrips []MappedRow
	for _, row := range rows {
		switch {
		case row.Over:
			leftOut = append(leftOut, row)
		case row.WasOver:
			fitsAgain = append(fitsAgain, row)
		}
		if !row.Over && row.FromPool == domain.PoolAux && row.ToPool == domain.PoolChannel {
			auxMoved = append(auxMoved, row)
		} else if !row.Over && !row.WasOver && row.ToPool == row.FromPool && row.ToNumber != row.FromNumber {
			moved = append(moved, row)
		}
		if row.FromWidth == 1 && row.ToWidth == 2 {
			toPairs = append(toPairs, row)
		}
		if row.FromWidth == 2 && row.ToWidth == 1 {
			toStrips = append(toStrips, row)
		}
	}

	if len(leftOut) > 0 {
		capacity := to.capacity(domain.PoolChannel)
		lines = append(lines, PreviewLine{
			Word: WordLeftOut,
			Text: fmt.Sprintf("%s past strip %d. The patch needs %d strips; %s has %d.",
				count(len(leftOut), "channel", "channels"), capacity, used(rows, domain.PoolChannel, true), target, capacity),
			Items: names(leftOut),
		})
	}
	for _, side := range []struct {
		noun  string
		jacks []JackUse
		cap   int
	}{{"local input", jacks.Inputs, to.LocalIn}, {"local output", jacks.Outputs, to.LocalOut}} {
		if to.Model.Engine == domain.EngineGeneric {
			break
		}
		var past []string
		for _, jack := range side.jacks {
			if jack.Port >= side.cap {
				past = append(past, fmt.Sprintf("%d · %s", jack.Port+1, jack.Label))
			}
		}
		if len(past) > 0 {
			lines = append(lines, PreviewLine{
				Word:  WordLeftOut,
				Text:  fmt.Sprintf("%s past %s's %d %ss. The cables are kept, flagged over.", count(len(past), side.noun, side.noun+"s"), target, side.cap, side.noun),
				Items: past,
			})
		}
	}

	if len(toPairs) > 0 {
		lines = append(lines, PreviewLine{Word: WordChanged, Text: fmt.Sprintf("%s become linked pairs, odd to even.", count(len(toPairs), "stereo channel", "stereo channels")), Items: names(toPairs)})
	}
	if len(toStrips) > 0 {
		lines = append(lines, PreviewLine{Word: WordChanged, Text: fmt.Sprintf("%s become stereo strips.", count(len(toStrips), "linked pair", "linked pairs")), Items: names(toStrips)})
	}
	if limit := to.Model.NameLength; limit > 0 {
		var long []string
		for _, row := range source {
			if len([]rune(row.Name)) > limit {
				long = append(long, row.Name)
			}
		}
		if len(long) > 0 {
			lines = append(lines, PreviewLine{Word: WordChanged, Text: fmt.Sprintf("%s longer than %s shows (%d). Kept whole; the export cuts them.", count(len(long), "name is", "names are"), target, limit), Items: long})
		}
	}
	switch {
	case to.Model.Engine == domain.EngineGeneric && from.Model.Engine != domain.EngineGeneric:
		lines = append(lines, PreviewLine{Word: WordChanged, Text: fmt.Sprintf("The counts become typed: %d inputs, %d / %d local.", to.Inputs, to.LocalIn, to.LocalOut)})
	case from.Model.Engine == domain.EngineGeneric && to.Model.Engine != domain.EngineGeneric && (from.Inputs > 0 || from.LocalIn > 0 || from.LocalOut > 0):
		lines = append(lines, PreviewLine{Word: WordChanged, Text: fmt.Sprintf("The typed counts are replaced by %s's.", target)})
	}

	if len(moved) > 0 {
		lines = append(lines, PreviewLine{Word: WordMoved, Text: fmt.Sprintf("%s to keep the order and the pairs.", count(len(moved), "channel moves", "channels move")), Items: moveItems(moved)})
	}
	if len(auxMoved) > 0 {
		lines = append(lines, PreviewLine{Word: WordMoved, Text: fmt.Sprintf("%s onto strips after the channels.", count(len(auxMoved), "aux input moves", "aux inputs move")), Items: moveItems(auxMoved)})
	}
	if len(fitsAgain) > 0 {
		lines = append(lines, PreviewLine{Word: WordFitsAgain, Text: fmt.Sprintf("%s that were left out fit again.", count(len(fitsAgain), "channel", "channels")), Items: names(fitsAgain)})
	}
	return lines
}

func moveItems(rows []MappedRow) []string {
	items := make([]string, len(rows))
	for i, row := range rows {
		from := strings.TrimPrefix(label(row.FromPool, row.FromNumber, row.FromWidth), "Ch ")
		to := strings.TrimPrefix(label(row.ToPool, row.ToNumber, row.ToWidth), "Ch ")
		items[i] = fmt.Sprintf("%s %s → %s", row.Name, from, to)
	}
	return items
}

// PlaceRows maps rows with no desk onto a desk alongside the rows already on
// it, which never move: each keeps its number where it is legal and free,
// else takes the lowest free strip, else is kept past the end and flagged
// over. It never places a row on aux.
func PlaceRows(existing, incoming []domain.StripRow, to DeskSide) Mapping {
	ordered := append([]domain.StripRow(nil), incoming...)
	domain.SortStripRows(ordered)
	occupants := append([]domain.StripRow(nil), existing...)
	forced := to.Model.ForcedMixerBehavior()
	capacity := to.capacity(domain.PoolChannel)

	highest := 0
	for _, row := range existing {
		if row.Pool == domain.PoolChannel {
			highest = max(highest, row.Number+to.width(row, row.MixerBehavior)-1)
		}
	}

	mapped := make([]MappedRow, 0, len(ordered))
	for _, row := range ordered {
		mb := row.MixerBehavior
		if forced != "" {
			mb = forced
		}
		candidate := row
		candidate.Pool = domain.PoolChannel
		candidate.MixerBehavior = mb
		w := to.width(candidate, mb)
		n := row.Number
		over := false
		if to.Model.Engine == domain.EngineGeneric {
			// Generic checks nothing: the row keeps its number.
		} else if refusal := domain.CheckStrip("", to.Model, candidate, occupants); refusal != nil {
			if fix := refusal.Fix; fix != nil {
				n = fix.Number
			} else {
				n = max(row.Number, highest+1, capacity+1)
				over = true
			}
		}
		candidate.Number = n
		occupants = append(occupants, candidate)
		highest = max(highest, n+w-1)
		mapped = append(mapped, MappedRow{
			ID: row.ID, Name: rowName(row),
			FromNumber: row.Number, FromPool: row.Pool, FromWidth: w,
			ToNumber: n, ToPool: domain.PoolChannel, ToWidth: w, MixerBehavior: mb, Over: over,
		})
	}

	var lines []PreviewLine
	var moved, left []MappedRow
	for _, row := range mapped {
		if row.Over {
			left = append(left, row)
		} else if row.ToNumber != row.FromNumber {
			moved = append(moved, row)
		}
	}
	if len(left) > 0 {
		lines = append(lines, PreviewLine{Word: WordLeftOut, Text: fmt.Sprintf("%s no free strip on %s; kept past the end, flagged over.", count(len(left), "channel has", "channels have"), to.Model.Label), Items: names(left)})
	}
	if len(moved) > 0 {
		sort.SliceStable(moved, func(i, j int) bool { return moved[i].ToNumber < moved[j].ToNumber })
		lines = append(lines, PreviewLine{Word: WordMoved, Text: fmt.Sprintf("%s to a free strip; the number is taken on %s.", count(len(moved), "channel moves", "channels move"), to.Model.Label), Items: moveItems(moved)})
	}
	return Mapping{Rows: mapped, Lines: lines}
}
