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
	taken := PlaceRows(existing, []domain.StripRow{ch(50, 5, "mono", "Z")}, to)
	if r := rowByID(t, taken, 50); r.ToNumber != 6 {
		t.Errorf("Z on %d, want 6", r.ToNumber)
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
