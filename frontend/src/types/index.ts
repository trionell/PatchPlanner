export interface Event {
  id: number
  name: string
  date?: string
  venue?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface InventoryCategory {
  id: number
  name: string
  category_type: 'audio' | 'lighting' | 'misc' | 'video' | 'rigging'
  /** Marks the category as a planning-picker source; absent = not offered. */
  picker_role?: 'cable' | 'stand'
  item_count?: number
}

export interface InventoryItem {
  id: number
  category_id: number
  category_name?: string
  category_type?: string
  name: string
  description?: string
  quantity_available: number
  price_ex_vat: number
  xlsx_row?: number
  discontinued: boolean
  created_at?: string
}

export interface Stagebox {
  id: number
  event_id: number
  name: string
  model?: string
  input_count: number
  output_count: number
  connection_type: string
  inventory_item_id?: number
  /**
   * Canvas placement in the output signal-flow graph's Processing zone —
   * a stagebox is a full pass-through node there: output_count sizes
   * both an input side (a channel routes into a specific jack, pure
   * console/network routing, never a physical cable) and its output
   * side (a real cable onward to a device).
   */
  position_x: number
  position_y: number
  /**
   * This same stagebox's separate canvas placement in the Input graph's
   * Processing zone — a stagebox is a shared node between both graphs,
   * but each graph keeps its own independent position.
   */
  input_position_x: number
  input_position_y: number
}

export interface StageMulti {
  id: number
  event_id: number
  name: string
  length_m: number
  channels: number
  connector_type: string
  inventory_item_id?: number
  /** Canvas placement in the output signal-flow graph's Processing zone. */
  position_x: number
  position_y: number
  /** This same stage multi's separate canvas placement in the Input graph's Processing zone — see Stagebox's own note above. */
  input_position_x: number
  input_position_y: number
}

/** A named mix bus of one event; LR is built-in (recolorable, never renamed/deleted). */
export interface MixerGroup {
  id: number
  event_id: number
  name: string
  is_builtin: boolean
  /** channel_colors palette value (CSS color); absent = uncolored. */
  color?: string
}

/** A named DCA of one event. */
export interface MixerDCA {
  id: number
  event_id: number
  name: string
  color?: string
}

/** POST/PATCH body for groups and DCAs. */
export interface BusRequest {
  name: string
  color?: string
}

/**
 * The physical origin of a signal (Slice 12) — a microphone on a stand,
 * or a bare line/instrument output. Never linked to an InputChannel by a
 * stored reference, only by the InputCable graph; never carries its own
 * color (derived client-side from whichever Channel(s) it reaches).
 * Contributes 1 output-only port (2, independently, when width is
 * 'stereo') to the input signal-flow graph.
 */
export interface InputSource {
  id: number
  event_id: number
  name: string
  /** 'mic' requires mic_item_id (stand_item_id/phantom_power meaningful only for this kind); 'line' forbids all three. */
  kind: 'mic' | 'line'
  mic_item_id?: number
  stand_item_id?: number
  phantom_power: boolean
  /** Always required regardless of kind. Vocabulary value from reference data (preamp_connectors). */
  connector_type: string
  width: 'mono' | 'stereo'
  position_x: number
  position_y: number
}

/**
 * A console input strip (Slice 12) — channel identity only. What feeds
 * it (a mic/line Source, optionally through a Stagebox/Stage-Multi/
 * Device) is entirely determined by InputCable rows, never stored here.
 * Contributes exactly one input-only port to the input signal-flow graph.
 */
export interface InputChannel {
  id: number
  event_id: number
  channel_number: number
  channel_name?: string
  /** channel_colors palette value; absent = uncolored. The only place color is stored — every upstream Source/port derives its color from this. */
  color?: string
  /**
   * Full bus membership sets. Omitting group_ids on create makes the server
   * route the channel to LR; an explicit array (even []) is stored verbatim.
   */
  group_ids?: number[]
  dca_ids?: number[]
  /** 'mono' (default) or 'stereo' — display/console-numbering only; a stereo pair is two independent InputChannel rows, not one row with two ports. */
  width: 'mono' | 'stereo'
  /** Meaningful only when width is 'stereo'; console-number display only, never affects routing/counting. */
  mixer_behavior: 'stereo_channel' | 'linked_channels'
  notes?: string
}

/**
 * A Processing-zone node in the input signal-flow graph (Slice 12) — a
 * DI box or similar gear with an input side and an output side. Same
 * shape as OutputDevice's port/connector/position fields (minus link-out
 * ports, not needed on this graph) but a separate table — the input and
 * output graphs never share a device row.
 */
export interface InputDevice {
  id: number
  event_id: number
  name: string
  inventory_item_id?: number
  owned_item_id?: number
  input_port_count: number
  input_connector_type?: string
  output_port_count: number
  output_connector_type?: string
  position_x: number
  position_y: number
}

/**
 * One edge in the input signal-flow graph (Slice 12) — a cable from one
 * node's output-side port to another node's input-side port. from_kind
 * is 'source' | 'stagebox' | 'stage_multi' | 'device' ('source' has no
 * input side, so is never a to_kind); to_kind is 'stagebox' |
 * 'stage_multi' | 'device' | 'channel' ('channel' has no output side, so
 * is never a from_kind). cable_item_id is always null when from_kind is
 * 'stagebox'/'stage_multi' AND to_kind is 'channel' — that hop is a
 * logical console-slot assignment, not a separately rentable physical
 * cable (the mirror image of the output graph's FR-013). A Source's
 * output port may originate more than one cable at once (double-patching)
 * — every other from_kind stays one-cable-per-port.
 */
export interface InputCable {
  id: number
  event_id: number
  from_kind: 'source' | 'stagebox' | 'stage_multi' | 'device'
  from_id: number
  from_port: number
  to_kind: 'stagebox' | 'stage_multi' | 'device' | 'channel'
  to_id: number
  to_port: number
  cable_item_id?: number
}

/**
 * A node in the output signal-flow graph (Slice 11) — a physical device
 * declared once per event and connected via any number of OutputCable
 * edges, counted once on the rental order regardless of how many cables
 * reference it. Exactly one of inventory_item_id/owned_item_id is set.
 * A side's port count is 0 when the device has nothing on that side (0
 * input ports = a pure source; 0 output ports = a pure destination); its
 * connector_type is set exactly when that side's port count is > 0.
 * link_port_count/link_connector_type are a destination device's link-out
 * ports (daisy-chaining to another device's ordinary input, e.g. sub ->
 * sub -> top) — deliberately separate from output_port_count so a
 * destination device stays pinned to the Destinations zone even with
 * link ports declared. position_x/position_y are this event's canvas
 * placement only.
 */
export interface OutputDevice {
  id: number
  event_id: number
  name: string
  inventory_item_id?: number
  owned_item_id?: number
  input_port_count: number
  input_connector_type?: string
  output_port_count: number
  output_connector_type?: string
  link_port_count: number
  link_connector_type?: string
  position_x: number
  position_y: number
}

/**
 * One edge in the output signal-flow graph — a cable from one node's
 * output-side port to another node's input-side port. from_kind is
 * 'mixer' | 'stagebox' | 'stage_multi' | 'device' | 'device_link' (mixer
 * has no input side, so is never a to_kind; device_link is a destination
 * device's link-out side, always landing on an ordinary device's input);
 * to_kind is 'stagebox' | 'stage_multi' | 'device'. cable_item_id is
 * always null when to_kind is 'stagebox' or 'stage_multi' — a channel's
 * route into either is pure console/network routing, never a separately
 * rentable cable (FR-013); otherwise it's the picked catalog item, or
 * unset for a gap (a device_link cable is a real physical run, so it
 * behaves like an ordinary device-to-device cable here). A mixer port (a
 * logical channel, not a physical jack) can be the from side of more
 * than one cable at once — every other from_kind stays
 * one-cable-per-port.
 */
export interface OutputCable {
  id: number
  event_id: number
  from_kind: 'mixer' | 'stagebox' | 'stage_multi' | 'device' | 'device_link'
  from_id: number
  from_port: number
  to_kind: 'stagebox' | 'stage_multi' | 'device'
  to_id: number
  to_port: number
  cable_item_id?: number
}

export interface AudioPatchOutput {
  id: number
  event_id: number
  output_number: number
  output_name?: string
  /** Vocabulary value from reference data (output_types). */
  output_type: string
  /** channel_colors palette value; absent = uncolored. */
  color?: string
  /** 'mono' (default) or 'stereo'. No mixer-behavior equivalent — outputs have no console-strip semantics. */
  width: 'mono' | 'stereo'
  notes?: string
}

export interface LightingRig {
  id: number
  event_id: number
  name: string
  notes?: string
}

export interface TrussSection {
  id: number
  rig_id: number
  name: string
  length_m: number
  /** Vocabulary value from reference data (truss_types). */
  truss_type: string
}

export interface LightingFixture {
  id: number
  rig_id: number
  /** Console (GrandMA) fixture ID; optional, duplicates flagged in the UI. */
  fixture_number?: number
  truss_section_id?: number
  inventory_item_id?: number
  inventory_item_name?: string
  custom_name?: string
  position_index: number
  power_connection: 'grid' | 'chain'
  power_chain_parent_id?: number
  power_connector_in: string
  power_connector_out?: string
  dmx_universe: number
  dmx_start_address?: number
  dmx_channel_mode?: string
  dmx_channel_count: number
  dmx_chain_parent_id?: number
  notes?: string
  truss_section_name?: string
}

/** One bulk-add batch: N identical fixtures with shared settings. */
export interface BulkFixtureRequest {
  inventory_item_id: number
  quantity: number
  fixture_number_start?: number
  dmx_channel_mode?: string
  dmx_channel_count: number
  truss_section_id?: number
  dmx_universe: number
  power_connection: 'grid' | 'chain'
  power_connector_in: string
}

export interface EventRental {
  inventory_item_id: number
  inventory_item_name?: string
  description?: string
  quantity_audio: number
  quantity_lighting: number
  total_quantity: number
  manual_quantity_audio: number
  manual_quantity_lighting: number
  manual_notes?: string
  price_ex_vat: number
  subtotal_ex_vat: number
  quantity_available: number
  is_over_stock: boolean
  is_discontinued: boolean
}

export interface ManualRentalRequest {
  quantity_audio: number
  quantity_lighting: number
  notes?: string
}

export interface RentalSummary {
  items: EventRental[]
  total_items: number
  total_quantity: number
  total_ex_vat: number
  has_over_stock: boolean
}

export interface OwnedItem {
  id: number
  name: string
  description?: string
  category_type: 'audio' | 'lighting' | 'rigging' | 'video' | 'misc'
  quantity_owned: number
  notes?: string
  planned_on_events: number
  created_at?: string
}

export interface EventOwnedEquipment {
  owned_item_id: number
  owned_item_name: string
  category_type: string
  quantity: number
  quantity_owned: number
  is_over_owned: boolean
  notes?: string
}

export interface OwnedEquipmentRequest {
  quantity: number
  notes?: string
}

export interface UnplacedLine {
  inventory_item_id: number
  inventory_item_name: string
  quantity_audio: number
  quantity_lighting: number
  reason: 'discontinued' | 'row_mismatch' | 'no_row'
}

export interface RentalExportReport {
  filename: string
  placed_lines: number
  unplaced_lines: UnplacedLine[]
}

export interface ReferenceValue {
  id: number
  vocabulary: string
  value: string
  label: string
}

export type ReferenceData = Record<string, ReferenceValue[]>

export interface FixtureMode {
  id: number
  inventory_item_id: number
  name: string
  channel_count: number
}

export interface AudioPatchResponse {
  stageboxes: Stagebox[]
  stage_multis: StageMulti[]
  groups: MixerGroup[]
  dcas: MixerDCA[]
  input_sources: InputSource[]
  input_channels: InputChannel[]
  input_devices: InputDevice[]
  input_cables: InputCable[]
  outputs: AudioPatchOutput[]
  output_devices: OutputDevice[]
  output_cables: OutputCable[]
  /** The mixer node's canvas Y position in the Sources/Channels rail (X is fixed). */
  output_mixer_position_y: number
}

export interface LightingRigResponse {
  rig: LightingRig
  sections: TrussSection[]
  fixtures: LightingFixture[]
}

export interface InventoryImportResult {
  categories_imported: number
  items_imported: number
}
