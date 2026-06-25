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
}

export interface StageMulti {
  id: number
  event_id: number
  name: string
  length_m: number
  channels: number
  connector_type: string
}

export interface AudioPatchInput {
  id: number
  event_id: number
  channel_number: number
  channel_name?: string
  signal_type: 'mic' | 'line' | 'di' | 'return' | 'aux'
  preamp_connector: string
  stagebox_id?: number
  stagebox_channel?: number
  stage_multi_id?: number
  stage_multi_channel?: number
  mic_model?: string
  cable_type: string
  cable_length_m: number
  mic_stand?: 'straight' | 'boom' | 'low' | 'desk' | 'clip' | 'none' | ''
  phantom_power: boolean
  dca_groups?: string
  notes?: string
}

export interface AudioPatchOutput {
  id: number
  event_id: number
  output_number: number
  output_name?: string
  output_type: 'foh' | 'monitor' | 'sub' | 'aux' | 'matrix' | 'stereo' | 'iem'
  destination_type: 'local' | 'stagebox' | 'stage_multi'
  stagebox_id?: number
  stagebox_channel?: number
  stage_multi_id?: number
  stage_multi_channel?: number
  amplifier_item_id?: number
  speaker_item_id?: number
  cable_type: string
  cable_length_m: number
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
  truss_type: 'box' | 'ladder' | 'circle' | 'straight' | 'none'
}

export interface LightingFixture {
  id: number
  rig_id: number
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

export interface EventRental {
  id: number
  event_id: number
  inventory_item_id: number
  inventory_item_name?: string
  description?: string
  quantity_audio: number
  quantity_lighting: number
  total_quantity: number
  price_ex_vat: number
  subtotal_ex_vat: number
  notes?: string
}

export interface RentalSummary {
  items: EventRental[]
  total_items: number
  total_quantity: number
  total_ex_vat: number
}

export interface AudioPatchResponse {
  stageboxes: Stagebox[]
  stage_multis: StageMulti[]
  inputs: AudioPatchInput[]
  outputs: AudioPatchOutput[]
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
