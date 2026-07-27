# Data Model: An inspector for the audio outputs flow graph

**Feature**: `026-output-flow-inspector` | **Date**: 2026-07-27

**No persisted entity changes.** No migration, no table, no column, no route.
`AudioPatchOutput` already carries every field the rail edits, and the three routes
it needs already exist and are already called by this tab. What follows is the
client-side shape of the one thing that does change.

---

## 1. `AudioPatchOutput` — unchanged, listed for reference

| Field | Type | Edited by the rail? |
|---|---|---|
| `id` | number | no |
| `event_id` | number | no |
| `output_number` | number | yes |
| `output_name` | string? | yes |
| `output_type` | string (vocabulary `output_types`) | yes |
| `color` | string? (vocabulary `channel_colors`) | yes |
| `width` | `'mono' \| 'stereo'` | yes |
| `notes` | string? | yes |
| `console_id` | number? | yes, only when the event has >1 desk |

Seven editable fields — the same seven the sheet's inline editor holds (SC-001).
The Desk field's condition matches the sheet's Desk *column*: shown only when
`consoles.length > 1`, because with one desk a picker with one option is clutter.

## 2. `OutputFlowSelection` — the one shape that changes

**Before** (`AudioOutputsTab.tsx:94`):

```ts
{ kind: PortRef['kind']; id: number } | null
```

**After**:

```ts
export type OutputFlowSelection =
  | { kind: 'output'; id: number }         // one row in a bus list — id is the OUTPUT's id
  | { kind: 'stagebox'; id: number }
  | { kind: 'stage_multi'; id: number }
  | { kind: 'device'; id: number }
  | { kind: 'console_local'; id: number }  // a desk's own jack panel — id is the DESK's id
```

Three things changed and each is deliberate:

1. **`output` is new.** A box is too coarse to say which row the rail edits, since
   a desk's bus list holds many (research.md R2).
2. **`mixer` is gone.** The desk box and the "No desk" box are no longer
   selectable; their rows are (research.md R3). This also removes a live
   ambiguity — a mixer *port*'s `id` is an output's id while the mixer *node*'s
   selection `id` was a desk's id.
3. **`device_link` is gone.** It was reachable through `PortRef['kind']` but was
   never a node — link ports are drawn on the device's own box, and the sheet's
   `openInFlow` already maps `device_link` → `device` before selecting.

**Lifetime**: session-only, held in `AudioOutputsTab`. It survives the Sheet/Flow
toggle and is gone on reload — it is where the planner is looking, not part of the
plan. Unchanged from Slice 25 in this respect.

**Invalid states now unrepresentable**: `{kind:'output', id: <a desk id>}` is still
writable by a caller that confuses the two, so the resolution is one-way — the rail
looks the id up in `outputs` and clears the selection when there is no such row
(research.md R9). That failure mode is *visible* (rail closes) rather than *wrong*
(rail edits the neighbouring output).

## 3. Derived, not stored

| Value | Derived from | Where |
|---|---|---|
| which rows are marked | `selection.kind === 'output' && selection.id === output.id` | `ConsoleNode` / `MixerNode` |
| where an output lands | `outputChainSegments(output, ctx)`, last segment per line | the rail's "Lands on" note |
| a row's tape colour on the canvas | `derivedOutputPortColor` (unchanged) | `wiringFor` |
| the next free output number | `max(output_number) + 1` over all outputs | the rail's Duplicate |

Nothing here is written to the row. In particular the rail does **not** store what
an output reaches: that is a walk over the cables, and storing it is what
Principle I's "traversable connections, not free-text fields" forbids.

## 4. Relationship to the sheet's `OutputDraft`

The sheet's inline editor holds an `OutputDraft` — a whole-row copy edited then
saved on Save. **The rail holds no draft.** Each field mutates the row directly
(research.md R7), so there is no second copy of a row that could be stale, and the
two views cannot disagree about which one is authoritative: the server is.

This is the one place the rail deliberately differs from the sheet rather than
matching it, and the reason is the interaction, not the data: the sheet edits a
row at a time with the keyboard (Enter saves, Escape reverts, which needs a draft),
the rail edits a field at a time with the pointer (which does not).
