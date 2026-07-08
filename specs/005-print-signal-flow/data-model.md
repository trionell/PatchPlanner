# Data Model: Print & Signal Flow

**No database or API schema changes.** This slice is purely presentational; it reads the
existing `AudioPatchResponse`, `LightingRigResponse`, `Event`, and inventory item shapes
(see `frontend/src/types/index.ts`) and writes nothing. The only new "model" is a
client-side view-model produced by the signal-flow chain builder.

## View-model: `ChannelFlow` (frontend/src/lib/signalFlow.ts)

One `ChannelFlow` per `AudioPatchInput`, produced by
`buildChannelFlow(input, stageboxes, stageMultis, micNameById)`.

```ts
interface ChannelFlow {
  channelNumber: number        // mixer channel (always present)
  channelName: string          // '' when unnamed
  source: FlowHop              // mic/DI item name, legacy mic_label, or missing
  cable: FlowHop               // cable type + length; never missing (schema-required)
  path: FlowHop                // stagebox port, multi channel, or 'Direct to console'
  hasGap: boolean              // true if any hop is missing/incomplete
}

interface FlowHop {
  label: string                // human-readable hop text, e.g. 'SB1 · port 12'
  kind: 'source' | 'cable' | 'stagebox' | 'multi' | 'direct'
  missing: boolean             // true → rendered as a flagged gap (FR-008)
  detail?: string              // secondary line, e.g. connector or length
}
```

### Derivation rules (from research.md R4)

| Field  | Rule |
|--------|------|
| source | `mic_item_id` → inventory item name; else non-empty `mic_label` (legacy); else `missing: true` with label "No source picked" |
| cable  | `cable_type` as stored (vocabulary value/label; legacy values as-is), `detail` = `${cable_length_m} m` when > 0 |
| path   | `stagebox_id` set → kind `stagebox`, label from stagebox name + `stagebox_channel`; `stage_multi_id` set → kind `multi`, label from multi name + `stage_multi_channel`; neither → kind `direct`, label "Direct to console", **not** missing |
| path incomplete | box/multi chosen but channel number absent/0, or a channel number present without a box/multi → `missing: true` |
| hasGap | OR of all hops' `missing` |

### Invariants

- Pure function: same inputs → same output; no fetching, no mutation (FR-010, SC-005).
- Every input channel yields exactly one `ChannelFlow`; channels are rendered sorted by
  `channel_number` (same order as the inputs tab).
- Vocabulary values are displayed exactly as stored; no validation against
  `reference_values` (consistent with slice 4's legacy-display rule).

## Print sheets (no new data)

The sheet components are static projections of data already loaded by their tabs:

| Sheet | Backing data | Columns |
|-------|--------------|---------|
| Input patch (FR-001) | `AudioPatchResponse.inputs` + stageboxes/multis + mic names | Ch#, Name, Type, Connector, Source, Stand, Cable, Length, 48V, Routing (SB/multi + ch), DCA, Notes |
| Output patch (FR-002) | `AudioPatchResponse.outputs` + stageboxes/multis | Out#, Name, Type, Destination (+ SB/multi ch), Amp, Speaker, Cable, Length, Notes |
| Lighting rig (FR-003) | `LightingRigResponse` | #, Fixture, Truss, Universe, Address, Mode, Channels, Power (grid/chain + connectors), Notes |
| Signal flow (FR-007/009) | `ChannelFlow[]` | Ch#, Name, Source → Cable → Path → Console, gap flag |

Each sheet is wrapped in `PrintSheet`, which contributes the event header (name · venue ·
date, from the cached `['event', eventId]` query) and the empty-state line (FR-011).
