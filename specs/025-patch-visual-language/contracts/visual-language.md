# Contract: the audio surface's visual language

**Feature**: `025-patch-visual-language` | **Date**: 2026-07-26

The binding values, per element, so "follow the mockup" can be reviewed instead of
argued about. Derived from the mockup's own stylesheet (research.md R5–R9) and
carried across from its 11 px base to this app's 14 px by the ratios in R11.

Where a column says **exact**, the mockup's value is used unchanged because it is
not type-relative — a border width, a corner radius, an alpha. Where it says
**carried**, the value is the mockup's ratio applied at this app's base size.

---

## 1. The framed panel — `ui/PatchPanel.tsx`

One bordered, once-rounded frame holding a bar and the content. Replaces the
toolbar's `mb-4`, the content's own `rounded-xl border`, and the status strip's
`mt-3 rounded-lg`.

The strip itself belongs to the **sheet**, not to the panel: the mockup shows it in
the Sheet view only, so a slot here would be an unused API. It closes the panel from
inside, with only a top border.

| Part | Value | Kind |
|---|---|---|
| frame | `rounded-xl border border-zinc-700 bg-zinc-950/40 overflow-hidden` | exact |
| bar | `flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2.5` | carried |
| bar title | `text-sm font-semibold text-zinc-100`, first, `mr-1` | carried |
| content | no padding, no border, no radius of its own | — |
| status strip (in `PatchStatusRail`) | `border-t px-3 py-2 text-[11px]` | carried |

The strip's two alert states tint the ground *and* the top border, as the mockup's
`.rail--warn` / `.rail--err` do:

| State | Border top | Ground |
|---|---|---|
| complete | `border-zinc-800` | `bg-zinc-950/60` |
| gaps | `border-amber-500/40` | `bg-amber-500/[0.05]` |
| over capacity | `border-red-400/40` | `bg-red-500/[0.05]` |

## 2. The sheet — `ui/SheetTable.tsx`

| Element | Value | Kind |
|---|---|---|
| `SheetHead` cell | `font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 font-medium whitespace-nowrap px-2 py-1.5 bg-zinc-950/60 border-b border-zinc-800 text-left` | carried |
| `SheetCell` | `px-2 py-1 align-middle text-xs text-zinc-200` | carried |
| row | `border-b border-zinc-800/60`; alternate rows `bg-white/[0.014]` | exact alpha |
| row, hover | `hover:bg-zinc-800/40` | carried |
| row, being edited | `bg-amber-500/[0.04]`, no bottom border | exact |
| `NumCell` | `font-mono tabular-nums text-zinc-400` | exact |
| `TapeBar` | `inline-block w-[3px] h-3.5 rounded-sm mr-1.5 align-middle`, `backgroundColor` the tape or `#3f3f46` | exact |
| `Pill` | `inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium` | carried |
| `PhantomBar` | `inline-block h-[3px] w-2 rounded-sm bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.65)]` | exact, unchanged |

`ui/Table` and `ui/Badge` stay exactly as they are: six other tabs use them and
FR-039 requires those unchanged.

## 3. The chain cell — `ChainCell.tsx`

| Element | Value |
|---|---|
| line | `flex flex-wrap items-center gap-x-1.5 font-mono text-[11px] text-zinc-300` |
| arrow | `→` as text, `text-zinc-600`, quieter than the hops |
| hop, clickable | `border-b border-dotted border-zinc-600 hover:text-zinc-100 hover:border-zinc-400` |
| hop, through the desk's own socket (`kind: 'desk'`) | `text-amber-300 border-b border-dotted border-amber-500/50` |
| hop, missing | `text-red-400`, no underline — nothing to click |
| tail (the row itself) | `text-zinc-500`, no underline |
| hidden count | `⋯N` in `text-[10px] text-zinc-500` |

The amber is not decoration: a hop through the desk's own socket is the one hop on
a chain that is **not** a billable cable. `patchSheet` already marks it
`kind: 'desk'`; this is the first surface to draw the distinction.

## 4. The canvas — `graph/LaneBands.tsx` + the panel's bar

| Element | Value | Kind |
|---|---|---|
| outer lane band | `bg-white/[0.022]` | exact alpha |
| middle lane band | `bg-white/[0.012]` | exact alpha |
| gutters between bands | transparent, no border | — |
| lane label | `absolute top-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600`, inside its own band | carried |
| zoom control | in the panel's bar: two `h-7 w-7` ghost buttons around a mono `text-[11px]` percentage that resets on click | carried |

No strip between the bar and the canvas. The dashed left/right borders currently
marking the lanes are removed — a band is the marking.

## 5. The nodes — `graph/`

| Element | Value | Kind |
|---|---|---|
| `NodeShell` | `rounded-[7px] border border-zinc-700 bg-zinc-850 shadow-[0_2px_8px_rgba(0,0,0,0.4)]` | exact |
| `NodeShell`, desk | border `border-amber-500/55` | exact |
| `NodeShell`, selected | border `border-amber-500` + `ring-2 ring-amber-500/30` | exact |
| header | `flex items-center gap-1.5 px-1.5 py-1 border-b border-zinc-800 text-[11px] font-semibold text-zinc-100` | carried |
| badge | `ml-auto font-mono text-[10px] text-zinc-400 bg-zinc-800 rounded-[3px] px-1` | carried |
| ports container | `py-1`, no horizontal padding — rows own theirs | exact |
| `PortRow` | `flex items-center gap-1.5 h-[18px] px-1.5 text-[11px] text-zinc-300`; `align="right"` reverses it | carried |
| `SplitPortRow` | `flex items-center justify-between h-[18px] px-1.5 text-[11px]`, two spans, in port leftmost, out port rightmost | carried |
| footer | `border-t border-zinc-800 px-1.5 pb-1 pt-0.5 font-mono text-[10px] text-zinc-500`; red when over capacity | carried |
| `PortDot` | `h-[7px] w-[7px] rounded-full border border-zinc-500 bg-zinc-800`; patched → `border-amber-500 bg-amber-500/75`; coloured → border the colour, background the colour at 75%; selected → solid colour, `ring-2 ring-amber-500/40` | exact |
| port truncation | **none** — every port is drawn | overruled |

`PortDot` keeps a hit area larger than its 7 px paint, as a transparent padded
button wrapping the painted dot — because a 7 px target is not clickable and the
mockup is a picture rather than something anyone had to hit. The padding must not
paint: putting the border and background on one padded element renders a 15 px dot,
which is what the third field test reported as "too big".

**Truncation is overruled by the reporter.** The mockup ends a long port list with a
`⋯ N more` row and this contract originally required it at eight rows. A planner
working a patch has to see every jack, so boxes now draw all of them and grow;
the canvas scrolls. `MoreRow` and `visiblePorts` were deleted rather than left
unused.

## 6. The sources rail — `InputGraphCanvas.tsx`

| Element | Value | Kind |
|---|---|---|
| rail body | `NodeShell`, scrolls internally, `max-h-[420px]` | — |
| header | `flex items-center h-5 px-1.5 bg-zinc-950/60`; label `font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400`; count `ml-auto font-mono text-[10px] text-zinc-600` | carried |
| row | `flex items-center gap-1.5 pr-1.5 border-b border-zinc-800/60 text-[11px]`; height computed as 20 px **per port**; last row no border | carried |
| row tape | `w-[3px] self-stretch shrink-0`, the derived colour or `#3f3f46` | exact |
| row name | `flex-1 min-w-0 truncate pl-1`; `text-zinc-400` when the source reaches no channel | carried |
| row model | `font-mono text-[10px] text-zinc-500 max-w-[4.5rem] truncate shrink-0` | carried |
| row 48 V bar | as `PhantomBar`; off → `bg-zinc-700`, no glow | exact |
| row, stereo | two 20 px port slots stacked, side label `font-mono text-[9px] text-zinc-600` | carried |

The row height is computed from the port count rather than set by a class, because
two competing height utilities in one class string are resolved by whichever Tailwind
emits last — which is how the stereo rows shipped at mono height with their two dots
overlapping.
| row, selected | `bg-amber-500/10`, name `font-semibold text-zinc-50` | exact |
| footer | `flex items-center h-6 px-1.5 bg-zinc-950/60`, holding `+ Source` | carried |

Two mockup details deliberately **not** followed, per research.md R10: the
`drag to reorder` hint (sources are not drag-reorderable and this slice does not
add it, so the hint would be a lie) and `Rio3224 · SB1` in a stagebox header (the
model truncates at node width; it stays legible in the Rig drawer).

## 7. The inspector — `InputFlowInspector.tsx` (values now in Slice 26)

> **Superseded, in one direction only.** Slice 26 gave the outputs canvas a rail too
> and extracted these five parts into `graph/InspectorRail.tsx`, so the binding values
> live in `specs/026-output-flow-inspector/contracts/inspector-rail.md` §1. That table
> is the one to edit; this one records what Slice 25 established and is kept because
> the *reasons* below are Slice 25's findings, not Slice 26's. The values are
> unchanged — Slice 26 moved them, it did not touch them. `FlowInspector.tsx` is
> `InputFlowInspector.tsx` since Slice 26.

| Element | Value | Kind |
|---|---|---|
| rail | `w-60 shrink-0 flex flex-col gap-2.5 border-l border-zinc-800 p-2.5` — a left border, not a card | carried |
| header | `flex items-center gap-1.5`: `SOURCE` micro-label, kind pill, close `✕` at `ml-auto` | carried |
| name | a bold field, `h-7 text-sm font-semibold` | carried |
| field row | `grid grid-cols-[44px_minmax(0,1fr)] items-center gap-2`; the label **beside** its control | exact 44px |
| field label | micro-label, not uppercase-tracked as wide as a section heading | carried |
| note box | `rounded-[5px] border border-zinc-800 bg-zinc-950/60 p-1.5 flex flex-col gap-1` | carried |
| Reaches note | the channels reached, in mono, in the derived colour; then the port count and 48 V state in quieter mono | carried |
| Legend note | four rows, each an inline `<svg width="22" height="4">` line sample plus its meaning at `text-[10px] text-zinc-400` | exact |
| actions | `mt-auto flex gap-2`: Duplicate, then Delete in red | exact |

The legend's four samples, matching what the canvas actually draws:

| Sample | Means |
|---|---|
| solid, a channel colour | cable, reaching that channel |
| dashed `6 3`, a channel colour | network hop, reaching that channel |
| dashed `4 3`, `#71717a` | patched, reaching no channel |
| the red 48 V bar | phantom power on |

For a read-only role every field renders disabled and the actions are absent —
reading the patch is never restricted (FR-026).
