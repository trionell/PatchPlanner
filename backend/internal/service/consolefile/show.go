// Package consolefile writes one desk of an event as a file the console loads
// (Slice 49): an X32 · M32 scene or an LV1 session. Each writer starts from a
// template embedded in the binary and replaces only what PatchPlanner owns, so
// everything else is the console's factory default.
package consolefile

// Show is one desk, slot-numbered and engine-ready: what the writers write.
// The service builds it from the audio patch and the desk's routing; nothing
// here reads the database, so a writer is tested from a literal Show.
type Show struct {
	EventName string
	DeskName  string
	Engine    string // "x32" or "lv1"

	Strips  []Strip
	Mixes   []Mix
	Routes  []Route
	Outputs []Output
	Tracks  []Track
	// RecorderTracks is the recorder's size each way; 0 when the desk has none.
	RecorderTracks int
}

// Strip is one channel or (X32) aux input as the desk numbers it.
type Strip struct {
	ID     int64
	Aux    bool
	Number int // 1-based within its pool
	Stereo bool
	Name   string
	Color  string // a channel_colors hex, "" for none
	// Input is the desk input feeding it, nil when nothing is patched.
	Input *DeskPort
	// InputR is a stereo strip's right input; a linked pair's second strip on X32.
	InputR  *DeskPort
	Phantom bool
}

// Mix is one mix, DCA or mute group in its desk slot.
type Mix struct {
	ID     int64
	Kind   string // main | subgroup | monitor | fx | matrix | dca | mute
	Slot   int
	Stereo bool
	Name   string
	Color  string
}

// Route is a membership or a send: a strip or a mix feeding a mix.
type Route struct {
	FromStrip int64 // a Strip.ID, or 0
	FromMix   int64 // a Mix.ID, or 0
	ToMix     int64
}

// Output is one output the desk patches, and what plays through it.
type Output struct {
	ID     int64
	Name   string
	Stereo bool
	// Port is where it leaves the desk, nil when it is not patched.
	Port *DeskPort
	// PortR is a stereo output's right socket.
	PortR *DeskPort
	// FedByMix / FedBySide (0 L or mono, 1 R) or FedByStrip (a direct out).
	FedByMix   int64
	FedBySide  int
	FedByStrip int64
}

// Track is one recorder track's record source and playback target.
type Track struct {
	Number     int
	FromStrip  int64 // the strip whose preamp it records
	FromMix    int64
	FromSide   int
	PlayStrip  int64
	Soundcheck bool
}

// DeskPort is a socket of the desk's I/O, already resolved through the export
// dialog's port map: for X32 · M32 a socket group and a 0-based index on it; for
// LV1 an I/O bank and slot, the device port, and the device's model.
type DeskPort struct {
	Socket string // x32: local | a | b | card; lv1: device
	Index  int
	Bank   int
	Slot   int
	Device string // SG4000 | SG1000 | Classic | Other
}

// Notice is one line of the export preview, in A3/B1's words.
type Notice struct {
	Word  string   `json:"word"`
	Text  string   `json:"text"`
	Items []string `json:"items,omitempty"`
}

// Preview words.
const (
	LeftOut = "Left out"
	Changed = "Changed"
	NoInput = "No input"
	NoPort  = "No port"
)
