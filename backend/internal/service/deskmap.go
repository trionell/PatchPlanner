package service

import (
	"fmt"
	"slices"
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
		bump := func(n int) int {
			if to.Model.Engine == domain.EngineX32 && w == 2 && n%2 == 0 {
				return n + 1
			}
			return n
		}
		n := bump(max(number, cursor[pool]))
		capacity := to.capacity(pool)
		// A row past the last strip is not left out while there is room after the
		// row above it: it moves up into the next free strip, keeping the order.
		if capacity > 0 && n+w-1 > capacity {
			if up := bump(cursor[pool]); up+w-1 <= capacity {
				n = up
			}
		}
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
	if from.Model.AuxSockets > 0 || to.Model.AuxSockets > 0 {
		figures = append(figures, Figure{Label: "Aux sockets", Before: len(jacks.Aux), BeforeCap: from.Model.AuxSockets, After: len(jacks.Aux), AfterCap: to.Model.AuxSockets})
	}
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

	// Aux sockets come from the model on every engine, Generic's 0 included, so
	// unlike the local jacks above this is checked on a switch to Generic too.
	var pastAux []string
	for _, jack := range jacks.Aux {
		if jack.Port >= to.Model.AuxSockets {
			pastAux = append(pastAux, fmt.Sprintf("%d · %s", jack.Port+1, jack.Label))
		}
	}
	if len(pastAux) > 0 {
		lines = append(lines, PreviewLine{
			Word:  WordLeftOut,
			Text:  fmt.Sprintf("%s past %s's %d aux sockets. The cables are kept, flagged over.", count(len(pastAux), "aux socket", "aux sockets"), target, to.Model.AuxSockets),
			Items: pastAux,
		})
	}

	if len(toPairs) > 0 {
		lines = append(lines, PreviewLine{Word: WordChanged, Text: count(len(toPairs), "stereo channel becomes a linked pair, odd to even.", "stereo channels become linked pairs, odd to even."), Items: names(toPairs)})
	}
	if len(toStrips) > 0 {
		lines = append(lines, PreviewLine{Word: WordChanged, Text: count(len(toStrips), "linked pair becomes a stereo strip.", "linked pairs become stereo strips."), Items: names(toStrips)})
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
			if free, ok := domain.LowestFreeStrip(to.Model, domain.PoolChannel, candidate.Width, mb, occupants); ok {
				n = free
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

// MappedMix is one mix before and after a model switch.
type MappedMix struct {
	ID        int64  `json:"id"`
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	ToName    string `json:"to_name"`
	FromSlot  int    `json:"from_slot"`
	ToSlot    int    `json:"to_slot"`
	FromWidth string `json:"from_width"`
	ToWidth   string `json:"to_width"`
	Over      bool   `json:"over"`
	WasOver   bool   `json:"was_over"`
	// Drop is a main the new desk has not got and nothing routes to: the switch
	// removes it rather than leave an over column nobody can delete.
	Drop bool `json:"drop"`
}

// MixMapping is what a switch does to a desk's mixes, routes, Fed by and
// recorder (Slice 48 D6), in the same words as the channel mapping.
type MixMapping struct {
	Mixes          []MappedMix   `json:"mixes"`
	RecorderTracks int           `json:"recorder_tracks"`
	Figures        []Figure      `json:"figures"`
	Lines          []PreviewLine `json:"lines"`
}

func targetMixWidth(to domain.DeskModel, kind, width string) string {
	switch {
	case to.StereoForced(kind):
		return "stereo"
	case kind == domain.MixDCA || kind == domain.MixMute:
		return "mono"
	}
	return width
}

func mixLabel(m MappedMix) string {
	if m.Name != "" {
		return m.Name
	}
	return fmt.Sprintf("%s %d", m.Kind, m.FromSlot)
}

// MapMixes maps a desk's mixes onto another model: mains by slot (renamed to
// the new desk's names, kept and flagged over where it has no such main);
// then subgroups, monitors, FX, matrices, DCAs and mute groups in that order,
// each keeping its slot where legal and free, else the next legal one, else
// past the end flagged over. Routes the new engine refuses — Fed by included —
// are reported Left out and kept. Nothing is deleted.
func MapMixes(mixes []domain.DeskMix, routes []domain.DeskRoute, from, to DeskSide, recorder bool, recorderTracks int) MixMapping {
	target := to.Model
	mains := map[int]domain.MainSlot{}
	for _, main := range target.MainSlots() {
		mains[main.Slot] = main
	}
	byID := map[int64]*MappedMix{}
	var mapped []MappedMix
	var placed []domain.DeskMix

	for _, mix := range mixes {
		if mix.Kind != domain.MixMain {
			continue
		}
		m := MappedMix{ID: mix.ID, Kind: mix.Kind, Name: mix.Name, ToName: mix.Name, FromSlot: mix.Slot, ToSlot: mix.Slot, FromWidth: mix.Width, ToWidth: mix.Width}
		if main, ok := mains[mix.Slot]; ok {
			m.ToWidth = main.Width
			// A main keeps a name the planner gave it; only the old model's own
			// name ("C") becomes the new one's ("M/C").
			if mix.Name == "" || mix.Name == defaultMainName(from.Model, mix.Slot) {
				m.ToName = main.Name
			}
		} else if routed(routes, mix.ID) {
			m.Over = true
		} else {
			m.Drop = true
		}
		mapped = append(mapped, m)
	}
	for _, kind := range domain.MixKindOrder {
		var ofKind []domain.DeskMix
		for _, mix := range mixes {
			if mix.Kind == kind {
				ofKind = append(ofKind, mix)
			}
		}
		sort.SliceStable(ofKind, func(i, j int) bool { return ofKind[i].Slot < ofKind[j].Slot })
		pool := target.PoolOf(kind)
		for _, mix := range ofKind {
			w := targetMixWidth(target, kind, mix.Width)
			slot, over := mix.Slot, false
			if !target.MixSlotFits(kind, w, slot, placed, 0) {
				slot, over = 0, true
				for s := mix.Slot + 1; s <= pool.Capacity; s++ {
					if target.MixSlotFits(kind, w, s, placed, 0) {
						slot, over = s, false
						break
					}
				}
				if over {
					if s, ok := target.FirstFreeMixSlot(kind, w, placed); ok {
						slot, over = s, false
					}
				}
				if over {
					// Past the end: after everything this pool holds, so two left-out
					// mixes never share a number.
					slot = max(mix.Slot, pool.Capacity+1)
					for _, p := range placed {
						if target.PoolOf(p.Kind).Name == pool.Name && p.Slot >= slot {
							slot = p.Slot + target.MixSlotWidth(p.Kind, p.Width)
						}
					}
				}
			}
			placed = append(placed, domain.DeskMix{ID: mix.ID, Kind: kind, Slot: slot, Width: w})
			fromPool := from.Model.PoolOf(kind)
			wasOver := !fromPool.Unbounded && mix.Slot+from.Model.MixSlotWidth(kind, mix.Width)-1 > fromPool.Capacity
			mapped = append(mapped, MappedMix{ID: mix.ID, Kind: kind, Name: mix.Name, ToName: mix.Name, FromSlot: mix.Slot, ToSlot: slot, FromWidth: mix.Width, ToWidth: w, Over: over, WasOver: wasOver})
		}
	}
	for i := range mapped {
		byID[mapped[i].ID] = &mapped[i]
	}

	result := MixMapping{Mixes: mapped, RecorderTracks: recorderTracks}
	if n := target.RecorderTracks(); n > 0 {
		result.RecorderTracks = n
	}

	var lines []PreviewLine
	var over, moved, widened, renamed, dropped, fitsAgain []string
	for _, m := range mapped {
		switch {
		case m.Drop:
			dropped = append(dropped, mixLabel(m))
		case m.Over:
			over = append(over, mixLabel(m))
		case m.Kind == domain.MixMain && m.ToName != m.Name:
			renamed = append(renamed, fmt.Sprintf("%s → %s", m.Name, m.ToName))
		case m.ToSlot != m.FromSlot:
			moved = append(moved, fmt.Sprintf("%s %d → %d", mixLabel(m), m.FromSlot, m.ToSlot))
		}
		if !m.Over && m.WasOver {
			fitsAgain = append(fitsAgain, mixLabel(m))
		}
		if !m.Over && !m.Drop && m.FromWidth != m.ToWidth {
			widened = append(widened, fmt.Sprintf("%s becomes %s", mixLabel(m), m.ToWidth))
		}
	}
	if len(over) > 0 {
		lines = append(lines, PreviewLine{Word: WordLeftOut, Text: fmt.Sprintf("%s past %s's pools; kept, flagged over.", count(len(over), "mix", "mixes"), target.Label), Items: over})
	}

	// Routes the new engine refuses stay, unused: a switch back makes them again.
	var refused, fedBy []string
	nameOf := func(kind string, id int64) string {
		if kind == domain.PortMix {
			if m, ok := byID[id]; ok {
				return mixLabel(*m)
			}
		}
		return fmt.Sprintf("%s %d", kind, id)
	}
	for _, route := range routes {
		switch route.DstKind {
		case domain.PortMix:
			dst, ok := byID[route.DstID]
			if !ok {
				continue
			}
			srcKind, srcSlot := domain.RouteFromChannel, 0
			if route.SrcKind == domain.PortMix {
				src, ok := byID[route.SrcID]
				if !ok {
					continue
				}
				srcKind, srcSlot = src.Kind, src.ToSlot
			} else if route.SrcKind != domain.PortChannel {
				continue
			}
			if err := target.RouteAllowed(srcKind, srcSlot, dst.Kind, dst.ToSlot); err != nil {
				if route.SrcKind == domain.PortMix {
					refused = append(refused, fmt.Sprintf("%s → %s", nameOf(route.SrcKind, route.SrcID), mixLabel(*dst)))
				} else {
					refused = append(refused, fmt.Sprintf("a channel → %s", mixLabel(*dst)))
				}
			}
		case domain.PortOutput:
			if route.SrcKind == domain.PortMix {
				if src, ok := byID[route.SrcID]; ok && !target.FedByAllowed(src.Kind) {
					fedBy = append(fedBy, fmt.Sprintf("output %d from %s", route.DstID, mixLabel(*src)))
				}
			}
		}
	}
	if len(refused) > 0 {
		lines = append(lines, PreviewLine{Word: WordLeftOut, Text: fmt.Sprintf("%s %s cannot make; kept on Desk Routing, unused.", count(len(refused), "route", "routes"), target.Label), Items: refused})
	}
	if len(fedBy) > 0 {
		lines = append(lines, PreviewLine{Word: WordLeftOut, Text: fmt.Sprintf("%s fed by something %s cannot send to an output.", count(len(fedBy), "output is", "outputs are"), target.Label), Items: fedBy})
	}
	if recorder && result.RecorderTracks > 0 {
		var past []string
		for _, route := range routes {
			track := 0
			if route.DstKind == domain.PortRecorder {
				track = route.DstPort
			} else if route.SrcKind == domain.PortRecorder {
				track = route.SrcPort
			}
			if track > result.RecorderTracks {
				past = append(past, fmt.Sprintf("track %d", track))
			}
		}
		if len(past) > 0 {
			lines = append(lines, PreviewLine{Word: WordLeftOut, Text: fmt.Sprintf("%s past %s's %d recorder tracks; kept.", count(len(past), "recorder route is", "recorder routes are"), target.Label, result.RecorderTracks), Items: past})
		}
	}
	if len(widened) > 0 {
		lines = append(lines, PreviewLine{Word: WordChanged, Text: fmt.Sprintf("%s change width on %s.", count(len(widened), "mix", "mixes"), target.Label), Items: widened})
	}
	if len(renamed) > 0 {
		lines = append(lines, PreviewLine{Word: WordChanged, Text: fmt.Sprintf("The mains take %s's names.", target.Label), Items: renamed})
	}
	if len(moved) > 0 {
		lines = append(lines, PreviewLine{Word: WordMoved, Text: fmt.Sprintf("%s to a slot %s has free.", count(len(moved), "mix moves", "mixes move"), target.Label), Items: moved})
	}
	if len(dropped) > 0 {
		lines = append(lines, PreviewLine{Word: WordChanged, Text: fmt.Sprintf("%s has no %s; nothing routes to %s, so %s.", target.Label, strings.Join(dropped, " or "), pick(len(dropped) == 1, "it", "them"), pick(len(dropped) == 1, "it goes", "they go")), Items: dropped})
	}
	if len(fitsAgain) > 0 {
		lines = append(lines, PreviewLine{Word: WordFitsAgain, Text: fmt.Sprintf("%s that were left out fit again.", count(len(fitsAgain), "mix", "mixes")), Items: fitsAgain})
	}
	result.Lines = lines
	result.Figures = mixFigures(mixes, mapped, from, to)
	return result
}

// mixFigures is one before/after line per pool of the new desk.
func mixFigures(mixes []domain.DeskMix, mapped []MappedMix, from, to DeskSide) []Figure {
	type pool struct {
		label string
		kinds []string
	}
	var pools []pool
	if to.Model.Engine == domain.EngineX32 {
		pools = []pool{{"Buses", []string{domain.MixSubgroup, domain.MixMonitor, domain.MixFX}}}
	} else {
		pools = []pool{{"Groups", []string{domain.MixSubgroup}}, {"Mon", []string{domain.MixMonitor}}, {"FX", []string{domain.MixFX}}}
	}
	pools = append(pools, pool{"Matrices", []string{domain.MixMatrix}}, pool{"DCAs", []string{domain.MixDCA}}, pool{"Mute groups", []string{domain.MixMute}})
	capacity := func(model domain.DeskModel, kinds []string) int {
		seen := map[string]bool{}
		total := 0
		for _, kind := range kinds {
			p := model.PoolOf(kind)
			if p.Unbounded {
				return 0
			}
			if !seen[p.Name] {
				seen[p.Name] = true
				total += p.Capacity
			}
		}
		return total
	}
	var figures []Figure
	for _, p := range pools {
		before, after := 0, 0
		for _, mix := range mixes {
			if slices.Contains(p.kinds, mix.Kind) {
				before += from.Model.MixSlotWidth(mix.Kind, mix.Width)
			}
		}
		for _, m := range mapped {
			if slices.Contains(p.kinds, m.Kind) {
				after += to.Model.MixSlotWidth(m.Kind, m.ToWidth)
			}
		}
		if before == 0 && after == 0 {
			continue
		}
		figures = append(figures, Figure{Label: p.label, Before: before, BeforeCap: capacity(from.Model, p.kinds), After: after, AfterCap: capacity(to.Model, p.kinds)})
	}
	return figures
}

func pick(cond bool, a, b string) string {
	if cond {
		return a
	}
	return b
}

func routed(routes []domain.DeskRoute, mixID int64) bool {
	for _, route := range routes {
		if route.SrcKind == domain.PortMix && route.SrcID == mixID || route.DstKind == domain.PortMix && route.DstID == mixID {
			return true
		}
	}
	return false
}

func defaultMainName(model domain.DeskModel, slot int) string {
	for _, main := range model.MainSlots() {
		if main.Slot == slot {
			return main.Name
		}
	}
	return ""
}
