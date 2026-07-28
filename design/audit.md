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

**None. Every finding this document opened is closed** — see Part 1b, and the
wave that closed each. Part 2's five waves are done.

The audit is kept rather than deleted because Part 1b is the record of *why*
each surface looks the way it does, and because Part 3 is how the next finding
gets added.

---

## Part 1b — Closed

### A4 · `rounded-lg` is not in the radius ladder · Waves 1–5

```
grep -rho "rounded-\(xl\|lg\|md\)" --include='*.tsx' frontend/src | sort | uniq -c
#  56 rounded-md    0 rounded-lg   14 rounded-xl      (was 54 / 30 / 4)
```

Two textual occurrences remain and **both are inside comments** — `PatchPanel`'s,
describing the three-card layout it replaced, and `StartPage`'s, recording its
exemption. Nothing renders one.

**A4 was never a radius finding**, and that is the thing worth keeping. Seven of
its real uses were the same layout idiom — *a bordered block of fields floating
above a table* — which Waves 4 and 5 **deleted** rather than corrected, when the
row editor replaced it. Four were genuine one-line corrections. The radius was
how a layout habit showed up in a grep.

That is A12's lesson from the other side: a grep that matches a *value* finds
instances, not the reason there are instances.

### A6 · Card stacks · Waves 1–5

Every one converted. `LightingTab` (Wave 3); `OverviewTab`, `EquipmentTab`,
`RentalTab`, `SignalFlowTab` (Wave 4); `Inventories`' detail, `OwnedGearManager`,
`SettingsTab` and `MyDefaults` (Wave 5).

The card **lists** stayed lists, which was always the point of P1's exception:
`Events`, and the inventory list. The dashboard's five cards went entirely — it
was never a list of independent objects, it was one account described five times.

### A7 · Work-surface data on the navigation-surface table · Waves 3–5

Rental order lines, equipment lines, lighting fixtures, signal chains, inventory
items and owned gear are all `SheetTable` now. The last of them —
`Inventories`, at 308 rows in the sample catalog — was the largest table in the
application by row count and the list the whole rental order derives from.

Zebra striping is gone from every surface a technician scans.

### A9 · Navigation-tier chips inside work surfaces · Waves 0, 4, 5

The duplication half closed in Wave 0 (`lib/vocabularyTint`, read by both tiers).
The sizing half closed as each surface converted: `Pill` in the Rig and Buses
drawers, on Signal Flow's bus chips, on Equipment's source column, on the
inventory and vocabulary sheets.

`Badge` is now used only where it belongs — dialogs, the Events grid, the
dashboard's role marker, and the phone.

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

### A8 · The lighting fixture table was a form, not a sheet · Wave 3

The largest single gap in the application between the target language and the
code: thirteen columns, twenty-four permanently-live `Input`s and `Select`s, and
no read state at all, so the table could not be scanned. A6 and A7 were true of
the same surface — a `Card` stack, on the navigation tier — and all three are
closed on it together, because they were one problem wearing three names. A6 and
A7 stay open for the surfaces waves 4 and 5 own.

It is now `PatchPanel` → `SheetTable` → `RowEditor` → `LightingStatusRail`, with
nine columns, no control in any closed row, and a `Drawer` for the universes. Row
height went from ~90 px to 25 px.

The counts, before and after, on the surface itself:

| | Was | Now |
|---|---|---|
| Columns | 13 | 9 |
| Live controls in the closed sheet | 24 | 0 |
| Dialogs | 2 | 0 |
| Same-weight buttons in the toolbar | 4 | 1 primary |
| Fixtures visible at 900 px | ~7 | ~28 |

**What made this a slice rather than a restyle** is the thing the audit did not
predict: nothing in the application had ever had an opinion about a rig's DMX
addressing. Auto-assign packed each universe from address 1, so its own output was
always clean and a clash could only ever arrive by hand-editing afterwards —
silently. `lib/dmxMap.ts` and `lib/dmxPlan.ts` are that opinion, as pure functions
with 49 tests and no DOM.

The other surprise was in the opposite direction: **the backend got smaller.**
`AutoAssignDMX` was deleted rather than rewritten, because the browser has to
derive the map anyway and the three operations are that map plus an ordering. Go
kept the guarantee — one transactional endpoint that applies a plan whole or not
at all — and TypeScript kept the arithmetic (`specs/027-lighting-sheet/research.md`
R3).

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

### Wave 3 · Lighting — **done**

A6, A7, A8, and its own spec: `specs/027-lighting-sheet/`. The audit called it
"a workflow change, not a restyle", and that turned out to understate it — the
restyle was the smaller half.

| | Change | Why the rig forced it |
|---|---|---|
| `event/RowEditor` | `onDelete` optional; `onEditInFlow`/`editInFlowLabel` → `handoff { label, text, onSelect }`; new `notice` slot | Lighting hands off to the **stage plot**, not to Flow, so a prop named `onEditInFlow` was a lie in the type. The add editor has nothing to delete. The collision prompt needs a full-width block *inside* the editor's flex flow, so it cannot land on a field at some width. |
| everything else in `ui/` | **none** | asserted, not assumed: `git diff --stat -- components/ui components/event/graph` is empty for the whole wave |

`Meter` is the one place the wave wanted a change and did not take it. A universe
with nothing addressed in it must draw no bar (FR-070), and `Meter` withholds
itself only for an undeclared *capacity* — which is a different condition, since a
universe's capacity is always 512. The caller withholds it instead. Changing a
component four tabs share, to express a condition only one of them has, would have
been the abstraction rather than the fix.

**Not done, deliberately:** neither bulk operation can be undone, neither reorders
the rig, and neither can be run on a single universe. All three are listed in the
spec's Out of Scope with the reasoning.

### Wave 4 · The remaining event tabs — **done**

A6, A7 and A4 on `RentalTab`, `EquipmentTab`, `SignalFlowTab` and `OverviewTab`;
spec in `specs/028-event-tabs/`. The audit predicted "the same shape as Wave 3 and
much smaller", which held for three of the four and was wrong about the fourth.

| | Was | Now |
|---|---|---|
| Bordered frames across the four tabs | 5 stacked `Card`s | 3 panels + 1 card |
| Navigation-tier `ui/Table`s | 4 | 0 |
| Permanently-open add forms | 2 | 0 |
| Controls visible in a closed sheet | 2 per manual/owned row | 0 |
| `rounded-lg` | 5 | 0 |
| Facts Overview shows about the event | 7 | 24 |

**`OverviewTab` was the one the audit read wrong.** It was filed as "a form rather
than a sheet, needs the navigation tier applied consistently" — a styling note.
The user's answer to the mockup rejected that framing outright: *editing happens
in a drawer and the tab just shows the information*. That is not a restyle, and it
turned the smallest item in the wave into the largest. The tab is now a numbers
band, the rig drawn as the flow canvas one row high, and every work panel's own
verdict collected in one line.

Two things the wave found rather than planned:

**`RowEditor`'s hand-off had never rendered.** Wave 3 built the `handoff` slot and
`LightingSheet`'s `onOpenPlot` prop, and `LightingTab` never passed it, because
`EventDetail`'s desktop `Tabs` was uncontrolled and no child could reach the
selection. Wave 4 needed the hand-off three times, so `Tabs` gained an optional
controlled mode and the selection moved into `?tab=`. Lighting's *Hang in plot*
button renders for the first time.

**The summary is a derivation, not an endpoint.** The mockup proposed
`GET /events/{id}/summary` and the spec withdrew it: *2 gaps* is a walk over the
cable graph and *addressed* is a partition of identical spans, so a Go copy would
be a second implementation whose failure mode is Overview disagreeing with the
strip on the tab it links to. `lib/eventSummary.ts` calls the owning functions
instead, and 23 tests assert the agreement rather than hoping for it.

`components/ui/` changed in exactly one file, `Tabs.tsx`, and only by addition —
asserted by a diff. The canvases, the audio sheets, `LightingSheet`, Stage Plots,
the phone branches, the print sheets and the whole backend are untouched.

### Wave 5 · Pages and residue — **done**

A4, A6, A7 and A9, on `Inventories`, `OwnedGearManager`, `SettingsTab`,
`MyDefaults`, `Dashboard`, `Events`, `Login` and `StartPage`; spec in
`specs/029-pages-and-residue/`.

The audit called these "mostly already right", and for four of the eight that
held. It was wrong about three, and the third is the one it did not see at all.

| | Was | Now |
|---|---|---|
| `Card`s across the converted surfaces | 27 | 0 |
| Always-open add forms | 5 | 0 |
| Dialogs on the inventory page | 2 | 1 (the phone's filter) |
| Categories visible at once | ~4 of 12 | 12 |
| Inventory items on a 900 px screen | ~9 | ~30 |
| `rounded-lg` in the tree | 12 | 0 (two comments) |

**The inventory catalog was the miss.** It is the largest table in the
application by row count — 308 items in the sample price list, and the list the
entire rental order derives from — and the audit filed the page under "pages,
mostly already right". A6 named "the `Card`-based pages" without noticing that one
of them was a work surface wearing three cards.

**The dashboard was the second.** It was filed as a trim: delete three badges that
repeat their own labels and a card holding one button. The answer to the mockup
went further — *less card-y, and make it exciting, since that is the logged-in
landing page* — and the page lost cards entirely. The next show is drawn at full
size with its rig ribbon and readiness; everything else is a spine of dates.

**Two things came out of the wave rather than into it.**

`ui/PanelRail` was extracted before its second caller existed, which is a
deliberate exception to Principle V, defensible only because both callers landed
in the same wave two phases apart. The rule written into the plan was: if the
second caller needs a different shape, inline it back and delete the component.
It did not.

And the **In use** column is the mirror of a decision Wave 4 made the other way.
Overview's figures were derivations the browser already computes, so no endpoint;
a vocabulary value's usage is a `COUNT` over eight plan tables only the database
can see, and `countReferenceUsage` had guarded deletes since Slice 17. It is
*called*, not copied, so the number shown and the refusal that follows cannot
disagree — asserted directly by a Go test over every seeded value.

**Not done, deliberately:** no sorting or bulk edit on the inventory sheet
(import is the bulk path, which is how 308 items arrive), no rail on the phone,
and the start page is exempt (below).

---

## Part 2b — What this language does not cover

**The signed-out start page (`pages/StartPage.tsx`) is exempt**, recorded here in
Wave 5 rather than left as a permanently open finding.

It shares the brand mark, the amber accent and the type families with the
application, and nothing else: its `rounded-2xl` cards, radial-gradient grounds,
44 px mono display heading and animated patch bay are a different brief. A landing
page must be memorable to someone who has never seen the product; the application
must disappear behind the patch. One language cannot serve both without one of
them losing.

Converging it would have made this document's greps come out clean at the cost of
the only page whose job is to be memorable.

One thread runs the other way and is worth recording: the start page owns the
`pp-pulse-dot` animation [tokens.md](tokens.md) §6 sanctions by name, and Wave 5
brought it inside, to the signed-in dashboard. **Exempting a surface from the
language does not mean nothing may come out of it.**

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
