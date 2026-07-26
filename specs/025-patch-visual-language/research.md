# Research: The mockup's visual language, for real

**Feature**: `025-patch-visual-language` | **Date**: 2026-07-26

The mockup's own CSS is the specification for most of this slice, so a large part
of the research is reading it precisely and writing down what it actually says —
because "make it look like the mockup" is only actionable once the values are
enumerated. The rest establishes the two functional causes.

---

## Part 1 — Selection (US1)

### R1. Why Edit in Flow forgets the row

**Finding**: The reporter's diagnosis is exactly right and one line long.
`AudioInputsTab` wires the sheet's callback as

```tsx
onEditInFlow={() => setView('flow')}
```

The `SegmentNode` the sheet computed and passed is discarded by an arrow function
that ignores its argument. Slice 24 added `firstChainNode` and wired the button;
what it never did was give the tab anywhere to put the answer.

The canvas cannot receive it either: `InputGraphCanvas` owns
`const [selection, setSelection] = useState<FlowSelection | null>(null)`, so the
selection is private to a component that is unmounted while the sheet is showing.

**Decision**: Lift the selection to the tab and pass it down as a controlled
pair. The tab holds `selection` and `setSelection`; both canvases accept them as
props instead of owning state.

**Rationale**: FR-002 wants the selection to survive switching view in *either*
direction, and a child that is unmounted cannot survive anything. Lifting is the
smallest change that satisfies that, and it makes the sheet's button a plain
`setSelection(node)` rather than a message the canvas has to be taught to
receive.

**Alternatives considered**: A `pendingSelection` prop the canvas copies into its
own state on mount. Rejected: it needs an effect to sync, it loses the selection
on the way back to the sheet, and two sources of truth for one thing is how the
next drift starts.

### R2. Scrolling the selected source into view

**Finding**: The rail scrolls inside its own node
(`max-h-[420px] overflow-y-auto`), and the canvas already bumps a `railScroll`
tick on scroll so cables stay attached. Nothing scrolls it programmatically.

**Decision**: The selected `SourceRow` gets a ref and calls
`scrollIntoView({ block: 'nearest' })` when it becomes selected.

**Rationale**: FR-004, SC-002. `block: 'nearest'` is what avoids yanking the
whole page when the row is already visible.

### R3. Selection on the outputs graph

**Finding**: `AudioOutputsTab`'s canvas has no selection at all — no state, no
inspector, nothing marked. So `onEditInFlow` there has nowhere to land even once
R1 is fixed.

**Decision**: The outputs canvas gains the same controlled selection and marks
the selected node, and nothing more. No inspector.

**Rationale**: The mockup draws no outputs inspector, and inventing one would be
designing rather than following (spec Out of Scope). Selection alone makes the
button land, which is what FR-001 asks for.

---

## Part 2 — Colour on the outputs graph (US2)

### R4. Why every output port is grey

**Finding**: The reporter is right. The input canvas's `PortRow` calls
`derivedPortColor(port, colorContext)`; the output canvas's `PortRow` takes no
colour at all and hardcodes `text-zinc-300`. Slice 23 added `derivedCableColor`
for the *cables* on the output graph and stopped there, so a run's cable is
coloured and every port it passes through is not.

**Decision**: Extract the backward walk out of `derivedCableColor` into
`derivedOutputPortColor(kind, id, port, context)`, and define
`derivedCableColor(cable, ctx)` as that function applied to the cable's `from`
end. Thread it into the output `PortRow` exactly as the input one does.

**Rationale**: FR-007 to FR-009. The two are the same question — "which output
does this belong to?" — asked from a port instead of from a cable, and
`derivedCableColor` already contains the whole answer including the same-index
pass-through pairing and the cycle guard. Reusing it means the cable and the
ports it joins can never disagree.

**Note on the agree-or-neutral rule**: the input side needs it because a source
can fan out to several channels, so `derivedPortColor` returns a colour only when
every reachable channel agrees. The output side needs no such rule: walking
*backward* from any port yields exactly one origin. A mixer port fanning out to
several destinations still gives each of them the same one colour.

---

## Part 3 — The mockup's values, enumerated

Read from the mockup's stylesheet. Recorded here because "follow the mockup"
cannot be implemented or reviewed without them, and because the app's own base
type size is 14 px against the mockup's 11 px, so each value has to be carried
across as a ratio rather than copied (spec Assumptions).

### R5. The framed panel

| Part | Mockup | Currently |
|---|---|---|
| Toolbar | `.bar` — `padding: 10px 12px`, `gap: 8px`, `border-bottom: 1px solid #27272a`, holds the tab's own name at 13px/600 | a free-floating row with `mb-4` |
| Content | table or canvas, flush against the bar | a separate `rounded-xl border-zinc-700` card |
| Status strip | `.rail` — `padding: 7px 12px`, `border-top: 1px solid #27272a`, `background: #101013`, `font-size: 10px`; `--warn` and `--err` variants tint the ground and the top border | a separate `mt-3 rounded-lg` card |

**Decision**: One `PatchPanel` wrapper: bordered, rounded once, with a bar slot, a
content slot and a rail slot. Both views render inside it.

**Rationale**: FR-010, FR-011, SC-006. This is the single largest visual
difference and the cheapest to fix, and it is what makes the view toggle change
only the content.

### R6. The sheet's table

| Element | Mockup | Currently |
|---|---|---|
| `th` | mono, 8.5px, uppercase, `letter-spacing: 0.14em`, `#71717a`, `padding: 7px 8px`, `background: #101013`, `border-bottom: 1px solid #27272a`, nowrap | `px-3 py-3`, sans, `font-medium`, `text-zinc-400`, on `bg-zinc-900` |
| `td` | `padding: 4px 8px`, `border-bottom: 1px solid #17171a`, `vertical-align: middle`, `#e4e4e7` | `px-3 py-3`, `align-top` |
| stripe | `rgba(255,255,255,0.014)` on alternate rows | `odd:bg-zinc-900 even:bg-zinc-850` |
| numbers | `.num` — mono, `font-variant-numeric: tabular-nums`, `#a1a1aa` | mono, not tabular |
| tape | `.tape` — a `3px × 14px` rounded bar inline before the name | `boxShadow: inset 3px 0 0` on the number cell |
| chain | `.chain` — mono 10px `#d4d4d8`, `gap: 5px`; `i` arrow `#52525b`; `u` dotted underline `#52525b`; `b` amber `#fcd34d` with an amber dotted underline | sans, arrow icons, no underlines, no amber |
| pills | `.chip` — `padding: 1px 7px`, `font-size: 9.5px`, `font-weight: 500`, `border-radius: 999px` | `Badge` at `px-2.5 py-0.5 text-xs` |
| 48 V | `.dot48` — `8 × 3px` red bar with a glow | already correct |

The `b`-versus-`u` distinction is worth naming: in the mockup a hop through the
desk's own socket is **amber**, and a hop through rented gear is grey with a
dotted underline. That is a real distinction — one is billable, the other is the
desk you already have — and the app currently draws them identically.

**Decision**: A `SheetTable` set of primitives carrying these, replacing the
generic `ui/Table` inside the audio sheets only. `TapeBar` and `NumCell` become
named things rather than inline styles.

**Rationale**: FR-012 to FR-017. The generic `ui/Table` is used by six other tabs
that must not change (FR-039), so this cannot be done by editing it.

### R7. The canvas chrome

| Element | Mockup |
|---|---|
| lanes | tinted vertical bands — `rgba(255,255,255,0.022)` for the outer lanes, `0.012` for the middle, transparent gutters between; label `.cvs__lane` mono 8.5px, `letter-spacing: 0.18em`, `#52525b`, `position: absolute; top: 6px` inside the canvas |
| zoom | in `.bar`, as two ghost buttons around a mono percentage |
| add controls | `.cvs__add` — absolutely positioned at the bottom of the lane they add to |

Currently: lane labels are a `grid-cols-3` strip *above* the canvas, next to the
zoom control; lanes are marked by dashed left/right borders with a flat
`bg-white/[0.02]`.

**Decision**: Bands become absolutely-positioned tinted divs with the label
inside each; the zoom control moves into the panel's bar via the existing
`toolbarExtras` slot, which was added for exactly this and is unused.

**Rationale**: FR-019, FR-020. The strip between toolbar and canvas is the thing
that breaks the one-panel reading.

### R8. The nodes

| Element | Mockup | Currently |
|---|---|---|
| `.node` | `border-radius: 7px`, `border: 1px solid #3f3f46`, `background: #1f2028`, `box-shadow: 0 2px 8px rgba(0,0,0,0.4)` | `rounded-lg` (8px), `border-zinc-700`, `bg-zinc-900`, `shadow-lg` |
| `.node--desk` | `border-color: rgba(245,158,11,0.55)` — the desk wears an amber border | no distinction beyond a `DESK` badge |
| `.node--sel` | amber border plus a `2px` amber ring | nothing |
| `.node__hd` | `padding: 3px 6px`, `font-size: 10px`, `font-weight: 600`, `border-bottom: 1px solid #27272a` | `px-2 py-1.5`, `text-xs font-semibold` |
| `.node__badge` | mono 8px, `#a1a1aa`, `background: #27272a`, `border-radius: 3px`, `padding: 0 4px` | a full `Badge` pill |
| `.node__ports` | `padding: 3px 0` — rows own their horizontal padding | `space-y-1 p-2` |
| `.prow` | `height: 18px`, `padding: 0 6px`, `gap: 5px`, `font-size: 9.5px`, `#d4d4d8` | no fixed height, `text-[11px]`, `gap-1.5` |
| `.prow--split` | `justify-content: space-between`, two spans — **one row per jack**, in port left, out port right | two independent columns of rows in a `grid-cols-2` |
| `.node__foot` | mono 8px, `#71717a`, `padding: 2px 6px 4px`, `border-top: 1px solid #1f1f24` | a `border-t` paragraph at `text-[10px]` |
| `.port` | `7px`, `border: 1px solid #71717a`, `background: #27272a`; `--on` amber; `--c` the run's colour | `h-3 w-3` (12px) |
| truncation | `⋯ 24 more` row in `#52525b` | none — the list runs on |

`.prow--split` is the one that matters beyond appearance: a pass-through's two
sides are the *same jack*, and drawing them as two independent columns means the
pair only lines up by luck. One row per index makes the pairing structural.

**Decision**: Extract `components/event/graph/` — `NodeShell`, `PortDot`,
`PortRow`, `SplitPortRow`, `MoreRow`, `LaneBands` — and delete both canvases'
private copies.

**Rationale**: FR-027, FR-036. The two canvases each hold their own `NodeShell`,
`PortDot` and `PortRow`, which is precisely why they drifted; sharing them makes
SC-004 true by construction rather than by care. Their `PortRef` unions differ,
so the shared components take a structural port type and a `colorOf` callback —
the same shape of seam that let `DeviceSection` be shared in the last slice.

### R9. The sources rail

The item the reporter singled out. From `.srail`:

| Element | Mockup |
|---|---|
| rail | `background: #1f2028`, header and footer `#101013` |
| `.srail__hd` | `height: 20px`, `padding: 0 6px`; `b` = mono 8.5px uppercase `0.14em` `#a1a1aa`; count mono 8px `#52525b`, `margin-left: auto` |
| `.srow` | `height: 20px`, `gap: 5px`, `padding: 0 6px 0 0`, `border-bottom: 1px solid #1a1a1e`, `font-size: 9.5px`, `#d4d4d8`; last row no border |
| `.srow__tape` | `width: 3px`, **`align-self: stretch`** — full row height, not a centred pip |
| `.srow__nm` | `flex: 1`, truncate, `padding-left: 3px`; `#a1a1aa` when the source reaches nothing |
| `.srow__md` | mono 8px, `#71717a`, `max-width: 58px`, truncate |
| `.srow__pip` | `7 × 3px` red bar with a glow; `#2f2f36` when off |
| `.srow--st` | `height: 40px`; `.srow__ports` a column of two `20px` `.srow__p`, each with a mono 7px `em` side label |
| `.srow--sel` | `background: rgba(245,158,11,0.1)`, name `600`, text `#fff` |
| `.srail__ft` | `height: 24px`, `+ Source` at 18px, a mono 8px hint right-aligned |

Currently: the tape is `w-[3px]` but inside a `gap-1.5` flex with `rounded`, the
name/model sizes are one step large, the 48 V bar is correct, the stereo side
labels are `text-[9px]` not mono-7, rows have no fixed height or separator, the
selected row is `bg-zinc-800` rather than an amber tint, and the rail has no
footer — `+ Source` is elsewhere on the canvas.

**Decision**: Rebuild `SourcesNode`/`SourceRow` to the table above, with the rail
keeping its own scroll container and `railScroll` tick.

**Rationale**: FR-032 to FR-035. The tape being full-height is the single most
visible difference and a one-property fix (`align-self: stretch`, i.e.
`self-stretch`).

### R10. What the mockup gets wrong, and is not followed

Two places where the mockup is out of date rather than aspirational, recorded so
they are not "fixed" into regressions:

- It draws a **`Sources` header with `14`** and a **`drag to reorder`** hint.
  Sources are not reorderable by drag in this app and this slice does not add it,
  so the hint is dropped rather than implemented as a lie. The count is kept.
- Its stagebox node shows `Rio3224 · SB1` — the model *and* the name. The app
  stores both; the header shows the name and the model would truncate at node
  width, so the model stays in the Rig drawer where it is legible. The badge
  (`SB`) is kept.

Also: the mockup's own prose says "the shipped canvas is already better than the
mockup I showed you" about the consolidated rail. That remains true of the
*structure*; this slice is about its finish.

### R11. Type sizes, carried across rather than copied

The mockup runs at an 11 px base; the app runs at 14 px. Carrying the ratios:

| Role | Mockup | Ratio | This app |
|---|---|---|---|
| micro-label (headings, lane names, port counts) | 8.5px | 0.77 | `text-[10px]` mono, uppercase, `tracking-[0.14em]` |
| port row, source row, chain | 9.5–10px | 0.9 | `text-[11px]`, mono for chain and ports |
| table cell | 10.5px | 0.95 | `text-xs` (12px) |
| node header | 10px + 600 | 0.9 | `text-[11px] font-semibold` |
| node footer, model, badge | 8px | 0.73 | `text-[10px]` mono |
| row height (`.srow`, `.prow`) | 20px / 18px | 1.8 × base | `h-5` / `h-[18px]` |

**Decision**: These land in one place — `components/event/graph/tokens.ts` for the
canvas and the panel primitives for the sheet — so the next slice that carries
this language elsewhere has one table to read rather than forty call sites.

**Rationale**: The spec's assumption that ratios bind and pixels do not is only
honest if the ratios are written down once.
