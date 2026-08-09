export interface Event {
  id: number
  name: string
  /**
   * The four dates, chronologically. Only `startDate` has no fallback: each of
   * the others means "derives from its neighbour" when absent, which is why
   * absence is represented by absence and not by an empty string. An event
   * carrying only a `startDate` is one day long — what every event created
   * before Slice 30 means. Resolve them with `resolveDates` in
   * `lib/eventTimeline.ts`; never read one directly to decide a span.
   */
  loadInDate?: string
  startDate?: string
  endDate?: string
  loadOutDate?: string
  venue?: string
  notes?: string
  created_at: string
  updated_at: string
  yourRole?: 'owner' | 'contributor' | 'viewer'
  inventoryId: number
  /**
   * This job's own pricing terms (Slice 31), written only by
   * `putEventPricing` — never by the details drawer, whose save is a
   * whole-object replace on the server.
   *
   * The first three are absent when the event follows its catalog, which is why
   * absence is the representation: a catalog corrected after the fact corrects
   * every event that never disagreed with it.
   *
   * `discountPercent` is always sent by the server — zero is a stated fact — but
   * is optional here for the reason `itemCount` is on `Inventory`: absent and 0
   * mean the same thing, and requiring it would make every call site that builds
   * an `Event` carry a field none of them decides.
   */
  chargedDays?: 'onsite' | 'show'
  rentFactorOverride?: number
  vatPercent?: number
  discountPercent?: number
}

/** An owned, independent equipment catalog (Slice 16). */
export interface Inventory {
  id: number
  name: string
  sourceFilename?: string
  /**
   * How the catalog was populated. Only 'll' earns the price-list export;
   * 'generic' and absent (hand-entered / never imported) get the PDF and
   * spreadsheet exports only.
   */
  sourceFormat?: 'll' | 'generic'
  createdAt: string
  /**
   * The three counts the list view is made of (Slice 32). Present on the
   * list payload only — an endpoint returning a single inventory leaves
   * them absent rather than reporting zeroes it never measured — and
   * omitted by the server when they are zero, so absent and 0 mean the
   * same thing at every call site.
   */
  itemCount?: number
  categoryCount?: number
  eventCount?: number
}

export interface CurrentUser {
  id: number
  email: string
  name: string
  pictureUrl?: string
  createdAt: string
  lastLoginAt: string
}

export interface EventMember {
  userId: number
  email: string
  name: string
  pictureUrl?: string
  role: 'owner' | 'contributor' | 'viewer'
  invitedBy?: number
  createdAt: string
}

export interface InventoryCategory {
  id: number
  name: string
  category_type: 'audio' | 'lighting' | 'misc' | 'video' | 'rigging'
  /** Marks the category as a planning-picker source; absent = not offered. */
  picker_role?: 'cable' | 'stand' | 'truss' | 'mic'
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
  /** True for items typed in by hand; imports leave these alone. */
  is_manual?: boolean
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
  /** Opts this multi into the output flow graph (canvas and exported PDF); ignored (treated as shown) when it has a real output cable connected. */
  show_in_output_graph: boolean
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
  /** 'mic' allows mic_item_id/stand_item_id/phantom_power, all optional (a mic source may be unassigned); 'line' forbids all three. */
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
  /** Which desk this channel is a strip on; absent when the event has no console. */
  console_id?: number
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
  from_kind: 'source' | 'stagebox' | 'stage_multi' | 'device' | 'console_local'
  from_id: number
  from_port: number
  to_kind: 'stagebox' | 'stage_multi' | 'device' | 'channel' | 'console_local'
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
  from_kind: 'mixer' | 'stagebox' | 'stage_multi' | 'device' | 'device_link' | 'console_local'
  from_id: number
  from_port: number
  to_kind: 'stagebox' | 'stage_multi' | 'device' | 'console_local'
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
  /** Which desk this output comes off; absent when the event has no console. */
  console_id?: number
}

/**
 * A mixing desk booked for an event (Slice 23) — the entity the audio model
 * never had. Shaped like a Stagebox: event-scoped, at most one of
 * inventory_item_id/owned_item_id, port counts typed per event, and a canvas
 * position per graph. A count of 0 means "not declared", never "over capacity
 * by every row". Local jacks are addressable as ports of kind
 * 'console_local', which is what lets a source reach a channel with no
 * stagebox in the path.
 */
export interface Console {
  id: number
  event_id: number
  name: string
  role: 'foh' | 'monitor' | 'broadcast'
  inventory_item_id?: number
  owned_item_id?: number
  input_count: number
  output_count: number
  local_input_count: number
  local_output_count: number
  /**
   * The desk's bus rail on the output canvas (`position_*`) and its channel rail on the
   * input canvas (`input_position_*`) — a pair each, placed freely since Slice 37. Both
   * were pinned to the coordinate space's edges before that, so the x of each was
   * computed, drawn, and saved back as whatever the browser window happened to be.
   */
  position_x: number
  position_y: number
  input_position_x: number
  input_position_y: number
  /**
   * The desk's local jack panel — a second node per graph since Slice 24, drawn
   * as a pass-through in the processing lane exactly as a stagebox is. Freely
   * positioned, so both axes are used.
   */
  local_position_x: number
  local_position_y: number
  local_input_position_x: number
  local_input_position_y: number
}

export interface LightingRig {
  id: number
  event_id: number
  name: string
  notes?: string
}

export interface LightingFixture {
  id: number
  rig_id: number
  /** Console (GrandMA) fixture ID; optional, duplicates flagged in the UI. */
  fixture_number?: number
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
  notes?: string
  /** Read-only, derived from the stage plot truss attachment (FR-030). */
  truss_name?: string
  truss_offset_cm?: number
}

/** One bulk-add batch: N identical fixtures with shared settings. */
export interface BulkFixtureRequest {
  /** Optional since Slice 27: a batch need not come from the catalog. */
  inventory_item_id?: number
  quantity: number
  fixture_number_start?: number
  /** Names the batch "<stem> 1" … "<stem> N". */
  name_stem?: string
  dmx_channel_mode?: string
  dmx_channel_count: number
  dmx_universe: number
  /** Picked from the universe's free runs; absent appends after the highest in use. */
  dmx_start_address?: number
  /** The whole batch on one address, as one shared group. */
  share_address?: boolean
  power_connection: 'grid' | 'chain'
  power_connector_in: string
}

/** One fixture's new DMX position, as the three rig operations produce them. */
export interface AddressChange {
  fixture_id: number
  dmx_universe: number
  dmx_start_address: number
}

export interface EventRental {
  inventory_item_id: number
  inventory_item_name?: string
  description?: string
  /**
   * The catalog category, sent since Slice 22 so the PDF and spreadsheet
   * exports can group lines without a second query. Declared here from Slice 28,
   * when the Equipment sheet started reading it to type a rented line — the
   * server has been sending all three all along.
   */
  category_id?: number
  category_name?: string
  category_type?: string
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

/**
 * How an order's day-rate subtotal becomes a hire price (Slice 31). Derived on
 * every read and stored nowhere.
 *
 * It carries every intermediate step rather than only the result, because the
 * ledger, the strip and all three exports print the derivation — a total nobody
 * can trace is a total nobody will send.
 */
export interface RentalPricing {
  billed_days: number
  /** The effective rule: 'onsite' bills load-in→load-out, 'show' bills the show days. */
  charged_days: 'onsite' | 'show'
  charged_days_source: 'inventory' | 'event'
  /** The two dates the day count spans, inclusive. Absent on an undated event. */
  first_day?: string
  last_day?: string
  rent_factor: number
  /** 'none' means the catalog has no rate card, and the factor is 1.0. */
  rent_factor_source: 'table' | 'override' | 'none'
  /** The rate-card row that produced the factor — 17 billed days can read row 14. */
  rent_factor_days?: number
  discount_percent: number
  discount_amount: number
  subtotal_ex_vat: number
  total_ex_vat: number
  vat_percent: number
  vat_source: 'inventory' | 'event'
  vat_amount: number
  total_inc_vat: number
}

export interface RentalSummary {
  items: EventRental[]
  total_items: number
  total_quantity: number
  /**
   * The sum of every line's **day rate** — what this number has always been. It
   * was called `total_ex_vat` until Slice 31, when it stopped being the order's
   * total: the hire's price is `pricing.total_ex_vat`.
   *
   * The rename was the point. A field added beside the old one would have left
   * every screen that shows money compiling and quietly showing a day rate.
   */
  subtotal_ex_vat: number
  has_over_stock: boolean
  pricing: RentalPricing
}

/** One row of a supplier's rate card: hire this many days, multiply by this. */
export interface RentFactor {
  id: number
  days: number
  factor: number
}

/** A catalog's own terms — the supplier's, not the job's. Ordered by days ascending. */
export interface InventoryPricing {
  charged_days: 'onsite' | 'show'
  vat_percent: number
  factors: RentFactor[]
}

/** What a catalog copies when it is created. Read at creation and never again. */
export interface PricingDefaults {
  charged_days: 'onsite' | 'show'
  vat_percent: number
}

/**
 * This event's departures. `null` on the first three means *follow the catalog*,
 * which is why they are nullable rather than optional — clearing one has to be
 * sendable.
 */
export interface EventPricingRequest {
  charged_days: 'onsite' | 'show' | null
  rent_factor_override: number | null
  vat_percent: number | null
  discount_percent: number
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
  /**
   * Whether the price list's two typed cells — `Rabatt utrustning` and
   * `Hyresfaktor (Antal dagar)` — were found and written (Slice 31).
   */
  pricing_placed?: boolean
  /**
   * Empty unless there is something to say. A list, because the two things it
   * can say are independent: the labels were not found, and this event's VAT
   * disagrees with the rate the file computes.
   */
  pricing_notes?: string[]
}

export interface ReferenceValue {
  id: number
  vocabulary: string
  value: string
  label: string
  /**
   * How many plan rows use this value (Slice 29). Derived per request by the
   * same function that guards the delete, so the number shown and the refusal
   * that follows cannot disagree. Absent on a reference *template*, which no
   * plan can reference — reporting `0` there would imply it could.
   */
  usageCount?: number
  /**
   * True when no planning column stores this vocabulary at all — four of the
   * nine outlived the columns that once consumed them. On those, `usageCount`
   * is not a count of zero but the absence of a question: nothing can ever
   * reference the value, so a blank `In use` would read as "unused yet" when
   * it means "this is not wired to anything".
   */
  usageUntracked?: boolean
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
  /** The event's desks, each carrying its own position on both canvases. */
  consoles: Console[]
}

export interface LightingRigResponse {
  rig: LightingRig
  fixtures: LightingFixture[]
}

export interface InventoryImportResult {
  categories_imported: number
  items_imported: number
  /** Which format the server detected the uploaded file as. */
  format?: 'll' | 'generic'
  /** Non-fatal notes about the file; the import still succeeded. */
  warnings?: string[]
}

// ---- Stage plots (Slice 13) ----
// All positions/dimensions are centimetres; the canvas renders
// 1 SVG user unit = 1 cm.

export type StagePlotView = 'top' | 'front' | 'side'
export type StagePlotElementKind = 'shape' | 'resource' | 'truss' | 'fixture'
export type StagePlotShapeKind = 'rect' | 'ellipse' | 'line' | 'text'
export type StagePlotLinkRole = 'assignment' | 'stack'
export type StagePlotEntityKind =
  | 'input_source'
  | 'input_channel'
  | 'output_device'
  | 'input_device'
  | 'stagebox'
  | 'stage_multi'
  | 'lighting_fixture'

export interface StagePlot {
  id: number
  event_id: number
  name: string
  sort_order: number
  grid_visible: boolean
  grid_size_cm: number
  snap_grid: boolean
  snap_objects: boolean
  show_fixture_name: boolean
  show_fixture_fid: boolean
  show_fixture_dmx: boolean
  active_view: StagePlotView
  /** @deprecated The view is one person's, and lives on their device — `usePlotView`,
   *  ROADMAP D3. Still returned by the API, read by nothing. */
  zoom: number
  /** @deprecated See `zoom`. */
  pan_x_cm: number
  /** @deprecated See `zoom`. */
  pan_y_cm: number
}

export interface StagePlotLayer {
  id: number
  plot_id: number
  name: string
  sort_order: number
  color?: string
  visible: boolean
  locked: boolean
}

export interface StagePlotLink {
  id: number
  element_id: number
  role: StagePlotLinkRole
  entity_kind: StagePlotEntityKind
  entity_id: number
  sort_order: number
  /** Resolved at read time; dangling links are never returned. */
  display_name: string
  fixture_number?: number
  dmx_universe?: number
  dmx_start_address?: number
}

export interface StagePlotElement {
  id: number
  plot_id: number
  layer_id: number
  kind: StagePlotElementKind
  shape_kind?: StagePlotShapeKind
  icon?: string
  truss_id?: number
  fixture_id?: number
  name: string
  x_cm: number
  y_cm: number
  z_cm: number
  width_cm: number
  depth_cm: number
  height_cm: number
  rotation_deg: number
  /** Front-view rotation (rake about the depth axis), degrees. */
  tilt_deg: number
  notes?: string
  links: StagePlotLink[]
}

/** Aligned states the true point-to-point distance; horizontal and vertical
 *  state the separation along one of the view's axes alone. */
export type MeasurementType = 'aligned' | 'horizontal' | 'vertical'

/**
 * One end of a measurement: EITHER a feature of one element's box
 * (`element_id` + `feature`) OR a free point in the view plane (`u_cm` +
 * `v_cm`) — never both, never neither.
 *
 * `feature` names a feature of the element's own box, not a vertex of its
 * drawn silhouette: `centre`, `corner:+-+` (signs on its local x/y/z axes),
 * or `face:+x`. The silhouette's vertex count changes with rotation, so an
 * index into it would come to mean a different corner after a rake.
 *
 * `slide` distinguishes a face anchor's two modes: false pins it to the
 * face's projected centre — the midpoint of that drawn side — and true lets
 * it sit anywhere along the face's line, stating the perpendicular distance.
 */
export interface MeasurementAnchor {
  element_id?: number
  feature?: string
  slide?: boolean
  u_cm?: number
  v_cm?: number
}

export interface StagePlotMeasurement {
  id: number
  plot_id: number
  layer_id: number
  /** The projection this measurement belongs to and is drawn in. */
  view: StagePlotView
  type: MeasurementType
  from: MeasurementAnchor
  to: MeasurementAnchor
  /** Holds the dimension line clear of what it measures, perpendicular to the
   *  measured direction; signed, so it flips. Never changes the value. */
  offset_cm: number
  note?: string
  sort_order: number
}

export interface PlotTrussPiece {
  id: number
  truss_id: number
  inventory_item_id?: number
  item_name?: string
  label?: string
  length_cm: number
  sort_order: number
}

/** Which lane of the truss a fixture hangs on, as seen in the top view. */
export type TrussSide = 'top' | 'middle' | 'bottom'

export interface PlotTrussFixture {
  id: number
  truss_id: number
  fixture_id: number
  /** Position along the truss from its left end; absent = unpositioned (legacy). */
  offset_cm?: number
  side: TrussSide
  fixture_number?: number
  fixture_name: string
  dmx_universe: number
  dmx_start_address?: number
}

/** Event-scoped: placed on plots by reference, counted once per event. */
export interface PlotTruss {
  id: number
  event_id: number
  name: string
  height_cm: number
  total_length_cm: number
  pieces: PlotTrussPiece[]
  fixtures: PlotTrussFixture[]
}

export interface StagePlotResponse {
  plot: StagePlot
  layers: StagePlotLayer[]
  elements: StagePlotElement[]
  measurements: StagePlotMeasurement[]
  /** All of the event's trusses, placed on this plot or not. */
  trusses: PlotTruss[]
}
