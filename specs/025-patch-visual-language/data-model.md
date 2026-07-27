# Data Model: The mockup's visual language, for real

**Feature**: `025-patch-visual-language` | **Date**: 2026-07-26

**No stored data changes.** No migration, no column, no endpoint, no payload
field. This document exists for two things that are still model-shaped: one new
derived value, and the state that had to move.

---

## The one new derived value

### `derivedOutputPortColor(kind, id, port, context)`

The colour of the output whose run passes through a given port on the output
graph, or `undefined`.

| Case | Result |
|---|---|
| the port is a `mixer` port | that output row's `color` |
| any other kind | walk backward to the cable landing on this node's matching input-side port, and recurse from its `from` end |
| the walk finds no inbound cable | `undefined` — the run cannot be traced to an output |
| the walk revisits a port | `undefined` — cycle guard, as before |
| the origin output has no `color` | `undefined` |

Pairing through a node uses the existing `pairedForward` rule, unchanged: same
index through a stagebox, a stage multi or a desk's local jack (they are physical
pass-throughs), and for a device the same index only when its two sides match in
count, else its sole output.

`derivedCableColor(cable, context)` is redefined as
`derivedOutputPortColor(cable.from_kind, cable.from_id, cable.from_port, context)`.
The two were always the same question; splitting them is what lets a port and the
cable attached to it never disagree.

### Why there is no agree-or-neutral rule here

The input graph's `derivedPortColor` returns a colour only when every channel the
run reaches agrees on one, because a source may fan out to several channels. The
output graph needs no equivalent: the walk goes *backward*, and a port has at most
one inbound cable, so there is exactly one origin. A mixer port that fans out to
several destinations gives every one of them the same colour, which is correct —
they are all carrying that output.

### Context

```ts
{ outputs: AudioPatchOutput[]; cables: OutputCable[]; devices: OutputDevice[] }
```

Unchanged from `derivedCableColor`'s existing context. Consoles are not needed:
a `console_local` port pairs same-index like any pass-through, so the walk passes
through it without having to resolve the desk.

---

## State that moves

| State | Was | Becomes | Why |
|---|---|---|---|
| which box is selected on the graph | `useState` inside each canvas | `useState` in each tab, passed down as `selection` + `onSelectionChange` | a canvas is unmounted while the sheet shows, so a selection it owns cannot survive the view toggle (FR-002), and the sheet has no way to set one it cannot see (FR-001) |

Deliberately **not** persisted, in `localStorage` or anywhere else: it is where the
planner is looking right now, not part of the plan. The chosen *view* is
remembered per tab per event, because that is a preference; a selection is not.

The canvases keep their own internal state for everything that is genuinely
theirs — zoom, the pending port mid-cable-gesture, the drag ghost, in-session
position overrides.

---

## Derived values that do not change

Restated so the restyle is not mistaken for a change of meaning:

| Value | Rule | Changed? |
|---|---|---|
| a port's colour on the input graph | `derivedPortColor` — agree-or-neutral across reachable channels | no |
| a source's tape colour | `derivedSourceColor` | no |
| which hop is a billable cable | `isCablelessEdge` / `isCablelessToKind` | no — but the chain cell now *draws* the distinction, in amber |
| a desk's capacity warning | declared count > 0 and usage above it | no |
| what reaches the rental order | `rentalSummaryQuery` | no |
| a chain's hops and their order | `inputChainSegments` / `outputChainSegments` | no |
| which node "Edit in Flow" targets | `firstChainNode` | no — it was already correct; the tab now keeps its answer |
