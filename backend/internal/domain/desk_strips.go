package domain

import (
	"fmt"
	"sort"
)

// StripRow is a channel as the strip rules see it: where it sits and how wide
// it is. Name is only for the refusal that says whose strip is taken.
type StripRow struct {
	ID            int64
	Number        int
	Width         string
	MixerBehavior string
	Pool          string
	Name          string
}

// StripFix is the one-click repair a refusal offers ("Use 5–6").
type StripFix struct {
	Number int    `json:"number"`
	Pool   string `json:"pool"`
}

// StripRefusal is why a channel cannot sit where it was asked to.
type StripRefusal struct {
	Message string    `json:"error"`
	Fix     *StripFix `json:"fix,omitempty"`
}

func (r *StripRefusal) Error() string { return r.Message }

// DeskLabel is how a refusal names a desk: "FOH · M32 Live".
func DeskLabel(name string, model DeskModel) string {
	if name == "" {
		name = "Console"
	}
	if model.Engine == EngineGeneric {
		return name
	}
	return name + " · " + model.Label
}

func poolNoun(pool string, model DeskModel, n int) string {
	if pool == PoolAux {
		if n == 1 {
			return "aux input"
		}
		return "aux inputs"
	}
	if model.Engine == EngineX32 {
		if n == 1 {
			return "channel"
		}
		return "channels"
	}
	if n == 1 {
		return "strip"
	}
	return "strips"
}

// StripLabel is a strip as the sheet prints it: "7", "7–8", "Aux 3", "Aux 1–2".
func StripLabel(pool string, number, width int) string {
	label := fmt.Sprintf("%d", number)
	if width == 2 {
		label = fmt.Sprintf("%d–%d", number, number+1)
	}
	if pool == PoolAux {
		return "Aux " + label
	}
	return "Ch " + label
}

// occupancy maps each strip of a pool to the row on it.
func occupancy(model DeskModel, pool string, others []StripRow, skipID int64) map[int]StripRow {
	taken := map[int]StripRow{}
	for _, other := range others {
		if other.ID == skipID || other.Pool != pool {
			continue
		}
		for s := 0; s < model.StripWidth(other.Width, other.MixerBehavior); s++ {
			taken[other.Number+s] = other
		}
	}
	return taken
}

func fits(model DeskModel, capacity, number, width int, taken map[int]StripRow) bool {
	if number < 1 || number+width-1 > capacity {
		return false
	}
	if model.Engine == EngineX32 && width == 2 && number%2 == 0 {
		return false
	}
	for s := 0; s < width; s++ {
		if _, ok := taken[number+s]; ok {
			return false
		}
	}
	return true
}

func lowestFree(model DeskModel, capacity, width int, taken map[int]StripRow, from int) (int, bool) {
	if from < 1 {
		from = 1
	}
	for n := from; n <= capacity; n++ {
		if fits(model, capacity, n, width, taken) {
			return n, true
		}
	}
	for n := 1; n < from && n <= capacity; n++ {
		if fits(model, capacity, n, width, taken) {
			return n, true
		}
	}
	return 0, false
}

// CheckStrip refuses a channel that a real model cannot hold where it was put:
// past the pool's last strip, on another channel's strip, an aux row on a
// desk without aux, or (X32 · M32) a stereo channel starting on an even
// number. Generic refuses nothing — it warns, as it always has.
func CheckStrip(deskName string, model DeskModel, row StripRow, others []StripRow) *StripRefusal {
	if model.Engine == EngineGeneric {
		return nil
	}
	desk := DeskLabel(deskName, model)
	if row.Pool == PoolAux && model.AuxIn == 0 {
		return &StripRefusal{Message: desk + " has no aux inputs."}
	}
	capacity := model.PoolCapacity(row.Pool, 0)
	width := model.StripWidth(row.Width, row.MixerBehavior)
	taken := occupancy(model, row.Pool, others, row.ID)
	fix := func(from int) *StripFix {
		if n, ok := lowestFree(model, capacity, width, taken, from); ok {
			return &StripFix{Number: n, Pool: row.Pool}
		}
		return nil
	}

	if row.Number < 1 {
		return &StripRefusal{Message: fmt.Sprintf("%s starts at 1.", desk), Fix: fix(1)}
	}
	if model.Engine == EngineX32 && width == 2 && row.Number%2 == 0 {
		noun := "channel"
		if row.Pool == PoolAux {
			noun = "aux input"
		}
		return &StripRefusal{
			Message: fmt.Sprintf("On %s a stereo %s starts on an odd number.", desk, noun),
			Fix:     fix(row.Number - 1),
		}
	}
	if row.Number+width-1 > capacity {
		label := StripLabel(row.Pool, row.Number, 1)
		if row.Number <= capacity {
			label = StripLabel(row.Pool, row.Number, width)
		}
		return &StripRefusal{
			Message: fmt.Sprintf("%s is past %s's %d %s.", label, model.Label, capacity, poolNoun(row.Pool, model, capacity)),
			Fix:     fix(1),
		}
	}
	for s := 0; s < width; s++ {
		if other, ok := taken[row.Number+s]; ok {
			whose := "an unnamed channel's"
			if other.Name != "" {
				whose = other.Name + "'s"
			}
			return &StripRefusal{Message: fmt.Sprintf("%s is %s.", StripLabel(row.Pool, row.Number+s, 1), whose), Fix: fix(row.Number)}
		}
	}
	return nil
}

// FullRefusal is what adding to a pool with no legal strip left says.
func FullRefusal(deskName string, model DeskModel, pool string, others []StripRow) *StripRefusal {
	desk := DeskLabel(deskName, model)
	capacity := model.PoolCapacity(pool, 0)
	if pool == PoolChannel && model.AuxIn > 0 {
		free := model.AuxIn - len(occupancy(model, PoolAux, others, 0))
		if free > 0 {
			return &StripRefusal{Message: fmt.Sprintf("%s's %d channels are taken. Free a channel, or move one to the aux section from its editor.", desk, capacity)}
		}
		return &StripRefusal{Message: fmt.Sprintf("%s is full. All %d channels and %d aux inputs are taken.", desk, capacity, model.AuxIn)}
	}
	return &StripRefusal{Message: fmt.Sprintf("%s is full. All %d %s are taken.", desk, capacity, poolNoun(pool, model, capacity))}
}

// SuggestNumber is where + Channel puts a new channel: the strip after the
// last one used in its pool; past the end, the lowest free strip; a stereo
// channel on X32 · M32 the next free odd number. ok is false when the pool
// has no legal strip left. Generic keeps today's rule — after the highest.
func SuggestNumber(model DeskModel, pool, width, mixerBehavior string, others []StripRow) (int, bool) {
	w := model.StripWidth(width, mixerBehavior)
	if model.Engine == EngineGeneric {
		highest := 0
		for _, other := range others {
			if top := other.Number + model.StripWidth(other.Width, other.MixerBehavior) - 1; top > highest {
				highest = top
			}
		}
		return highest + 1, true
	}
	capacity := model.PoolCapacity(pool, 0)
	taken := occupancy(model, pool, others, 0)
	last := 0
	for strip := range taken {
		if strip > last {
			last = strip
		}
	}
	return lowestFree(model, capacity, w, taken, last+1)
}

// SortStripRows orders rows as the desk lays them out: channels before aux,
// then by number, then by id.
func SortStripRows(rows []StripRow) {
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].Pool != rows[j].Pool {
			return rows[i].Pool == PoolChannel
		}
		if rows[i].Number != rows[j].Number {
			return rows[i].Number < rows[j].Number
		}
		return rows[i].ID < rows[j].ID
	})
}

// JackUse is one local jack that carries a cable, and the row it serves —
// what a switch to a desk with fewer jacks has to say it leaves out.
type JackUse struct {
	Port  int // zero-based, as stored
	Label string
}

// LocalUse is a desk's patched local jacks.
type LocalUse struct {
	Inputs  []JackUse
	Outputs []JackUse
}
