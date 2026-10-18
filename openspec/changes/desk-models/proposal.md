## Why

A console in PatchPlanner is a name, a role and four hand-typed counts. Nothing knows that an
M32R has 32 strips that pair odd–even, 8 aux inputs and 16 local inputs, or that an LV1 64 has 64
strips where a stereo channel is one strip. So the sheet counts rows instead of strips, a stereo
channel can start on an even number of an X32, and the event's real desk (the wedding's "M23R",
catalog item Midas M32R) is checked against nothing. Desk routing (Slice 48) and the showfile
export (Slice 49) both need the desk's model before they can allocate a single bus, so the model
comes first.

The user also ruled that a channel belongs to a desk: separate desks get separate lists, and only
the Flow canvas shows every desk at once.

## What Changes

- A console gains a **desk model** from an in-code list: X32 · X32 Compact · X32 Producer · X32 Rack
  · X32 Core, M32 · M32 Live · M32R · M32R Live · M32C, LV1 16/32/64/80, LV1 Classic 64/80, and
  **Generic**. Generic is exactly today's typed-count desk. Every existing console migrates as
  Generic, so nothing changes until someone picks a model.
- A real model **derives** the desk's strips, aux inputs, local in/out and mix pools; they are
  shown read-only. LV1 80 and LV1 Classic 80 add a **bus mode** (Groups / Monitors).
- **Stereo follows the model**: a linked odd–even pair on X32 · M32 ("5–6"), one stereo strip on LV1.
  Capacity counts **strips, not rows**.
- **X32 · M32 aux inputs are a second strip pool** (Aux 1–8), counted and listed separately; a row is
  put on aux only deliberately.
- **Hard block** on add and edit for a real model: a channel past the last strip, on a taken strip,
  or (X32 · M32) a stereo channel starting on an even number is refused inline, naming the desk,
  with a fix where one exists.
- **A model switch is previewed** (Left out / Changed / Moved / Fits again) and never blocked.
  Nothing is deleted: rows that no longer fit are kept and flagged **over**, and so are cables on
  local jacks the new desk lacks.
- **One desk per list.** The Inputs and Outputs sheets gain a desk selector; + Channel / + Output
  add to the selected desk. Rows with no desk get their own "No desk" entry and are put on a desk
  from there. A channel or output can no longer be saved without a desk, and can no longer be
  created on an event with no desk. **BREAKING** for API callers that relied on deskless rows.
- The catalog item may **suggest** a model ("Use M32R"); it never sets one.
- Outputs carry **no output-count cap** on any real model: X32 · M32 user out lifts the
  blocks-of-8 limit, so the limit is the physical sockets, which local jacks and stagebox cards
  already meter (user, 2026-10-18; replaces the mockup's "an output past 16").
- `design/` gains the approved amendments A1–A3 (from the export mockup, first built here) and
  B1–B4, B6, B7.

## Capabilities

### New Capabilities

- `console-desk-model`: the model list and its profiles, choosing a model on a console, the derived
  counts, bus mode, the catalog suggestion, the migration to Generic, and the previewed model switch.
- `console-strip-capacity`: how channels occupy a desk's strips: the channel and aux pools, stereo
  per model, strip counting, suggested numbering, the hard block and the over-capacity flag.
- `desk-scoped-patch-sheets`: the desk selector on the Inputs and Outputs sheets, adding to the
  selected desk, rows with no desk and placing them, moving a row between desks, and the
  requirement that every row is on a desk.

### Modified Capabilities

None. No capability in `openspec/specs/` describes consoles or the patch sheets.

## Impact

**Backend.** Migration `054_desk_models` (`event_consoles.desk_model`, `event_consoles.bus_mode`,
`input_channels.strip_pool`, and deskless rows put on the only desk of single-desk events).
`internal/domain` gains the model profiles; `internal/db/consoles.go`, `internal/db/audio_patch.go`
(`CreateInputChannel`, `UpdateInputChannel`, the output equivalents, `DefaultConsoleID` callers);
`internal/api/consoles.go` gains the switch/place endpoint and `GET /desk-models`;
`internal/api/audio_patch.go` gains the strip checks on channel and output create/update.

**Frontend.** `ConsoleSection.tsx`, `InputSheet.tsx`, `OutputSheet.tsx`, `AudioInputsTab.tsx`,
`AudioOutputsTab.tsx`, `AudioPatchShell.tsx`, `PatchStatusRail.tsx`, `lib/patchCapacity.ts`,
`lib/channelWidth.ts` (its two zero-caller helpers are replaced), `mobile/MobileChannelEditSheet.tsx`,
`mobile/MobileOutputEditSheet.tsx`, the input and output canvases' local jack panels (over-count
jacks), plus a model-switch dialog and a desk-selection hook.

**`design/`.** `components.md` §ui/Dialog (A1, A2), §ui/GearList (B3); `patterns.md` §1 (B6),
§2 (B7), §5 (A3, B1, B2, B4); `tokens.md` §7 (A2). Written in the same commit as the code.

**Downstream.** Slice 48 (`desk-routing`) reads the mix pools stored here; Slice 49
(`console-showfile-export`) reads the model, strip pools and numbering.

## Constitution Check — Principles I–V

**I. Domain-First Data Model.** Reinforced. A desk's model is a real-world fact that today's typed
counts only approximate; a stereo channel's footprint and an aux input are console concepts the
data now names (`desk_model`, `strip_pool`) instead of free numbers.

**II. Extensibility by Design.** The model list is data, one table of profiles; a new desk is a new
entry. Generic keeps every unlisted desk working exactly as today. Behaviour differs by **engine**
(x32, lv1, generic), not by model, so the 17 models are three code paths.

**III. Full-Stack Monorepo Architecture.** Unchanged. The profiles live once, in Go, and are served
to the frontend; the mapping that previews a switch is the function that applies it.

**IV. Inventory-Driven Rental Workflow.** Unaffected. The catalog item still records what is rented;
it can suggest a model but never sets one, because the item name is not proof of the licence.

**V. Pragmatic Simplicity.** No user-defined profiles, no editor for them, no new dependency. The
desk selection is per viewer in localStorage, like the remembered view. Two dead helpers in
`lib/channelWidth.ts` are replaced rather than kept beside the new ones.

### Declared deviation

The API now **refuses** a channel or output with no desk on an event that has one, and refuses any
channel or output on an event with no desk. Today both are legal and silent. The user decided this
(review of revision 2, 2026-10-18): a channel is always added to a desk.
