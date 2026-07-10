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
}

export interface StageMulti {
  id: number
  event_id: number
  name: string
  length_m: number
  channels: number
  connector_type: string
  inventory_item_id?: number
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

export interface AudioPatchInput {
  id: number
  event_id: number
  channel_number: number
  channel_name?: string
  /** Vocabulary value from reference data (signal_types). */
  signal_type: string
  preamp_connector: string
  stagebox_id?: number
  stagebox_channel?: number
  stage_multi_id?: number
  stage_multi_channel?: number
  mic_item_id?: number
  /** Legacy free-text mic name for rows whose text matched no catalog item. Read-only. */
  mic_label?: string
  cable_item_id?: number
  stand_item_id?: number
  /** Legacy pre-019 cable values; read-only display until a cable is picked. */
  cable_type?: string
  cable_length_m?: number
  /** Legacy pre-019 stand vocabulary value; read-only display until a stand is picked. */
  mic_stand?: string
  phantom_power: boolean
  /** channel_colors palette value; absent = uncolored. */
  color?: string
  /**
   * Full bus membership sets. Omitting group_ids on create makes the server
   * route the channel to LR; an explicit array (even []) is stored verbatim.
   */
  group_ids?: number[]
  dca_ids?: number[]
  /** 'mono' (default) or 'stereo' — a stereo channel is two independently patchable physical inputs. */
  width: 'mono' | 'stereo'
  /** Meaningful only when width is 'stereo'; console-number display only, never affects routing/counting. */
  mixer_behavior: 'stereo_channel' | 'linked_channels'
  /** Side B's own stagebox/multi route — independent of side A, meaningful only when width is 'stereo'. */
  stagebox_id_b?: number
  stagebox_channel_b?: number
  stage_multi_id_b?: number
  stage_multi_channel_b?: number
  /** Source→DI cable; meaningful only when signal_type is 'di'. */
  source_cable_item_id?: number
  /** 'two_cables' (default) or 'splitter'; meaningful only for a stereo DI channel. */
  source_cabling: 'two_cables' | 'splitter'
  notes?: string
}

/**
 * One step in an output channel's signal path (Slice 10). A 'device' hop
 * carries a device pick — device_source selects which one of
 * inventory_item_id/owned_item_id/output_device_id is meaningful (at most
 * one set; none yet is a valid "not picked" gap). A 'route' hop instead
 * carries a stagebox/stage-multi hand-off, with an independent side B for
 * stereo channels. cable_item_id/cable_type/cable_length_m apply to
 * either hop kind — cable_type/cable_length_m are legacy pre-Slice-6 text
 * carried on hops migrated from a row that never got a catalog cable
 * pick; the UI never authors them directly and the server clears them
 * once cable_item_id is set. cable_item_id_b is side B's own,
 * independently-picked cable (meaningful only when the channel is
 * stereo) — left unset, cable_item_id doubles for both sides as a
 * convenience; set it when the two physical runs need different lengths
 * (e.g. an amp on one side of the stage needs a shorter cable to the
 * near speaker than the far one).
 */
export interface OutputChainHop {
  id?: number
  position: number
  hop_kind: 'device' | 'route'
  cable_item_id?: number
  cable_item_id_b?: number
  cable_type?: string
  cable_length_m?: number
  device_source?: 'inventory' | 'owned' | 'shared'
  inventory_item_id?: number
  owned_item_id?: number
  output_device_id?: number
  stagebox_id?: number
  stagebox_channel?: number
  stagebox_id_b?: number
  stagebox_channel_b?: number
  stage_multi_id?: number
  stage_multi_channel?: number
  stage_multi_id_b?: number
  stage_multi_channel_b?: number
}

/**
 * A physical device declared once per event and referenced by position
 * from any number of output channels' chain hops — counted once on the
 * rental order regardless of how many hops reference it. Exactly one of
 * inventory_item_id/owned_item_id is set.
 */
export interface OutputDevice {
  id: number
  event_id: number
  name: string
  inventory_item_id?: number
  owned_item_id?: number
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
  /**
   * The channel's ordered signal path, replaced wholesale on every write
   * (destination/amplifier/speaker/cable fields from Slices 0-9 were
   * replaced by this chain in Slice 10 — see OutputChainHop).
   */
  chain: OutputChainHop[]
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
  inputs: AudioPatchInput[]
  outputs: AudioPatchOutput[]
  output_devices: OutputDevice[]
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
