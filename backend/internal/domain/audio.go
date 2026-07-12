package domain

type Stagebox struct {
	ID              int64  `json:"id"`
	EventID         int64  `json:"event_id"`
	Name            string `json:"name"`
	Model           string `json:"model,omitempty"`
	InputCount      int    `json:"input_count"`
	OutputCount     int    `json:"output_count"`
	ConnectionType  string `json:"connection_type"`
	InventoryItemID *int64 `json:"inventory_item_id,omitempty"`
	// PositionX/PositionY are this event's canvas placement in the
	// output signal-flow graph's Processing zone (Slice 11 follow-up) —
	// a stagebox is a full pass-through node there: its existing
	// OutputCount sizes both an input side (a channel routes into a
	// specific jack — pure console routing, never a physical cable, the
	// mixer-to-stagebox network link itself is out of scope here) and
	// its unchanged output side (a real cable onward to a device).
	PositionX float64 `json:"position_x"`
	PositionY float64 `json:"position_y"`
	// InputPositionX/InputPositionY are this same stagebox's separate
	// canvas placement in the Input graph's Processing zone (Slice 12) —
	// a stagebox is a shared node between both graphs, but each graph
	// keeps its own independent position so dragging it in one never
	// moves it in the other.
	InputPositionX float64 `json:"input_position_x"`
	InputPositionY float64 `json:"input_position_y"`
}

type StageMulti struct {
	ID              int64   `json:"id"`
	EventID         int64   `json:"event_id"`
	Name            string  `json:"name"`
	LengthM         float64 `json:"length_m"`
	Channels        int     `json:"channels"`
	ConnectorType   string  `json:"connector_type"`
	InventoryItemID *int64  `json:"inventory_item_id,omitempty"`
	// PositionX/PositionY are this event's canvas placement in the
	// output signal-flow graph's Processing zone.
	PositionX float64 `json:"position_x"`
	PositionY float64 `json:"position_y"`
	// InputPositionX/InputPositionY are this same stage multi's separate
	// canvas placement in the Input graph's Processing zone (Slice 12) —
	// see Stagebox's own note above.
	InputPositionX float64 `json:"input_position_x"`
	InputPositionY float64 `json:"input_position_y"`
}

// MixerGroup is a named mix bus of one event. The built-in LR main group
// exists on every event and can be recolored but never renamed or deleted.
type MixerGroup struct {
	ID        int64  `json:"id"`
	EventID   int64  `json:"event_id"`
	Name      string `json:"name"`
	IsBuiltin bool   `json:"is_builtin"`
	Color     string `json:"color,omitempty"`
}

// MixerDCA is a named DCA of one event.
type MixerDCA struct {
	ID      int64  `json:"id"`
	EventID int64  `json:"event_id"`
	Name    string `json:"name"`
	Color   string `json:"color,omitempty"`
}

// Valid values for AudioPatchInput.Width / AudioPatchOutput.Width,
// AudioPatchInput.MixerBehavior, and AudioPatchInput.SourceCabling. These are
// Go-validated enums, not reference-data vocabularies: each value carries
// counting/pairing/numbering semantics in code (rental doubling, console
// pair display, splitter-vs-two-cables multiplier), so a user-added value
// could not mean anything (see plan.md Constitution Check, Principle II).
var (
	ValidWidths         = []string{"mono", "stereo"}
	ValidMixerBehaviors = []string{"stereo_channel", "linked_channels"}
	ValidSourceCablings = []string{"two_cables", "splitter"}
	// ValidHopKinds/ValidDeviceSources are legacy (Slice 10) enums, kept
	// only for output_graph_migration.go's one-time conversion of old
	// output_chain_hops rows — no longer written by any live API path.
	ValidHopKinds      = []string{"device", "route"}
	ValidDeviceSources = []string{"inventory", "owned", "shared"}
	// ValidPortFromKinds/ValidPortToKinds are OutputCable's Go-validated
	// enums (Slice 11): a port is identified by (kind, id, index), and
	// kind selects which table id resolves against. Direction is
	// structural, not a stored flag — from_kind always resolves against a
	// node's output side, to_kind always against its input side. mixer
	// has no input side (FR-006) so it can only ever appear as a
	// from_kind. A stagebox is a full pass-through: its existing
	// OutputCount sizes both sides (a channel routes into a specific
	// jack, a real cable carries on from it), mirroring stage_multi.
	// device_link is a destination device's link-out side (chaining to
	// another device's ordinary input, e.g. sub → sub → top) — a
	// from_kind only, since a link cable's other end is always an
	// ordinary device input (to_kind="device"), never its own kind.
	ValidPortFromKinds = []string{"mixer", "stagebox", "stage_multi", "device", "device_link"}
	ValidPortToKinds   = []string{"stagebox", "stage_multi", "device"}
	// ValidInputSourceKinds is InputSource.Kind (Slice 12): "mic" requires
	// MicItemID (StandItemID/PhantomPower meaningful only for this kind);
	// "line" forbids all three. Go-validated, not a reference vocabulary —
	// same reasoning as ValidWidths etc. above.
	ValidInputSourceKinds = []string{"mic", "line"}
	// ValidInputCableFromKinds/ValidInputCableToKinds are InputCable's
	// Go-validated enums (Slice 12), the input graph's mirror of
	// ValidPortFromKinds/ValidPortToKinds: "source" has no input side (only
	// ever a from_kind, symmetric with "mixer" on the output graph);
	// "channel" has no output side (only ever a to_kind). A Stagebox/
	// Stage-Multi's own console-side hop into a channel is cableless
	// (research.md R5) — the mirror image of the output graph's rule.
	ValidInputCableFromKinds = []string{"source", "stagebox", "stage_multi", "device"}
	ValidInputCableToKinds   = []string{"stagebox", "stage_multi", "device", "channel"}
)

// OutputDevice is a node in the output signal-flow graph (Slice 11) —
// declared once per event, with an input port count/connector type and an
// output port count/connector type (either side may be zero: zero inputs
// makes it a pure source, zero outputs a pure destination), and a canvas
// position for this event. Exactly one of InventoryItemID/OwnedItemID is
// set. Referenced by position from any number of OutputCable rows;
// counted once on the rental order regardless of how many cables
// reference it (research.md R4 — no width-based doubling, a physically
// separate unit is simply its own row).
//
// LinkPortCount/LinkConnectorType are a destination device's link-out
// ports (chaining to another device's ordinary input, e.g. sub → sub →
// top, or three line-array boxes fed from one amp channel) — deliberately
// separate from OutputPortCount so a destination device (OutputPortCount
// == 0) stays a destination — pinned to the Destinations rail — even
// with link ports declared; it never becomes a "processing" node just
// because it can pass its signal on to another box.
type OutputDevice struct {
	ID              int64  `json:"id"`
	EventID         int64  `json:"event_id"`
	Name            string `json:"name"`
	InventoryItemID *int64 `json:"inventory_item_id,omitempty"`
	OwnedItemID     *int64 `json:"owned_item_id,omitempty"`

	InputPortCount      int    `json:"input_port_count"`
	InputConnectorType  string `json:"input_connector_type,omitempty"`
	OutputPortCount     int    `json:"output_port_count"`
	OutputConnectorType string `json:"output_connector_type,omitempty"`
	LinkPortCount       int    `json:"link_port_count"`
	LinkConnectorType   string `json:"link_connector_type,omitempty"`

	PositionX float64 `json:"position_x"`
	PositionY float64 `json:"position_y"`
}

// OutputCable is one edge in the output signal-flow graph (Slice 11): a
// connection from one output port to one input port. A port is identified
// by (kind, id, index) — FromKind ∈ ValidPortFromKinds, ToKind ∈
// ValidPortToKinds; id resolves against audio_patch_outputs (mixer),
// stageboxes, stage_multis, or output_devices depending on kind (no DB FK
// — polymorphic, validated in the API layer, research.md R2/R7).
// CableItemID is always nil when ToKind is "stage_multi" or "stagebox" —
// a stage multi's input side is its own built-in wiring, and a
// stagebox's input side is pure console/network routing (the
// mixer-to-stagebox link itself is out of scope here, tracked separately
// as a Rented Extra) — neither is ever a separately rentable cable
// (FR-013/research.md R6, extended to stageboxes).
type OutputCable struct {
	ID      int64 `json:"id"`
	EventID int64 `json:"event_id"`

	FromKind string `json:"from_kind"`
	FromID   int64  `json:"from_id"`
	FromPort int    `json:"from_port"`

	ToKind string `json:"to_kind"`
	ToID   int64  `json:"to_id"`
	ToPort int    `json:"to_port"`

	CableItemID *int64 `json:"cable_item_id,omitempty"`
}

// OutputChainHop is the legacy (Slice 10) shape of one step in an output
// channel's signal path — superseded by the OutputCable graph in Slice 11.
// Kept only so output_graph_migration.go can scan pre-existing
// output_chain_hops rows and convert them; nothing writes this shape
// anymore. HopKind "device" carries a device pick (DeviceSource selects
// which of InventoryItemID/OwnedItemID/OutputDeviceID is meaningful);
// HopKind "route" carries a stagebox/stage-multi hand-off instead, with an
// independent side B for stereo channels. CableItemID/CableType/
// CableLengthM are meaningful on either hop kind.
type OutputChainHop struct {
	ID       int64  `json:"id"`
	Position int    `json:"position"`
	HopKind  string `json:"hop_kind"`

	CableItemID *int64 `json:"cable_item_id,omitempty"`
	// CableItemIDB is side B's own, independently-picked cable — meaningful
	// only when the output's Width is "stereo". A stereo hop's two physical
	// runs are not always the same length (e.g. an amplifier on one side of
	// the stage needs a shorter cable to the near speaker than the far
	// one): leaving this unset keeps today's convenience default (CableItemID
	// doubles ×2); setting it makes both sides independently-picked and
	// independently counted (research.md R3 addendum).
	CableItemIDB *int64 `json:"cable_item_id_b,omitempty"`
	// CableType/CableLengthM are legacy pre-Slice-6 text, kept for display
	// on hops migrated from a row that never got a catalog cable pick. The
	// UI never offers to author them, and the server always clears them
	// when CableItemID is set on the same write (mirrors the read-only
	// lifecycle inputs/outputs already have for their own legacy fields).
	// Unlike those single-row fields, hops are replaced wholesale on every
	// write (no per-hop identity to preserve across an edit) — carrying
	// an untouched hop's legacy text forward is the caller's
	// responsibility (round-trip what GET returned).
	CableType    string  `json:"cable_type,omitempty"`
	CableLengthM float64 `json:"cable_length_m,omitempty"`

	// DeviceSource is "inventory", "owned", or "shared" (ValidDeviceSources),
	// meaningful only when HopKind is "device"; selects which one FK below
	// is set.
	DeviceSource    string `json:"device_source,omitempty"`
	InventoryItemID *int64 `json:"inventory_item_id,omitempty"`
	OwnedItemID     *int64 `json:"owned_item_id,omitempty"`
	OutputDeviceID  *int64 `json:"output_device_id,omitempty"`

	// Route fields, meaningful only when HopKind is "route". Mutually
	// exclusive: StageboxID or StageMultiID, not both.
	StageboxID         *int64 `json:"stagebox_id,omitempty"`
	StageboxChannel    *int   `json:"stagebox_channel,omitempty"`
	StageboxIDB        *int64 `json:"stagebox_id_b,omitempty"`
	StageboxChannelB   *int   `json:"stagebox_channel_b,omitempty"`
	StageMultiID       *int64 `json:"stage_multi_id,omitempty"`
	StageMultiChannel  *int   `json:"stage_multi_channel,omitempty"`
	StageMultiIDB      *int64 `json:"stage_multi_id_b,omitempty"`
	StageMultiChannelB *int   `json:"stage_multi_channel_b,omitempty"`
}

// InputChannel is a console input strip (Slice 12, renamed in place from
// AudioPatchInput/audio_patch_inputs — research.md R4) — channel identity
// only. What feeds it (a mic/line Source, optionally through a Stagebox/
// Stage-Multi/Device) is entirely determined by InputCable rows, never
// stored here. Contributes exactly one input-only port to the input
// signal-flow graph at (channel, ID, 0).
type InputChannel struct {
	ID            int64  `json:"id"`
	EventID       int64  `json:"event_id"`
	ChannelNumber int    `json:"channel_number"`
	ChannelName   string `json:"channel_name,omitempty"`
	Color         string `json:"color,omitempty"`
	// GroupIDs/DCAIDs are the channel's full bus membership sets. On create,
	// a nil GroupIDs (field absent from JSON) means "no opinion" and the
	// server routes the channel to the event's LR group; an explicit array —
	// including [] — is stored verbatim. Updates always replace wholesale.
	GroupIDs []int64 `json:"group_ids"`
	DCAIDs   []int64 `json:"dca_ids"`
	// Width is "mono" or "stereo" (ValidWidths) — display/console-numbering
	// only; a stereo pair is two independent InputChannel rows (Slice 9
	// convention, unchanged), not one row with two ports.
	Width string `json:"width"`
	// MixerBehavior is "stereo_channel" or "linked_channels"
	// (ValidMixerBehaviors). Meaningful only when Width is "stereo"; purely
	// a console-number display attribute — never affects routing/rental.
	MixerBehavior string `json:"mixer_behavior"`
	Notes         string `json:"notes,omitempty"`
}

// InputSource is the physical origin of a signal (Slice 12) — a
// microphone on a stand, or a bare line/instrument output. Never linked
// to an InputChannel by a stored reference, only by the InputCable graph;
// never carries its own color (derived client-side from whichever
// Channel(s) it reaches, research.md R9). Contributes 1 output-only port
// (2, independently, when Width is "stereo") to the graph.
type InputSource struct {
	ID      int64  `json:"id"`
	EventID int64  `json:"event_id"`
	Name    string `json:"name"`
	// Kind is "mic" or "line" (ValidInputSourceKinds). "mic" requires
	// MicItemID; "line" forbids MicItemID/StandItemID/PhantomPower.
	Kind         string `json:"kind"`
	MicItemID    *int64 `json:"mic_item_id,omitempty"`
	StandItemID  *int64 `json:"stand_item_id,omitempty"`
	PhantomPower bool   `json:"phantom_power"`
	// ConnectorType is always required, regardless of Kind.
	ConnectorType string `json:"connector_type"`
	// Width is "mono" or "stereo" (ValidWidths).
	Width     string  `json:"width"`
	PositionX float64 `json:"position_x"`
	PositionY float64 `json:"position_y"`
}

// InputDevice is a Processing-zone node in the input signal-flow graph
// (Slice 12) — a DI box or similar gear with an input side and an output
// side. Same shape as OutputDevice's port/connector/position fields
// (minus link-out ports, not needed on this graph) but a separate table
// (research.md R3) — the input and output graphs never share a device
// row.
type InputDevice struct {
	ID              int64  `json:"id"`
	EventID         int64  `json:"event_id"`
	Name            string `json:"name"`
	InventoryItemID *int64 `json:"inventory_item_id,omitempty"`
	OwnedItemID     *int64 `json:"owned_item_id,omitempty"`

	InputPortCount      int    `json:"input_port_count"`
	InputConnectorType  string `json:"input_connector_type,omitempty"`
	OutputPortCount     int    `json:"output_port_count"`
	OutputConnectorType string `json:"output_connector_type,omitempty"`

	PositionX float64 `json:"position_x"`
	PositionY float64 `json:"position_y"`
}

// InputCable is one edge in the input signal-flow graph (Slice 12): a
// connection from one output port to one input port. FromKind ∈
// ValidInputCableFromKinds, ToKind ∈ ValidInputCableToKinds; id resolves
// against input_sources, stageboxes, stage_multis, or input_devices
// (from_kind) / stageboxes, stage_multis, input_devices, or
// input_channels (to_kind) — no DB FK, polymorphic, validated in the API
// layer (research.md R2). CableItemID is always nil when FromKind is
// "stagebox"/"stage_multi" AND ToKind is "channel" — that hop is a
// logical console-slot assignment, not a separately rentable physical
// cable (research.md R5, the mirror image of the output graph's FR-013).
// A Source's output port may originate more than one cable at once
// (double-patching, FR-006) — every other from_kind stays
// one-cable-per-port, enforced by a partial unique index (migration 029),
// not a table-level UNIQUE.
type InputCable struct {
	ID      int64 `json:"id"`
	EventID int64 `json:"event_id"`

	FromKind string `json:"from_kind"`
	FromID   int64  `json:"from_id"`
	FromPort int    `json:"from_port"`

	ToKind string `json:"to_kind"`
	ToID   int64  `json:"to_id"`
	ToPort int    `json:"to_port"`

	CableItemID *int64 `json:"cable_item_id,omitempty"`
}

// AudioPatchOutput is one output channel — a mixer channel definition.
// Its signal path is no longer stored on this row at all (Slice 10's
// Chain field is gone): the channel contributes one output-only port
// (two, independently, when Width is "stereo") to the output signal-flow
// graph, referenced by OutputCable rows with FromKind = "mixer",
// FromID = this row's ID (data-model.md).
type AudioPatchOutput struct {
	ID           int64  `json:"id"`
	EventID      int64  `json:"event_id"`
	OutputNumber int    `json:"output_number"`
	OutputName   string `json:"output_name,omitempty"`
	OutputType   string `json:"output_type"`
	Color        string `json:"color,omitempty"`
	// Width is "mono" or "stereo" (ValidWidths). No MixerBehavior equivalent
	// exists for outputs — output numbering has no console-strip semantics.
	// Stereo means two independent ports (research.md R4 — real separate
	// rows/cables now, not a doubling flag).
	Width string `json:"width"`
	Notes string `json:"notes,omitempty"`
}
