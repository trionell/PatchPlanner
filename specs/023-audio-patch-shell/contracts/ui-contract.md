# Contract: Desktop UI — the audio patch shell

**Feature**: `023-audio-patch-shell` | **Date**: 2026-07-26

A user-facing contract, following the precedent of
`specs/021-mobile-friendly-redesign/contracts/mobile-ui-contract.md`. The
authority for layout is the approved mockup
`https://claude.ai/code/artifact/f90ed9ba-5dff-49de-b9ad-3cf9ca555d2e`; this file
pins the parts that must not drift during implementation.

Applies to the desktop branch only (`useIsMobile() === false`). Existing tokens:
ground `#09090b`, panel `zinc-900`, `zinc.850 #1f2028`, border `zinc-800`,
accent amber `#f59e0b`, Inter.

## 1. The toolbar

One bar, one row, six slots, identical on both tabs:

```
[ Sheet | Flow ]   [ Find a channel… ]        [ Rig ▾ ] [ Buses ▾ ] [ Print ] [ + Channel ]
└ segmented        └ grows to fill            └ right-aligned group
```

| Slot | Inputs | Outputs |
|---|---|---|
| view toggle | Sheet / Flow | Sheet / Flow |
| search placeholder | `Find a channel…` | `Find an output…` |
| drawers | Rig, Buses | Rig only |
| add | `+ Channel` | `+ Output` |
| zoom controls | Flow view only, between search and Print | same |

Contributor/viewer: the drawer buttons and the add button are **not rendered**.
The view toggle, search and Print remain.

## 2. Sheet columns

Inputs: `Ch` · `Name` · `W` · `Chain` · `48 V` · `Buses` · `Notes`
Outputs: `Out` · `Name` · `Type` · `W` · `Chain` · `Notes`, plus `Desk` between
`Name` and `Type` **only when the event has more than one console**.

Rules:

- `Chain` is the only wide column and the only one that grows.
- Every hop in `Chain` is its own click target; the separator between hops is
  `→` and is not clickable.
- A stereo pair is one row; its jacks read as a range (`SB1 : 6–7`).
- A missing link renders as text in the error colour in place of the hop
  (`no source`, `not patched`), never as an empty cell.
- Truncation removes middle hops; the first and last hop always render.
- Clicking a row (not a hop) opens the row editor in place, spanning the full
  table width, containing only the row's own fields plus an
  `Edit in Flow →` link.

## 3. Status rail

One line directly under the table, three states:

| State | Reads |
|---|---|
| complete | `16 channels · desk SD10 · 16 / 96 in · SB1 8/32 · SB2 6/16 · local 2/8 · 22 cables picked` |
| gaps | same, plus `Ch 16 Playback L/R has no source` and a `Show only gaps` action |
| over capacity | `40 channels · desk CL5 takes 32 — 8 channels have nowhere to land` and an `Open Rig` action |

The state badge (`complete` / `1 gap` / `over capacity`) leads the line. Over
capacity wins over gaps when both apply.

## 4. Drawers

Right-anchored overlay panels, one open at a time, Escape closes.

- **Rig** — wide. Sections in signal order: `Consoles`, `Stageboxes`,
  `Stage multis`, `Processing & destinations`. Each entry is a summary line
  (name · item · rental/owned, then its capacity and its `used` figure) with an
  `Edit` action that reveals the existing form in place. Footer states
  `Every row here is one line on the rental order · N items`.
- **Buses** — narrow, Inputs tab only. `Groups` then `DCAs`, each chip showing
  its assigned channel count; `LR` is marked `built-in` and has no delete.

Both drawers are reachable from the Flow palette as well as the toolbar.

## 5. Flow — source rail row anatomy

One 20px row per mono source; a stereo source is 40px (two port slots).

```
│▌ Kick In              Beta 91A          ▬  ●
 └tape  └name (ellipsis) └model (dimmed)  │  └port, flush right
                                          └48 V, red bar
```

| Element | Rule |
|---|---|
| tape | full-height colour edge, 3px, the run's derived colour; grey until the run reaches a channel |
| name | truncates with ellipsis; the inspector holds the full one |
| model | mic or connector, dimmed |
| 48 V | red `#ef4444`, bar-shaped — never a circle, because every circle in the rail is a patchable port |
| port | flush right, filled in the run's colour, hollow when unpatched |
| stereo | ports stacked `L` over `R`, one cable each, tape spans both |

The rail scrolls inside its own lane; the rig and console lanes never move.

## 6. Flow — colour and line style

Two independent encodings:

| Encoding | Meaning |
|---|---|
| hue | which channel this run reaches (only when all reachable channels agree) |
| dash pattern | solid = physical cable, dashed-long = network hop, dashed-short + grey = reaches no channel |

Applied to: source tape, every cable stroke, every port dot along the path, and
the desk's channel row. Never to a node's border or fill.

## 7. Console node

Both canvases render each console as a named node:

```
FOH · SD10                    DESK
1  Kick In
2  Kick Out
…
⋯ 6 more
local in 1  · ch 15
────────────────────────────
local 1 / 8 · net 8 · 96 ch
```

Rows are the channels (input graph) or outputs (output graph) assigned to it;
local jacks follow after a divider; the footer states usage against capacity and
turns to the warning colour when over.

## 8. What must not change

- Every `if (isMobile)` branch stays first in its component and byte-identical.
- Print sheets keep working throughout; they converge on the Sheet's columns in
  pass 2 and gain the console's name in pass 3.
- Cable drag-and-drop gestures, zoom limits (`0.5`–`1.5`), and the cable
  info/picker dialogs keep their current behaviour.
