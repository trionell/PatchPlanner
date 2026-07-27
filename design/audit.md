# 05 · Audit

Where the application stands against [principles.md](principles.md) today, and the
order to converge it in.

Counts are from `frontend/src` at the merge of Slices 23–26 (`aa4baef`). Every one
is reproducible with the command given, so this document can be re-run rather than
believed. A finding closed by a wave moves to Part 1b with the wave that closed it;
the counts on the findings still open are the `aa4baef` ones and will move as the
waves land.

---

## Part 1 — Findings

### A4 · `rounded-lg` is not in the radius ladder · P3

```
grep -rho "rounded-\(xl\|lg\|md\)" --include='*.tsx' frontend/src | sort | uniq -c
#  56 rounded-md    13 rounded-lg    9 rounded-xl      (was 54 / 30 / 4)
```

The ladder is `xl` for a panel, `md` for a control ([tokens.md](tokens.md) §6).
`rounded-lg` sits between them and every use is one or the other.

Closed on the surfaces waves 1 and 2 own: `TabList`'s trough is gone entirely, the
brand tile — one mark appearing in three places, the sidebar, the mobile header and
Login — and `SectionSwitcher` are `md`, and the whole stage plot surface is now
either `xl` (a container) or has no frame of its own at all.

What remains, on surfaces later waves own: the inline form blocks in
`EquipmentTab`, `RentalTab`, `OwnedGearManager` and `Inventories`; `Dashboard`,
`EventInventoryCard`, `OverviewTab`'s stat tiles, `StartPage`.

**Fix:** case by case, but mechanically — a container of controls is `xl`,
a control is `md`. Each wave takes the ones on its own surfaces.

### A6 · Six surfaces are still card stacks · P1

`OverviewTab` · `EquipmentTab` (2 cards) · `LightingTab` · `RentalTab` ·
`SignalFlowTab` · and the `Card`-based pages.

Each renders `Card` → `CardHeader` → `CardTitle` + description → `CardContent` →
`Table`, stacked with `space-y-6`. This is exactly the arrangement the audio tabs
were built out of, for the reasons in P1.

Not all of them are wrong. A card **list** — `Events`, `Inventories`, `Dashboard` —
is many independent objects and stays. A card **stack**, where one page's controls
are split across two or three headers, becomes one panel.

### A7 · Work-surface data is rendered on the navigation-surface table · P2

By P2's question, these are work surfaces and are currently built with `ui/Table`
(`px-3 py-3`, `text-sm`, `align-top`, `odd:bg-zinc-900 even:bg-zinc-850`):

| Surface | Rows in a real event |
|---|---|
| Lighting fixtures (`LightingTab`) | 40–200 |
| Rental order lines (`RentalTab`) | 50–300 |
| Equipment lines (`EquipmentTab`) | 10–60 |
| Inventory items (`Inventories`) | 308 in the sample catalog |

The zebra striping is the tell: `odd:bg-zinc-900 even:bg-zinc-850` is a visible
banding pattern, where the sheet's `bg-white/[0.014]` is an aid you find when you
look for it. At 200 rows the first is noise.

### A8 · The lighting fixture table is a form, not a sheet · Patterns §2

```
grep -c "<Input\|<Select" frontend/src/components/event/LightingTab.tsx   # 24
```

Thirteen columns, and most cells hold a permanently-live `Input` or `Select` that
persists on blur. There is no read state at all, so the table cannot be scanned —
every value is inside a bordered control, and the eye has to parse chrome before it
reaches data.

This is the single largest gap between the target language and the code. The fix is
the sheet-plus-row-editor pattern, not restyling the controls.

### A9 · Navigation-tier chips inside work surfaces · P2

`ConsoleSection`, `BusSection` and `BusMultiSelect` render `ui/Badge`
(`px-2.5 py-0.5 text-xs`) inside the Rig and Buses drawers, which are work
surfaces. The sheet beside them uses `Pill` (`px-1.5 py-px text-[10px]`).

**Fix:** `Pill` in the drawers — a visual change, so it belongs to the wave that
converts the drawers, not to Wave 0.

> The half of this that was a *duplication* rather than a size is closed: the tint
> map now lives in `lib/vocabularyTint.ts` and both tiers read it (Wave 0). What
> remains is purely which tier the drawers render.

---

## Part 1b — Closed

### A1 · The micro-label had four definitions and two sizes · Wave 0

One definition, in `ui/Label.tsx`: `MICRO_LABEL` and the `MicroLabel` that renders
it. `SheetHeadCell`, `OutputSheet` and `GearList` import it; `graph/tokens.ts`
re-exports it so canvas code keeps one import for canvas values.

It moved out of `graph/tokens.ts` because it was never a canvas value — four call
sites across three layers were reaching into a canvas-only module for it, which is
the layering inversion `components.md` §5 exists to prevent.

### A2 · Nineteen buttons overrode their own size · Wave 0

`xs: 'h-7 px-2.5 text-xs'` added; 17 of the 19 overrides deleted.

The two that remain are `PatchStatusRail`'s, which are `h-6 px-2 text-[11px]` — a
control *inside* the strip, which has to match the strip's own type and must not
set the height of the bar closing the panel. A fifth `Button` size for two
co-located call sites in one component would be the abstraction, not the fix
(Principle V); they are `xs` plus an explicit delta, with the reason in the code.

### A3 · There was no `Textarea` · Wave 0

`ui/Textarea.tsx`, `sm` / `md` like `Input`, with `min-h` rather than `h` — a note
field is resized by the person writing the note. `OverviewTab` uses it.

### A11 · Fifty-seven inline form labels · Wave 0

`FieldLabel` in `ui/Label.tsx`, beside `MicroLabel` so that picking the wrong tier
takes a deliberate act. All 57 replaced across 10 files.

Not a `tier` prop on `FieldStack`, which was the other option considered:
`FieldStack` also owns column widths that only mean something inside a drawer's
wrapping form row, so a navigation-tier `FieldStack` would carry an API it must
never use.

### A5 · The chrome announced the page three times · Wave 1

Header title `text-2xl` → `text-base`, event name `text-xl` → `text-lg`, the tab
strip's trough gone, sidebar `bg-zinc-900` → `bg-zinc-950`. The loudest type on an
event page was the word "PatchPlanner". Values in [patterns.md](patterns.md) §6.

The header's height is now **stated** as `h-14` rather than emerging from a padding
plus a font size. That was not cosmetic: `StagePlotTab`'s sticky toolbar hard-coded
`top-[73px]`, the number that sum happened to produce, so shrinking the header
would have left the toolbar floating 17 px below where it belongs. A height a child
positions against has to be a value someone chose.

### A10 · A third toolbar idiom · Wave 2

`StagePlotTab` had neither a `PatchPanel` bar nor a `CardHeader`, and its plot
selector sat in a trough — which says *these are alternative views of one thing*,
and sibling plots are not that. The selector is now drawn as the page tabs above it
are, using `ui/Tabs`'s own `Tab`; the toolbar is the panel's bar in §1's order.

The tab is one frame: bar, then palette | canvas | inspector rail as three columns
of the same panel, where it used to be a floating sticky toolbar above three
separate rounded cards with gaps between them.

### A12 · A fifth micro-label the A1 grep never saw · Wave 2

A1 counted definitions matching `tracking-[0.1Ne m]`. Nine more were written as
Tailwind's named `tracking-widest` with `font-semibold` instead of mono — four in
`StagePlotInspector`, two in `StagePlotPalette`, two in `PlotTrussManager`, one in
`StagePlotTab`. All are `MicroLabel` now.

The lesson is about the audit, not the code: a grep that matches a *value* misses
every synonym of it. The check that would have caught this is "how many things
render an uppercase 10 px label", which no grep answers.

---

## Part 2 — Convergence order

Five waves. Each is a slice, in the order that maximises what the next one can lean
on. **No wave mixes a refactor with a redesign**, so a visual regression is always
attributable to the wave that caused it — the same reasoning that made Slice 26
rewire the inputs inspector onto the shared rail *before* building the output one.

### Wave 0 · Close the primitive gaps — **done**

A1, A2, A3, A11, and the duplicated half of A9. New: `ui/Label.tsx`,
`ui/Textarea.tsx`, `lib/vocabularyTint.ts`. Gone: `lib/patchTints.ts`.

This wave was planned as "no visual change". It isn't quite, and the honest
accounting matters more than the slogan — a later wave's regression is only
attributable if this list is exact. The whole visible delta is:

| Where | Change |
|---|---|
| Rig/Buses drawer section buttons (10) | `px-2` → `px-2.5`, the bound `xs` value — 1 px per side |
| `StagePlotInspector`'s Add / Cancel (2) | `h-6 px-3` → `h-7 px-2.5`, matching the `h-7` selects directly above them in the same form |
| Drawer micro-labels | `text-[9px]` → `text-[10px]` |
| `ZoomControl` (2) | `text-sm` → `text-xs` on buttons that contain only an icon — nothing renders differently |

Everything else is byte-identical after `twMerge`: `AudioPatchShell`'s three
buttons, `PatchStatusRail`'s two, `SheetHeadCell`, `Badge`, and every one of the
57 labels.

Gates run: `tsc -b`, `eslint`, `vitest` (179 pass), and the class strings compared
by computing `twMerge` on the before and after of each converted button rather than
by reading them — which is what caught the four rows above.

### Wave 1 · Chrome — **done**

A5, and A4 where it touches chrome. Smallest diff, largest perceived change. Every
later wave is now reviewed against a header that has stopped shouting.

Unlike Wave 0 this one *is* a redesign, so the whole point is that it changes what
you see. What it must not do is change any **tab**, and it doesn't — the only files
touched outside `Layout`, `ui/Tabs`, `SectionSwitcher` and `Login` are the two that
had hard-coded the chrome's dimensions:

| | Was | Now | Why it had to move |
|---|---|---|---|
| `StagePlotTab` sticky toolbar | `top-[73px]` | `top-14` | 73 px was the old header's height, written as a literal |
| `StagePlotCanvas` height | `calc(100vh-330px)` | `calc(100vh-295px)` | 35 px less sits above it — header 73→56, tab strip 46→28. Left at 330 the page grows a scrollbar it never had |

Both numbers were derived from the line-heights and paddings Tailwind actually
emits, not from memory — `text-xl` and `text-lg` share a 28 px line box, so the
event heading contributes nothing to the delta despite being a visible change.
Neither could be *measured*: there is no browser in the toolchain, so the stage plot
canvas is the one thing in this wave worth a human glance.

### Wave 2 · Stage plots — **done**

A10, A12, and A4 on this surface. The pattern transferred to a canvas that is
neither a sheet nor a list, and `PatchPanel` itself needed **no change** — but two
things around it did, which is exactly what this wave was ordered early to find:

| Component | Change | Why the third canvas forced it |
|---|---|---|
| `graph/ZoomControl` | optional `onZoomIn`/`onZoomOut`/`onReset` | Stage plots zoom ×1.25 over 0.05–20 and re-centre as they go, because that canvas is a scale drawing: a plotter gets from a whole stage down to one truss clamp. The audio canvases step ±0.1 over 0.5–1.5. Same look, different arithmetic — so the component owns the look and the caller may own the stepping, the same split `Legend` already uses. The audio call sites are untouched. |
| `graph/InspectorRail` | optional `className` | The flow canvases lay their row out `items-start`, so the rail is its own height and the row grows. The stage plot canvas is a fixed fraction of the viewport and stretches the rail, which then has to scroll. Both are right for their canvas. |
| `ui/Tabs` → `Tab` | optional `active`, context now optional | The plot selector means what the page tabs mean, so it should *be* one rather than copy its classes. It cannot use the context because picking a plot also clears the canvas selection. |

The canvas also lost `h-[calc(100vh-295px)]` for `h-[70vh] min-h-[560px]` — the
number Wave 1 had to re-tune, now gone rather than corrected. It was a sum of
chrome heights encoded in a string; the replacement cannot go stale, and it is the
idiom the mobile branch of the same tab already used.

**Not done, deliberately:** the bar is dense — view toggle, zoom, grid, grid size,
two snap toggles, trusses, scale note, print, fullscreen — and wraps to two rows on
a narrow window. Moving the grid and snap settings into the rail would fix that and
is probably right, but it changes where a plotter reaches for a tool mid-draw. That
is a workflow decision, and this wave is a restyle.

### Wave 3 · Lighting — A6, A7, A8

The big one, and the one worth doing properly: fixtures become a `SheetTable` with
a row editor, DMX and channel counts become `NumCell`s that line up, and the truss
column stops being a `Select` in every row.

Worth its own spec. It is a workflow change, not a restyle, and it is where a
technician will feel the design language most.

### Wave 4 · The remaining event tabs — A6, A7

`RentalTab`, `EquipmentTab`, `OverviewTab`, `SignalFlowTab`. All the same shape as
Wave 3 and much smaller. `OverviewTab` is a form rather than a sheet and only needs
the navigation tier applied consistently.

### Wave 5 · Pages and residue — A4, A6

`Dashboard`, `Events`, `Inventories`, `StartPage`, `Login`, `SettingsTab`.

These are mostly **already right** — they are navigation surfaces built with
navigation-surface components. The work is the radius ladder, the label component,
and confirming that the card lists that should stay card lists do.

---

## Part 3 — Keeping this true

- A slice that changes a value in [tokens.md](tokens.md) or
  [components.md](components.md) updates the document **in the same commit**. A
  design document that lags the code is worse than none, because it is quoted.
- A slice that closes a finding here strikes it from Part 1 and says which wave it
  was.
- A slice that establishes a *new* value writes it here first, and its own contract
  links back rather than restating it. That is the loop these documents exist to
  close: Slice 25 §7 → Slice 26 §1 → the next one would have been a third link in a
  chain nobody reads to the end.
