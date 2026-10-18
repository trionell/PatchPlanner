package domain

import "fmt"

// Mix kinds (Slice 48). A main, a subgroup (an LV1 "group"), a monitor, an FX
// send and a matrix are mixes; a DCA and a mute group are assignments that
// live in the same table because every one of them is a slot of a pool a
// route can point at.
const (
	MixMain     = "main"
	MixSubgroup = "subgroup"
	MixMonitor  = "monitor"
	MixFX       = "fx"
	MixMatrix   = "matrix"
	MixDCA      = "dca"
	MixMute     = "mute"
)

var (
	ValidMixKinds = []string{MixMain, MixSubgroup, MixMonitor, MixFX, MixMatrix, MixDCA, MixMute}
	// MixKindOrder is the order a model switch maps mixes in.
	MixKindOrder = []string{MixSubgroup, MixMonitor, MixFX, MixMatrix, MixDCA, MixMute}
)

// Route source kinds.
const (
	RouteFromChannel = "channel"
	RouteFromMix     = "mix"
)

// FedByAllowed says whether a mix kind can feed an output: never an FX send,
// a DCA or a mute group.
func (m DeskModel) FedByAllowed(kind string) bool {
	return kind == MixMain || kind == MixSubgroup || kind == MixMonitor || kind == MixMatrix
}


// DeskMix is one mix, DCA or mute group on one desk. ConsoleID is nil only for
// the groups migration 055 found on an event with no desk; the first desk
// added adopts them.
type DeskMix struct {
	ID        int64  `json:"id"`
	EventID   int64  `json:"event_id"`
	ConsoleID *int64 `json:"console_id,omitempty"`
	Kind      string `json:"kind"`
	// Slot is 1-based within the kind's pool: X32's subgroups, monitors and FX
	// share one, so Bus 7 is slot 7 whichever kind it is.
	Slot  int    `json:"slot"`
	Width string `json:"width"`
	Name  string `json:"name"`
	Color string `json:"color,omitempty"`
}

// Port kinds a desk route joins (Slice 48 D1): the `(kind, id, port)`
// convention the audio graphs use. A recorder's id is its console and its
// port the track number; a mix's port is its side (0 = L or mono, 1 = R).
const (
	PortChannel  = "channel"
	PortMix      = "mix"
	PortOutput   = "output"
	PortRecorder = "recorder"
)

// Playback modes for a route out of a recorder track.
const (
	PlaySoundcheck = "soundcheck"
	PlaySource     = "source"
)

// DeskRoute is one connection inside a desk, port to port: membership
// (channel or mix → mix), Fed by (mix or direct out → output), record
// (preamp or mix → recorder track) and playback (track → channel). No level,
// pan or tap — the desk sets those.
type DeskRoute struct {
	ID        int64  `json:"id"`
	ConsoleID int64  `json:"console_id"`
	SrcKind   string `json:"src_kind"`
	SrcID     int64  `json:"src_id"`
	SrcPort   int    `json:"src_port"`
	DstKind   string `json:"dst_kind"`
	DstID     int64  `json:"dst_id"`
	DstPort   int    `json:"dst_port"`
	Mode      string `json:"mode,omitempty"`
}

// MainSlot is one of the mains an engine always has.
type MainSlot struct {
	Slot  int    `json:"slot"`
	Name  string `json:"name"`
	Width string `json:"width"`
}

// Mains lists the mains a desk of this model always has: LR everywhere, M/C
// on X32 · M32, C and Mono on LV1 32 and up and on Generic.
func (m DeskModel) MainSlots() []MainSlot {
	lr := MainSlot{1, "LR", "stereo"}
	switch {
	case m.Engine == EngineX32:
		return []MainSlot{lr, {2, "M/C", "mono"}}
	case m.Engine == EngineLV1 && m.Strips == 16:
		return []MainSlot{{1, "L/R", "stereo"}}
	case m.Engine == EngineLV1:
		return []MainSlot{{1, "L/R", "stereo"}, {2, "C", "mono"}, {3, "Mono", "mono"}}
	default:
		return []MainSlot{lr, {2, "C", "mono"}, {3, "Mono", "mono"}}
	}
}

// Pool is which pool a kind draws its slots from on an engine, and how many
// there are. X32's subgroups, monitors and FX are one pool of buses. Generic
// has no pools: Unbounded.
type Pool struct {
	Name      string
	Capacity  int
	Unbounded bool
}

// PoolOf is the pool a mix kind takes its slot from.
func (m DeskModel) PoolOf(kind string) Pool {
	if m.Engine == EngineGeneric {
		return Pool{Name: kind, Unbounded: true}
	}
	switch kind {
	case MixSubgroup, MixMonitor, MixFX:
		if m.Engine == EngineX32 {
			return Pool{Name: "bus", Capacity: m.Buses}
		}
		switch kind {
		case MixSubgroup:
			return Pool{Name: kind, Capacity: m.Groups}
		case MixMonitor:
			return Pool{Name: kind, Capacity: m.Mon}
		default:
			return Pool{Name: kind, Capacity: m.FXAux}
		}
	case MixMatrix:
		return Pool{Name: kind, Capacity: m.Matrix}
	case MixDCA:
		return Pool{Name: kind, Capacity: m.DCA}
	case MixMute:
		return Pool{Name: kind, Capacity: m.Mute}
	}
	return Pool{Name: kind}
}

// MixSlotWidth is how many slots a mix takes. An LV1 group is always stereo
// and one slot; a DCA and a mute group are always one; Generic counts nothing.
func (m DeskModel) MixSlotWidth(kind, width string) int {
	if width != "stereo" || kind == MixDCA || kind == MixMute || kind == MixMain || m.Engine == EngineGeneric {
		return 1
	}
	if m.Engine == EngineLV1 && kind == MixSubgroup {
		return 1
	}
	return 2
}

// StereoForced reports whether the kind is stereo whatever is asked: LV1 groups.
func (m DeskModel) StereoForced(kind string) bool {
	return m.Engine == EngineLV1 && kind == MixSubgroup
}

// MatrixSourceLimit is how many sources an LV1 matrix takes; 0 is no limit.
func (m DeskModel) MatrixSourceLimit() int {
	if m.Engine == EngineLV1 {
		return 12
	}
	return 0
}

// RecorderTracks is the recorder's track count each way on a real model: the
// X32 · M32 card's 32, the LV1 SoundGrid recorder's 64. Generic types it.
func (m DeskModel) RecorderTracks() int {
	switch m.Engine {
	case EngineX32:
		return 32
	case EngineLV1:
		return 64
	}
	return 0
}

// RouteAllowed says whether a source can feed a destination on this engine
// (Slice 48 spec, "What may route to what"). srcKind is "channel" or a mix
// kind; the slots matter only for LV1's feed-forward groups.
func (m DeskModel) RouteAllowed(srcKind string, srcSlot int, dstKind string, dstSlot int) error {
	x32 := m.Engine == EngineX32
	bus := func(kind string) bool { return kind == MixSubgroup || kind == MixMonitor || kind == MixFX }
	refuse := func(why string) error { return fmt.Errorf("%s", why) }

	if srcKind == RouteFromChannel {
		switch dstKind {
		case MixMain, MixSubgroup, MixMonitor, MixFX, MixDCA, MixMute:
			return nil
		case MixMatrix:
			if x32 {
				return refuse("An X32 · M32 matrix takes buses and the mains, not channels.")
			}
			return nil
		}
		return refuse("unknown destination")
	}

	switch dstKind {
	case MixMain:
		if x32 && bus(srcKind) || !x32 && srcKind == MixSubgroup {
			return nil
		}
		return refuse("Only a group or bus can feed a main.")
	case MixSubgroup:
		if x32 {
			return refuse("An X32 · M32 bus cannot feed another bus.")
		}
		if srcKind == MixSubgroup && dstSlot > srcSlot {
			return nil
		}
		return refuse("A group feeds only the groups after it.")
	case MixMatrix:
		if srcKind == MixMain || srcKind == MixSubgroup || srcKind == MixMonitor || x32 && srcKind == MixFX {
			return nil
		}
		return refuse("That mix cannot feed a matrix.")
	case MixMute:
		if srcKind == MixMain || bus(srcKind) || srcKind == MixMatrix {
			return nil
		}
		return refuse("That cannot be in a mute group.")
	case MixDCA:
		return refuse("A DCA holds channels.")
	}
	return refuse("That mix cannot be fed.")
}

var mixNouns = map[string][2]string{
	MixSubgroup: {"subgroup", "subgroups"},
	MixMonitor:  {"monitor", "monitors"},
	MixFX:       {"FX", "FX"},
	MixMatrix:   {"matrix", "matrices"},
	MixDCA:      {"DCA", "DCAs"},
	MixMute:     {"mute group", "mute groups"},
}

// MixNoun is a kind as a refusal names it; LV1 calls a subgroup a group.
func (m DeskModel) MixNoun(kind string, n int) string {
	nouns := mixNouns[kind]
	if m.Engine == EngineLV1 && kind == MixSubgroup {
		nouns = [2]string{"group", "groups"}
	}
	if n == 1 {
		return nouns[0]
	}
	return nouns[1]
}

func (m DeskModel) mixOccupancy(pool string, mixes []DeskMix, skipID int64) map[int]bool {
	taken := map[int]bool{}
	for _, mix := range mixes {
		if mix.ID == skipID || mix.Kind == MixMain || m.PoolOf(mix.Kind).Name != pool {
			continue
		}
		for s := 0; s < m.MixSlotWidth(mix.Kind, mix.Width); s++ {
			taken[mix.Slot+s] = true
		}
	}
	return taken
}

// MixSlotFits reports whether a mix of this kind and width can sit on slot.
func (m DeskModel) MixSlotFits(kind, width string, slot int, mixes []DeskMix, skipID int64) bool {
	pool := m.PoolOf(kind)
	w := m.MixSlotWidth(kind, width)
	if slot < 1 || !pool.Unbounded && slot+w-1 > pool.Capacity {
		return false
	}
	if m.Engine == EngineX32 && w == 2 && slot%2 == 0 {
		return false
	}
	if pool.Unbounded {
		for _, mix := range mixes {
			if mix.ID != skipID && mix.Kind == kind && mix.Slot == slot {
				return false
			}
		}
		return true
	}
	taken := m.mixOccupancy(pool.Name, mixes, skipID)
	for s := 0; s < w; s++ {
		if taken[slot+s] {
			return false
		}
	}
	return true
}

// FirstFreeMixSlot is where + Mix puts a new mix: the first legal free slot.
func (m DeskModel) FirstFreeMixSlot(kind, width string, mixes []DeskMix) (int, bool) {
	pool := m.PoolOf(kind)
	limit := pool.Capacity
	if pool.Unbounded {
		limit = len(mixes) + 2
	}
	for slot := 1; slot <= limit; slot++ {
		if m.MixSlotFits(kind, width, slot, mixes, 0) {
			return slot, true
		}
	}
	return 0, false
}

// FullPoolRefusal is what + Mix says when a pool has no legal slot left, or
// the model has no such pool. On X32 · M32 it says how the 16 buses are spent.
func (m DeskModel) FullPoolRefusal(deskName, kind string, mixes []DeskMix) string {
	desk := DeskLabel(deskName, m)
	pool := m.PoolOf(kind)
	if pool.Capacity == 0 {
		return fmt.Sprintf("%s has no %s.", m.Label, m.MixNoun(kind, 2))
	}
	if pool.Name == "bus" {
		counts := map[string]int{}
		for _, mix := range mixes {
			if m.PoolOf(mix.Kind).Name == "bus" {
				counts[mix.Kind]++
			}
		}
		return fmt.Sprintf("%s has no free bus for a %s: %d %s · %d %s · %d %s.", desk, m.MixNoun(kind, 1),
			counts[MixSubgroup], m.MixNoun(MixSubgroup, counts[MixSubgroup]),
			counts[MixMonitor], m.MixNoun(MixMonitor, counts[MixMonitor]),
			counts[MixFX], m.MixNoun(MixFX, counts[MixFX]))
	}
	return fmt.Sprintf("%s's %d %s are taken.", desk, pool.Capacity, m.MixNoun(kind, pool.Capacity))
}
