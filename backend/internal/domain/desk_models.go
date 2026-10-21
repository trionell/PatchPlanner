package domain

// Desk engines. Behaviour branches on the engine, never on the model: the
// seventeen models are three code paths with different counts (Slice 47).
const (
	EngineX32     = "x32"
	EngineLV1     = "lv1"
	EngineGeneric = "generic"
)

// Stereo styles. On X32 · M32 a stereo channel is a linked odd–even pair of
// strips; on LV1 it is one stereo strip; Generic keeps each row's stored
// mixer_behavior.
const (
	StereoLinked = "linked"
	StereoStrip  = "strip"
	StereoAsIs   = "asis"
)

// Strip pools a channel can sit on. Only X32 · M32 has aux; every other
// engine has the channel pool alone.
const (
	PoolChannel = "channel"
	PoolAux     = "aux"
)

// LV1 80's two bus modes (Slice 47). The mode changes only the group and Mon
// pools; it is stored on the console as "" for every other model.
const (
	BusModeGroups   = "groups"
	BusModeMonitors = "monitors"
)

var (
	ValidStripPools = []string{PoolChannel, PoolAux}
	ValidBusModes   = []string{BusModeGroups, BusModeMonitors}
)

// DeskModel is one entry of the in-code model list: what a console of that
// model is, read rather than typed. A zero count on Generic means "typed on
// the console", not "none" — Generic's figures are the console's own.
type DeskModel struct {
	Key    string `json:"key"`
	Family string `json:"family"`
	Label  string `json:"label"`
	// Sub qualifies the label in the picker ("with Expansion").
	Sub    string `json:"sub,omitempty"`
	Engine string `json:"engine"`
	Stereo string `json:"stereo"`

	Strips int `json:"strips"`
	// AuxIn is the aux strip pool; AuxSockets the rear aux in jacks that can
	// feed it or any channel (D9). Strips 7–8 are USB-fed and have no socket.
	AuxIn      int `json:"aux_in"`
	AuxSockets int `json:"aux_sockets"`
	LocalIn    int `json:"local_in"`
	LocalOut   int `json:"local_out"`

	// Mix pools, stored and shown here; checked by Slice 48. X32 · M32 spends
	// its Buses on subgroups, monitors and FX alike; LV1 has a pool per type.
	Buses  int    `json:"buses"`
	Groups int    `json:"groups"`
	Mon    int    `json:"mon"`
	FXAux  int    `json:"fx_aux"`
	Matrix int    `json:"matrix"`
	DCA    int    `json:"dca"`
	Mute   int    `json:"mute"`
	FXRet  int    `json:"fx_returns"`
	Mains  string `json:"mains"`

	// NameLength is how many characters the desk shows; 0 means no limit
	// is known. A longer name is kept whole and cut only by the export.
	NameLength int `json:"name_length"`
	Colours    int `json:"colours"`
	// HasBusModes marks LV1 80 and LV1 Classic 80, whose group and Mon pools
	// come from the console's bus mode.
	HasBusModes bool `json:"has_bus_modes"`
}

// BusModePools is what each LV1 80 bus mode gives.
var BusModePools = map[string]struct{ Groups, Mon int }{
	BusModeGroups:   {16, 16},
	BusModeMonitors: {8, 24},
}

func x32(key, family, label string, localIn, localOut int) DeskModel {
	// Every model with a jack panel has aux in 1–6; Core and M32C have no
	// analogue I/O. Retailer spec sheets, not the manuals (D9).
	auxSockets := 0
	if localIn > 0 {
		auxSockets = 6
	}
	return DeskModel{
		Key: key, Family: family, Label: label, Engine: EngineX32, Stereo: StereoLinked,
		Strips: 32, AuxIn: 8, AuxSockets: auxSockets, LocalIn: localIn, LocalOut: localOut,
		Buses: 16, Matrix: 6, DCA: 8, Mute: 6, FXRet: 8, Mains: "LR + M/C",
		NameLength: 12, Colours: 8,
	}
}

func lv1(key, family, label string, strips, groups, mon int, localIn, localOut int) DeskModel {
	mains := "L/R/C/Mono"
	if strips == 16 {
		mains = "L/R"
	}
	return DeskModel{
		Key: key, Family: family, Label: label, Engine: EngineLV1, Stereo: StereoStrip,
		Strips: strips, LocalIn: localIn, LocalOut: localOut,
		Groups: groups, Mon: mon, FXAux: 8, Matrix: 8, DCA: 16, Mute: 8, Mains: mains,
		Colours: 32,
	}
}

func lv1Expanded(m DeskModel) DeskModel {
	m.Sub = "with Expansion"
	m.HasBusModes = true
	return m
}

// DeskModels is the model list in picker order (families grouped). Values
// marked unverified in the Slice 47 mockup — X32 Core's local jacks — feed no
// check but the local jack panel.
var DeskModels = []DeskModel{
	x32("x32", "Behringer X32", "X32", 32, 16),
	x32("x32c", "Behringer X32", "X32 Compact", 16, 8),
	x32("x32p", "Behringer X32", "X32 Producer", 16, 8),
	x32("x32r", "Behringer X32", "X32 Rack", 16, 8),
	x32("x32core", "Behringer X32", "X32 Core", 0, 0),
	x32("m32", "Midas M32", "M32", 32, 16),
	x32("m32l", "Midas M32", "M32 Live", 32, 16),
	x32("m32r", "Midas M32", "M32R", 16, 8),
	x32("m32rl", "Midas M32", "M32R Live", 16, 8),
	x32("m32c", "Midas M32", "M32C", 0, 0),
	lv1("lv1_16", "Waves LV1 · software", "LV1 16", 16, 0, 0, 0, 0),
	lv1("lv1_32", "Waves LV1 · software", "LV1 32", 32, 8, 16, 0, 0),
	lv1("lv1_64", "Waves LV1 · software", "LV1 64", 64, 8, 16, 0, 0),
	lv1Expanded(lv1("lv1_80", "Waves LV1 · software", "LV1 80", 80, 16, 16, 0, 0)),
	lv1("lv1c_64", "Waves LV1 Classic", "LV1 Classic 64", 64, 8, 16, 18, 16),
	lv1Expanded(lv1("lv1c_80", "Waves LV1 Classic", "LV1 Classic 80", 80, 16, 16, 18, 16)),
	{Key: DeskModelGeneric, Family: "Generic", Label: "Generic", Engine: EngineGeneric, Stereo: StereoAsIs},
}

// DeskModelGeneric is what every console migrated by 054 is.
const DeskModelGeneric = "generic"

// LookupDeskModel returns the model with this key.
func LookupDeskModel(key string) (DeskModel, bool) {
	for _, m := range DeskModels {
		if m.Key == key {
			return m, true
		}
	}
	return DeskModel{}, false
}

// WithBusMode applies an LV1 80 bus mode to the model's pools. Any other
// model, or an empty mode, is returned unchanged.
func (m DeskModel) WithBusMode(mode string) DeskModel {
	if !m.HasBusModes {
		return m
	}
	if pools, ok := BusModePools[mode]; ok {
		m.Groups, m.Mon = pools.Groups, pools.Mon
	}
	return m
}

// PoolCapacity is how many strips a pool of this model holds. Generic
// returns the console's typed input count for the channel pool (0 =
// undeclared), and no aux pool.
func (m DeskModel) PoolCapacity(pool string, typedInputs int) int {
	switch {
	case m.Engine == EngineGeneric && pool == PoolChannel:
		return typedInputs
	case pool == PoolAux:
		return m.AuxIn
	default:
		return m.Strips
	}
}

// StripWidth is how many strips a channel of this width takes on the engine.
// Generic follows the row's own mixer_behavior, as the sheet always has.
func (m DeskModel) StripWidth(width, mixerBehavior string) int {
	if width != "stereo" {
		return 1
	}
	switch m.Engine {
	case EngineX32:
		return 2
	case EngineLV1:
		return 1
	default:
		if mixerBehavior == "linked_channels" {
			return 2
		}
		return 1
	}
}

// ForcedMixerBehavior is the mixer_behavior a real model imposes, or "" when
// the row keeps its own (Generic).
func (m DeskModel) ForcedMixerBehavior() string {
	switch m.Engine {
	case EngineX32:
		return "linked_channels"
	case EngineLV1:
		return "stereo_channel"
	}
	return ""
}

// DefaultBusMode is a new console's bus mode: Monitors mode for a monitor
// desk on an LV1 80, Groups mode otherwise, "" for every other model.
func (m DeskModel) DefaultBusMode(role string) string {
	if !m.HasBusModes {
		return ""
	}
	if role == "monitor" {
		return BusModeMonitors
	}
	return BusModeGroups
}
