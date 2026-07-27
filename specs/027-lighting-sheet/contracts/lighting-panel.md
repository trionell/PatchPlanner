# Contract: the Lighting panel

What the surface is made of. Values come from `design/` — this document says
*which* brick, and the handful of things that are specific to this tab.

Read with [mockup.html](../mockup.html), which draws all of it.

---

## 1 · The panel

`ui/PatchPanel`, exactly as the audio tabs and Stage Plots use it. The bar, in the
canonical order (FR-073, `design/patterns.md` §1):

```
Lighting   [ 🔍 Find a fixture… ]   [Universes]   ⟵flex-1⟶   [Print]  [+ Fixtures]
```

- **No view toggle.** Lighting has one view, so it has no trough. Adding a second
  view later adds one; inventing one now would be a control that means nothing.
- **`+ Fixtures`** is the only filled button on the surface.
- Search is `Input size="sm"` with the `Search` icon inset, matching
  `AudioPatchShell` line for line.
- A read-only role gets no `Universes` and no `+ Fixtures` — the caller passes no
  handler (FR-079).

## 2 · The sheet

`ui/SheetTable`. Nine columns (FR-004), no control in a closed row (FR-003).

| # | Head | Cell | Notes |
|---|---|---|---|
| 1 | `FID` | `NumCell` | amber when the console ID is duplicated, `title` explains |
| 2 | `Fixture` | `SheetCell` | name in `text-zinc-100`; model after it in `font-mono text-[11px] text-zinc-500` — a model is an equipment identifier (`design/tokens.md` §4) |
| 3 | `Mode` | `SheetCell` `text-zinc-500` | free text, whatever is on the fixture |
| 4 | `Univ` | `NumCell` | |
| 5 | `Addr` | `NumCell` | zero-padded span `049–064`; states in §3 |
| 6 | `Ch` | `NumCell` | |
| 7 | `Truss` | `SheetCell` `text-zinc-500` | `DS Truss · 120 cm`, read-only (FR-008) |
| 8 | `Power` | `SheetCell` `text-zinc-500` | `grid schuko`, or `chain ← 101` with `Link2` in `text-amber-400` |
| 9 | `Notes` | `SheetCell` | `max-w-48 truncate text-zinc-500` |

Rows are ordered by `position_index` then `id` — the order the API already
returns — and the row ordinal and DMX chain columns are gone (FR-010, FR-074).

Empty values render `—` in `text-zinc-600` (FR-011).

### 3 · The address cell's four states

The one cell carrying the map's whole vocabulary:

| State | Rendering |
|---|---|
| plain | `049–064` |
| shared | `049–064` + a badge `×3` — `font-mono text-[10px] text-zinc-400 bg-zinc-800 rounded-sm px-1 ml-1.5`, `title` naming the group. **Information, not a warning**: no amber, no red (FR-059) |
| clash | `text-red-400`, `title` naming the other fixture and its span |
| out of bounds | `text-red-400`, `title` saying it runs past 512 |
| unaddressed | `—` in `text-zinc-600` |

The shared badge is the node badge's treatment from `design/components.md`
(`graph/NodeShell`'s `badge`), reused because it means the same thing there: a
count that qualifies the thing beside it.

## 4 · The row editor

`event/RowEditor`, widened (§8). Fields as `FieldStack`s, in this order:

| Field | Width | Control |
|---|---|---|
| FID | `count` | `Input size="sm" type="number"` |
| Name | `grow` | `Input size="sm"` |
| Model | `default` | `Select size="sm"` over the event's lighting inventory |
| Mode | `short` | `Select size="sm"` of the model's modes, or `Input` when it has none |
| Ch | `count` | `Input size="sm" type="number"` |
| Univ | `count` | `Input size="sm" type="number"` |
| Addr | `count` | `Input size="sm" type="number"` |
| Power | `short` | `Select size="sm"` — grid / chain |
| Connector | `default` | `Select size="sm"` over `power_connectors` |
| Order | `count` | `Input size="sm" type="number"` |
| Notes | `grow` | `Input size="sm"` |
| Truss | `short` | read-only text + `Hang in plot →` hand-off (FR-017) |

Picking a mode copies **both** its name and its channel count onto the draft, and
a later catalog edit never rewrites the fixture (FR-016) — the behaviour
`FixtureModeCell` has today, moved into the editor.

## 5 · The add editor

The same construction at the foot of the sheet, with no delete (FR-061). Fields:
`Qty` · `Model` · `Name` · `From FID` · `Mode` · `Ch` · `Univ` · `Addr` ·
`Addresses` · `Power` · `Connector`.

- **`Qty`** defaults to 1; the confirm control reads `Add fixture` at 1 and
  `Add 12 fixtures` above it (FR-062).
- **`Addresses`** is a `Select size="sm"` — `consecutive` / `all share one`
  (FR-067). Only meaningful above quantity 1.
- The note line under the fields states the batch's demand against the universe's
  **largest free run** (FR-066), e.g.
  *12 fixtures need 192 channels · universe 2's largest free run is 240, from 273.*
  With `all share one` the demand is one fixture's width.

## 6 · The collision prompt

`event/AddressPrompt`, rendered in `RowEditor`'s `notice` slot — a full-width
block inside the editor's amber body, never a dialog (research.md R7).

```
border border-amber-500/40 bg-amber-500/[0.06] rounded-md px-2.5 py-2 text-xs
```

Amber, not red: this is a question, and the alert tints in `design/tokens.md` §5
give amber to "needs a decision" and red to "over capacity".

Content: what is in the way, by name and span, then the answers at `ml-auto`.

| Answer | Shown | `Button` |
|---|---|---|
| `Share address` | only on an exact match of start **and** count (FR-049) | `outline` `xs` |
| `Make room · moves N` | unless the ripple exceeds 512 (FR-048) | `outline` `xs` |
| `Place anyway` | always (FR-050) | `ghost` `xs` |
| `Back` | always (FR-051) | `ghost` `xs` |

When make room is impossible the button is **absent** and its reason is in the
sentence — a disabled control that does not say why is what P7 exists to prevent.

While the prompt shows, `⌘↵` does not save-and-advance (FR-053).

## 7 · The status strip

`event/LightingStatusRail`, built like `PatchStatusRail`: closes the panel from
inside, top border only, `px-3 py-2 text-[11px]`, ground *and* rule tinted.

| State | Tint | Pill |
|---|---|---|
| errors | `border-red-400/40 bg-red-500/[0.05]` | `N errors` in red |
| unaddressed | `border-amber-500/40 bg-amber-500/[0.05]` | `N unaddressed` in amber |
| clean | `border-zinc-800 bg-zinc-950/60` | `addressed` in emerald |

In **every** state, left to right after the pill: fixture count · per-universe
occupancy `U1 078/512 · U2 018/512` · shared group count · unaddressed count ·
duplicate console ID count. Then, in the two problem states, the first problem in
full, `+N more`, and the filter control (FR-054 – FR-058).

The shared count is present in all three states and never tints the strip — see
research.md R9.

## 8 · `RowEditor`, widened

Three optional additions, and one rename. All four audio call sites are updated in
the same commit.

| Change | Why |
|---|---|
| `onDelete` becomes optional | the add editor has nothing to delete |
| `onEditInFlow` / `editInFlowLabel` → `handoff?: { label, text, onSelect }` | lighting hands off to the **plot**, not to Flow; a prop named `onEditInFlow` that opens Stage Plots is a lie in the type |
| `notice?: ReactNode` | a full-width block inside the amber body, below the fields — participates in the flex flow so it cannot overlap a field at any width |

Nothing about the existing layout, spacing or keys changes; the audio editors
render byte-identically after the rename.

## 9 · The Universes drawer

`ui/Drawer` `narrow`, title *Universes*, subtitle *DMX allocation across the rig*.

**Section 1 — Universes.** Header carries the count and both operations as
`Button size="xs" variant="outline"`: `Auto-assign DMX`, `Optimise channels`. One
`GearCard` per universe in use:

- `GearTop`: name, an error `Pill` where the universe has problems, occupancy
  `078 / 512 ch` right-aligned in mono;
- `Meter` — **draws nothing at zero occupancy** (FR-070);
- `GearSpecs`: fixture count · free · `largest run N from M` · shared group count.

**Section 2 — Models in the rig.** One `GearCard` per catalog model: name,
quantity, and specs `mode · N ch` and `N ch total` (FR-071).

**Footer** states what the two operations do and how they differ (FR-072):

> **Auto-assign** repacks each universe from address 1 in rig order ·
> **Optimise** keeps the order you set and closes the gaps · both keep every
> fixture in its own universe, and fixtures that share an address stay sharing

Each operation confirms before running, stating what it will change, and reports
which universes were changed and which were skipped (FR-041, FR-037).

## 10 · What must not change

Asserted by the gates in [quickstart.md](../quickstart.md), not by inspection:

- `components/ui/` — `PatchPanel`, `SheetTable`, `Drawer`, `GearList`, `Button`,
  `Input`, `Select`, `Label`, `Tabs`, `Card`, `Table`, `Badge`. **Only
  `event/RowEditor` changes**, and only by addition.
- The audio tabs, the stage plot tab, and everything under `event/graph/`.
- `mobile/MobileFixtureEditSheet` and `mobile/MobileEntityList` — the phone view
  keeps its list-and-sheet editor (FR-080).
- `print/LightingRigSheet` (FR-081).
