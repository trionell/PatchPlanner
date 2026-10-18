package service

import (
	"fmt"
	"strings"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

func side(t *testing.T, key string, inputs int) DeskSide {
	t.Helper()
	m, ok := domain.LookupDeskModel(key)
	if !ok {
		t.Fatalf("no model %s", key)
	}
	if m.Engine == domain.EngineGeneric {
		return DeskSide{Model: m, Inputs: inputs}
	}
	return DeskSide{Model: m, Inputs: m.Strips, LocalIn: m.LocalIn, LocalOut: m.LocalOut}
}

func ch(id int64, n int, width, name string) domain.StripRow {
	return domain.StripRow{ID: id, Number: n, Width: width, MixerBehavior: "stereo_channel", Pool: domain.PoolChannel, Name: name}
}

func monoRun(from, to int) []domain.StripRow {
	var rows []domain.StripRow
	for n := from; n <= to; n++ {
		rows = append(rows, ch(int64(n), n, "mono", fmt.Sprintf("Ch%d", n)))
	}
	return rows
}

func rowByID(t *testing.T, m Mapping, id int64) MappedRow {
	t.Helper()
	for _, row := range m.Rows {
		if row.ID == id {
			return row
		}
	}
	t.Fatalf("row %d not mapped", id)
	return MappedRow{}
}

func line(m Mapping, word, contains string) *PreviewLine {
	for i, l := range m.Lines {
		if l.Word == word && strings.Contains(l.Text, contains) {
			return &m.Lines[i]
		}
	}
	return nil
}

// The real wedding: a Generic "M23R" with stereo Piano on 7 and Trumpet on 8,
// switched to the M32R it is.
func TestMapRowsWeddingToM32R(t *testing.T) {
	rows := append(monoRun(1, 6),
		ch(7, 7, "stereo", "Piano"),
		ch(8, 8, "mono", "Trumpet"),
		ch(9, 9, "mono", "Host"),
	)
	m := MapRows(rows, LocalUse{}, side(t, "generic", 32), side(t, "m32r", 0))

	if piano := rowByID(t, m, 7); piano.ToNumber != 7 || piano.ToWidth != 2 || piano.MixerBehavior != "linked_channels" {
		t.Errorf("Piano = %+v, want 7–8 linked", piano)
	}
	if trumpet := rowByID(t, m, 8); trumpet.ToNumber != 9 {
		t.Errorf("Trumpet on %d, want 9", trumpet.ToNumber)
	}
	if host := rowByID(t, m, 9); host.ToNumber != 10 {
		t.Errorf("Host on %d, want 10", host.ToNumber)
	}
	if l := line(m, WordMoved, "2 channels move"); l == nil || l.Items[0] != "Trumpet 8 → 9" {
		t.Errorf("Moved line = %+v, lines %+v", l, m.Lines)
	}
	if line(m, WordChanged, "1 stereo channel becomes a linked pair") == nil {
		t.Errorf("no Changed line for Piano: %+v", m.Lines)
	}
	if line(m, WordChanged, "typed counts are replaced") == nil {
		t.Errorf("Generic with typed counts → M32R must say the counts are replaced: %+v", m.Lines)
	}
}

func TestMapRowsOverflowOntoX32NeverFillsAux(t *testing.T) {
	m := MapRows(monoRun(1, 40), LocalUse{}, side(t, "lv1_64", 0), side(t, "m32", 0))
	over := 0
	for _, row := range m.Rows {
		if row.ToPool == domain.PoolAux {
			t.Fatalf("row %d put on aux", row.ID)
		}
		if row.Over {
			over++
			if row.ToNumber <= 32 {
				t.Errorf("over row %d kept on strip %d", row.ID, row.ToNumber)
			}
		}
	}
	if over != 8 {
		t.Errorf("%d rows over, want 8", over)
	}
	if l := line(m, WordLeftOut, "8 channels past strip 32"); l == nil {
		t.Errorf("no Left out line: %+v", m.Lines)
	}
}

func TestMapRowsAuxOntoLV1(t *testing.T) {
	rows := append(monoRun(1, 29),
		domain.StripRow{ID: 101, Number: 1, Width: "stereo", MixerBehavior: "linked_channels", Pool: domain.PoolAux, Name: "Dator L/R"},
		domain.StripRow{ID: 107, Number: 7, Width: "stereo", MixerBehavior: "linked_channels", Pool: domain.PoolAux, Name: "Pausmusik L/R"},
	)
	m := MapRows(rows, LocalUse{}, side(t, "m32l", 0), side(t, "lv1_64", 0))
	if r := rowByID(t, m, 101); r.ToPool != domain.PoolChannel || r.ToNumber != 30 || r.ToWidth != 1 {
		t.Errorf("Dator = %+v, want strip 30", r)
	}
	if r := rowByID(t, m, 107); r.ToNumber != 31 {
		t.Errorf("Pausmusik on %d, want 31", r.ToNumber)
	}
	if l := line(m, WordMoved, "2 aux inputs move onto strips"); l == nil || l.Items[0] != "Dator L/R Aux 1–2 → 30" {
		t.Errorf("aux Moved line = %+v", l)
	}
}

func TestMapRowsX32ToX32KeepsAuxAndReportsJacks(t *testing.T) {
	rows := []domain.StripRow{
		ch(1, 1, "mono", "Kick"),
		{ID: 2, Number: 3, Width: "mono", Pool: domain.PoolAux, Name: "Laptop"},
	}
	jacks := LocalUse{Inputs: []JackUse{{Port: 0, Label: "Kick"}, {Port: 19, Label: "Spare"}}}
	m := MapRows(rows, jacks, side(t, "x32", 0), side(t, "x32c", 0))
	if r := rowByID(t, m, 2); r.ToPool != domain.PoolAux || r.ToNumber != 3 {
		t.Errorf("aux row = %+v, want Aux 3", r)
	}
	if l := line(m, WordLeftOut, "local input past X32 Compact's 16"); l == nil || l.Items[0] != "20 · Spare" {
		t.Errorf("jack line = %+v, lines %+v", l, m.Lines)
	}
}

func TestMapRowsRoundTripMovesNothingBack(t *testing.T) {
	rows := []domain.StripRow{ch(1, 1, "mono", "A"), ch(2, 2, "stereo", "B"), ch(3, 3, "mono", "C")}
	there := MapRows(rows, LocalUse{}, side(t, "lv1_64", 0), side(t, "m32", 0))
	var back []domain.StripRow
	for _, r := range there.Rows {
		back = append(back, domain.StripRow{ID: r.ID, Number: r.ToNumber, Width: rows[r.ID-1].Width, MixerBehavior: r.MixerBehavior, Pool: r.ToPool, Name: r.Name})
	}
	again := MapRows(back, LocalUse{}, side(t, "m32", 0), side(t, "lv1_64", 0))
	for _, r := range again.Rows {
		if r.ToNumber != r.FromNumber {
			t.Errorf("row %d moved %d → %d on the way back", r.ID, r.FromNumber, r.ToNumber)
		}
	}
	if line(again, WordMoved, "") != nil {
		t.Errorf("Moved line on the way back: %+v", again.Lines)
	}
}

func TestMapRowsFitsAgainAndLongNames(t *testing.T) {
	rows := append(monoRun(1, 32), ch(33, 33, "mono", "Ambience long name"))
	m := MapRows(rows, LocalUse{}, side(t, "m32", 0), side(t, "lv1_64", 0))
	if r := rowByID(t, m, 33); r.Over || !r.WasOver {
		t.Errorf("row 33 = %+v, want fits again", r)
	}
	if line(m, WordFitsAgain, "1 channel") == nil {
		t.Errorf("no Fits again line: %+v", m.Lines)
	}
	back := MapRows(rows, LocalUse{}, side(t, "lv1_64", 0), side(t, "m32", 0))
	if l := line(back, WordChanged, "longer than M32 shows (12)"); l == nil || l.Items[0] != "Ambience long name" {
		t.Errorf("long-name line = %+v", l)
	}
}

func TestMapRowsKeepsOrder(t *testing.T) {
	rows := []domain.StripRow{ch(1, 2, "stereo", "A"), ch(2, 3, "mono", "B"), ch(3, 4, "mono", "C")}
	m := MapRows(rows, LocalUse{}, side(t, "generic", 0), side(t, "x32", 0))
	last := 0
	for _, r := range m.Rows {
		if r.ToNumber <= last {
			t.Errorf("row %d placed on %d, ahead of a row above it (last %d)", r.ID, r.ToNumber, last)
		}
		last = r.ToNumber + r.ToWidth - 1
	}
	if a := rowByID(t, m, 1); a.ToNumber != 3 {
		t.Errorf("stereo A from 2 → %d, want 3–4", a.ToNumber)
	}
}

func TestPlaceRows(t *testing.T) {
	to := side(t, "lv1_64", 0)
	existing := monoRun(1, 5)
	free := PlaceRows(existing, []domain.StripRow{ch(33, 33, "mono", "X"), ch(34, 34, "mono", "Y")}, to)
	if len(free.Lines) != 0 {
		t.Errorf("free placing has lines: %+v", free.Lines)
	}
	existingGap := append(monoRun(2, 5), ch(9, 9, "mono", "x"))
	taken := PlaceRows(existingGap, []domain.StripRow{ch(50, 5, "mono", "Z")}, to)
	if r := rowByID(t, taken, 50); r.ToNumber != 1 {
		t.Errorf("Z on %d, want the lowest free strip, 1", r.ToNumber)
	}
	if line(taken, WordMoved, "1 channel moves") == nil {
		t.Errorf("no Moved line: %+v", taken.Lines)
	}
	full := PlaceRows(monoRun(1, 64), []domain.StripRow{ch(99, 3, "mono", "Q")}, to)
	if r := rowByID(t, full, 99); !r.Over || r.ToNumber != 65 {
		t.Errorf("Q = %+v, want over on 65", r)
	}
	aux := PlaceRows(nil, []domain.StripRow{{ID: 7, Number: 2, Width: "mono", Pool: domain.PoolAux, Name: "A"}}, side(t, "m32", 0))
	if r := rowByID(t, aux, 7); r.ToPool != domain.PoolChannel {
		t.Errorf("placing put a row on aux: %+v", r)
	}
}

// A row past the end moves up into room after the row above it rather than
// being left out of a desk with space for it.
func TestMapRowsCompactsIntoRoom(t *testing.T) {
	rows := []domain.StripRow{ch(1, 1, "mono", "A"), ch(2, 2, "mono", "B"), ch(3, 40, "mono", "C")}
	m := MapRows(rows, LocalUse{}, side(t, "generic", 48), side(t, "x32", 0))
	if r := rowByID(t, m, 3); r.Over || r.ToNumber != 3 {
		t.Errorf("C = %+v, want strip 3", r)
	}
	if line(m, WordLeftOut, "") != nil {
		t.Errorf("Left out on a desk with room: %+v", m.Lines)
	}
}

func dmix(id int64, kind string, slot int, width, name string) domain.DeskMix {
	console := int64(1)
	return domain.DeskMix{ID: id, ConsoleID: &console, Kind: kind, Slot: slot, Width: width, Name: name}
}

func mixRow(t *testing.T, m MixMapping, id int64) MappedMix {
	t.Helper()
	for _, mix := range m.Mixes {
		if mix.ID == id {
			return mix
		}
	}
	t.Fatalf("mix %d not mapped", id)
	return MappedMix{}
}

func mixLine(m MixMapping, word, contains string) bool {
	for _, l := range m.Lines {
		if l.Word == word && strings.Contains(l.Text, contains) {
			return true
		}
	}
	return false
}

func TestMapMixesM32ToLV1(t *testing.T) {
	mixes := []domain.DeskMix{
		dmix(1, "main", 1, "stereo", "LR"), dmix(2, "main", 2, "mono", "M/C"),
		dmix(10, "subgroup", 1, "mono", "Drums"), dmix(11, "monitor", 2, "stereo", "IEM"),
	}
	routes := []domain.DeskRoute{{SrcKind: "mix", SrcID: 10, DstKind: "mix", DstID: 1}}
	m := MapMixes(mixes, routes, side(t, "m32", 0), side(t, "lv1_64", 0), false, 0)
	if g := mixRow(t, m, 10); g.ToWidth != "stereo" {
		t.Errorf("an LV1 group is stereo: %+v", g)
	}
	if c := mixRow(t, m, 2); c.ToName != "C" {
		t.Errorf("M/C → %q, want C", c.ToName)
	}
	if !mixLine(m, WordChanged, "change width") || !mixLine(m, WordChanged, "names") {
		t.Errorf("Changed lines: %+v", m.Lines)
	}
}

func TestMapMixesKeepsAPlannersMainName(t *testing.T) {
	mixes := []domain.DeskMix{dmix(1, "main", 1, "stereo", "PA"), dmix(2, "main", 2, "mono", "C")}
	m := MapMixes(mixes, nil, side(t, "lv1_64", 0), side(t, "m32", 0), false, 0)
	if lr := mixRow(t, m, 1); lr.ToName != "PA" {
		t.Errorf("a renamed main became %q", lr.ToName)
	}
	if mc := mixRow(t, m, 2); mc.ToName != "M/C" {
		t.Errorf("C → %q, want M/C", mc.ToName)
	}
}

func TestMapMixesRoundTripAndFitsAgain(t *testing.T) {
	var mixes []domain.DeskMix
	for i := 1; i <= 20; i++ {
		mixes = append(mixes, dmix(int64(i), "monitor", i, "mono", fmt.Sprintf("Mon %d", i)))
	}
	monitors := side(t, "lv1_80", 0)
	monitors.Model = monitors.Model.WithBusMode(domain.BusModeMonitors)
	there := MapMixes(mixes, nil, monitors, side(t, "m32", 0), false, 0)
	over := 0
	var back []domain.DeskMix
	for _, m := range there.Mixes {
		if m.Over {
			over++
		}
		back = append(back, dmix(m.ID, m.Kind, m.ToSlot, m.ToWidth, m.Name))
	}
	if over != 4 {
		t.Errorf("%d of 20 monitors over 16 buses, want 4", over)
	}
	again := MapMixes(back, nil, side(t, "m32", 0), monitors, false, 0)
	for _, m := range again.Mixes {
		if m.ToSlot != m.FromSlot {
			t.Errorf("mix %d moved %d → %d on the way back", m.ID, m.FromSlot, m.ToSlot)
		}
	}
	if !mixLine(again, WordFitsAgain, "4 mixes") {
		t.Errorf("no Fits again: %+v", again.Lines)
	}
}

func TestMapMixesFedByAndRecorder(t *testing.T) {
	mixes := []domain.DeskMix{dmix(1, "main", 1, "stereo", "LR"), dmix(5, "fx", 1, "mono", "Verb")}
	routes := []domain.DeskRoute{
		{SrcKind: "mix", SrcID: 5, DstKind: "output", DstID: 9},                    // an FX send feeding an output
		{SrcKind: "channel", SrcID: 3, DstKind: "recorder", DstID: 1, DstPort: 40}, // past the card
	}
	m := MapMixes(mixes, routes, side(t, "lv1_64", 0), side(t, "m32", 0), true, 64)
	if m.RecorderTracks != 32 {
		t.Errorf("recorder tracks %d, want the card's 32", m.RecorderTracks)
	}
	if !mixLine(m, WordLeftOut, "cannot send to an output") {
		t.Errorf("FX Fed by not Left out: %+v", m.Lines)
	}
	if !mixLine(m, WordLeftOut, "recorder route") {
		t.Errorf("track 40 not Left out: %+v", m.Lines)
	}
}

func TestMapMixesKeepsSlotOrder(t *testing.T) {
	// Buses taken by subgroups first; monitors keep their slots where free.
	mixes := []domain.DeskMix{dmix(1, "subgroup", 1, "mono", "A"), dmix(2, "monitor", 1, "mono", "B"), dmix(3, "monitor", 3, "mono", "C")}
	m := MapMixes(mixes, nil, side(t, "lv1_64", 0), side(t, "x32", 0), false, 0)
	if b, c := mixRow(t, m, 2), mixRow(t, m, 3); b.ToSlot != 2 || c.ToSlot != 3 {
		t.Errorf("monitors on %d and %d, want 2 (next free) and 3 (kept)", b.ToSlot, c.ToSlot)
	}
}
