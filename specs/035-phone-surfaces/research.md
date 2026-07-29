# Research: The nine surfaces

**Feature**: 035-phone-surfaces · Wave 6c
**Date**: 2026-07-29

Thirteen decisions. Where a value exists in `design/`, it is looked up rather than
re-decided; this file is for the places where the language does not reach, or where two
of its rules point in different directions.

Every claim about the existing code below was verified against the tree, not recalled.

---

## R1 · What the overflow takes — F2

**Decision**: `MobilePanel` gains **`overflow?: PanelAction[]`**, where
`PanelAction = { label: string; icon?: ReactNode; hint?: string; onClick: () => void }`.
The existing `actions?: ReactNode` prop keeps its name, its type and its meaning.

The panel renders the overflow itself:

| Length | Renders |
|---|---|
| 0 | nothing |
| 1 | that action's own `h-11 w-11` target |
| 2+ | a `⋯` target opening a `Sheet` of 52 px labelled rows |

**Rationale**: `actions` was built in 6b as a node *"so this component never grows one
prop per surface"*, and it has exactly one caller today — the Inventories category
filter, which is a **selector**. So the split the bar needs is already latent in the
code, and naming it costs nothing:

> A control that changes **what you are looking at** stays in the bar (`actions`).
> A control that **does a thing and is finished** goes in the overflow (`overflow`).

It is not a size test, so it cannot drift as titles change, and it settles all nine
surfaces without any of them measuring anything.

The overflow is a **typed list, not a node**, which is the opposite call from `actions` —
deliberately. Its sheet is a list of labelled actions and nothing else; six callers each
building that sheet is how two of them end up different. This is `ui/GearList`'s rule
applied in both directions: a node where the contents are the surface's own business, a
list where they are always the same shape.

**The arithmetic that forces it.** The bar has **317 px**: 375, less the body's `px-4` on
both sides, less the panel's two borders, less the bar's own `px-3`.

| Audio Inputs' bar | Width |
|---|---|
| Title + 5 × 44 px targets + 4 × 8 px gaps | **350 px** — wraps |
| Title + 3 × 44 px targets + 2 × 8 px gaps | **246 px** — 71 px spare |

**Alternatives rejected**:

- **Let the bar wrap.** §7b sanctions wrapping, and the plot uses it (R8) — but on a list
  surface it costs 44 px of rows on every screen to serve a control used once, and search
  already owns the second row.
- **Measure and overflow what does not fit.** A rule that depends on a rendered width is a
  rule that changes when a title changes, and it cannot be asserted by this project's
  render-to-string tests.
- **One `actions` node holding both.** Then the panel cannot build the sheet, and the
  visible/overflow split becomes nine local judgements — the exact failure `MobilePanel`
  exists to prevent.

---

## R2 · Where Overview's phone composition lives

**Decision**: A new `components/mobile/MobileOverviewPanel.tsx`, rendered from a phone
branch in `OverviewTab`. It takes the `EventSummary` and the two or three extra values the
tab already holds; it fetches nothing and derives nothing.

**Rationale**: `OverviewTab` is 206 lines of query wiring plus one desktop `Card`. Its ten
`useQuery` calls and the `eventSummary` memo are width-independent and must not be
duplicated, so the branch goes **below** them and above the return — the shape the other
five tabs already have. What differs from those five is that the composition is 120 lines
rather than 20, and inlining it would make the file's desktop half unreadable.

`MobileEntityList` is the precedent: a phone composition that three tabs share lives in
`components/mobile/`. This one has a single caller, which by Principle V would normally
argue for inlining — but the countervailing rule is `components.md`'s: `components/mobile/`
is *"reached only from inside a `useIsMobile()` branch"*, and a 120-line phone composition
sitting in the middle of a desktop tab is how a phone value gets copied onto a desk.

**Alternatives rejected**:

- **Inline in `OverviewTab`.** A 330-line file with two compositions in it.
- **Give `OverviewBands` a phone form.** The bands are three separate exports with three
  separate phone answers (a grid, a scroller, a run of rows); branching inside each would
  put three width branches where one composition decision belongs.

---

## R3 · The readiness row is not a `CondensedListRow`

**Decision**: Readiness rows are their own markup inside `MobileOverviewPanel`, at the
same 44 px minimum, `leading-tight` and hairline separation.

**Rationale**: `CondensedListRow` is title-over-subtitle with a leading tape edge and one
trailing slot. A readiness row is **four aligned columns** — a fixed-width micro-label
area, its figure, its verdict pill and a chevron — because five of them have to line up
into a table the eye reads down. Forcing it into title/subtitle would put the area name and
the figure on two lines, doubling the run's height for no gain and breaking the alignment
that is the whole point.

This is the same call `MobilePanel` makes about its rows: the frame is shared, the row is
the surface's. Reusing the row component here would be `A1`'s synonym failure in reverse —
one component made to mean two things because they are both 44 px tall.

**Alternatives rejected**: a `variant` prop on `CondensedListRow` — a component that draws
two different layouts is two components sharing a name.

---

## R4 · The rig ribbon pans

**Decision**: Each ribbon's node track is `overflow-x-auto` inside its own row, at the
desktop's own node geometry. The DMX meter moves out of the ribbon's trailing slot to a
line beneath it.

**Rationale**: `patterns.md` §7f settles the principle — *nothing on a canvas is re-sized,
because nothing on it is a target* — and the ribbon is the flow canvas one row high. So the
node keeps its size and the window moves, which is panning.

The meter has to move because a meter beside a scrolling track is a meter that scrolls
away, and the DMX headroom is the one number on that ribbon someone would look for
deliberately.

The containing page must not scroll sideways, so the scroll container is the track and not
the row: `patterns.md`'s standing rule for wide content.

**Alternatives rejected**:

- **Wrap the nodes.** A chain that wraps stops being a chain — the left-to-right order is
  the signal path.
- **Shrink the nodes to fit.** `tokens.md` §7: *density on a phone comes from stacking,
  never from shrinking*.

---

## R5 · Settings branches inside `VocabularyPanel`, not in its two callers

**Decision**: The phone branch lives in `components/VocabularyPanel.tsx`. Neither
`SettingsTab` nor `pages/MyDefaults` is edited.

**Rationale**: This is `ui/Drawer`'s precedent, used twice already in this wave: 6a put the
phone branch inside `Drawer` and six drawers acquired a phone form untouched; 6b put it
inside `StatusStrip` and five surfaces did. Both callers here pass the same six props and
differ only in `showUsage` and `note`, so a branch at the call site would be the same branch
written twice.

It also means the two surfaces cannot drift, which matters more than usual: they are the
same vocabularies, and the whole point of the personal template is that it looks like the
event's copy.

---

## R6 · Two edit sheets, not one configurable one

**Decision**: `MobileEquipmentEditSheet` and `MobileRentalEditSheet`, separate components.

**Rationale**: `components.md` §5 already states this rule for the three that exist —
*"the phone's row editor, one per entity, deliberately not one configurable form — the same
reasoning as `GearList`"* — and these two are further apart than those three:

| | Equipment | Rental |
|---|---|---|
| Fields | quantity, note | manual audio, manual light, note |
| Delete | yes | no — a plan-derived line is not deletable |
| Second shape | a **rented** line is read-only and points at the rental order | none |
| Warning | over-owned stock | over-stock, discontinued |

A single form would need a `kind` prop and four conditionals, which is `<EntityList
fields={…}>` again. Two components of ~90 lines each are cheaper to read than one of 150
with a discriminator.

**What is shared** is `ui/Sheet` and the field components, which is where sharing belongs.

---

## R7 · The plot inspector in a sheet, and the spatial rows

**Decision**: Render `StagePlotInspector` **unmodified in structure**, in a `ui/Sheet`,
with one new optional prop `spatial?: boolean` defaulting to `true`. The phone passes
`false`, which suppresses the Position, Size, Rotation and Tilt rows and renders one note
in their place.

**Rationale**: The component already returns a bare `<section className="flex flex-col
gap-3">` — the `w-60 shrink-0 border-l` frame belongs to `StagePlotTab`, not to the
inspector — so **no split is needed**, which is the cheapest possible close and carries no
desktop risk. `components.md` §5 asks for exactly this shape for the flow inspector in 6d:
*"no new inspector — a different container for the one that exists."*

**The tension, stated because it is real.** `patterns.md` §7g says *"the line is the
**gesture**, not the object and not the screen"*, and a position typed in centimetres is
not a gesture. On the strict reading, the spatial rows could stay. The approved mockup draws
them absent, with the note *"Position and size are set on a computer"*, and that is what
ships: nine numeric fields is most of the sheet, and the one thing someone standing at the
riser wants is its name and what is on it.

`spatial` is a boolean with a `true` default rather than a fork, so if lived use disagrees
it is a one-line change and the desktop never knew.

**Alternatives rejected**: a second inspector component (a fork of 300 lines, and the flow
inspector's own precedent says no); hiding the rows with CSS (they would still be in the tab
order).

---

## R8 · Stage Plots becomes a panel, and its bar wraps

**Decision**: `StagePlotTab`'s phone branch becomes a `MobilePanel` whose children are the
withheld-gesture sentence and the canvas. Bar row 1: title, the plot selector, `⋯`. Bar
row 2: the Top/Front/Side selector and the zoom control. The strip states the plot count
and the element count.

**Rationale**: §7b's *"a phone surface is one bordered thing"* has no exception for a
canvas, and the sentence needs a place that is inside the frame and above the canvas — §7g:
*"it sits where the editor would be."* The bar genuinely does not fit in one row here
(a title, a selector and a three-way segment is over 317 px before zoom), and §7b's answer
for that case is wrapping, which costs nothing on a surface whose body is a canvas rather
than rows.

Zoom stays a real control at 44 px per §7f, rather than going in the overflow: it changes
what you are looking at.

---

## R9 · `SignalFlowStatusRail` onto the shared shell — F1

**Decision**: Rewrite it in terms of `event/StatusStrip`, exactly as 6b did to the other
four. Its tint expression and its filter button are deleted, not re-implemented.

**Rationale**: Verified line by line — `SignalFlowStatusRail.tsx:37` is `StatusStrip`'s
desktop return re-typed: the same `flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t
px-3 py-2`, the same `text-[11px] text-zinc-400`, the same two tints
(`border-amber-500/40 bg-amber-500/[0.05]` / `border-zinc-800 bg-zinc-950/60`), and the same
`size="xs" … h-6 px-2` control that §7b describes as deliberate on a desk and wrong in a
hand.

**The safety check is 6b's, and it is not optional.** The desktop return must come out
byte-identical: render every state of the rail before and after and diff the markup. 6b used
this on four rails and it is stronger than comparing class strings through `twMerge`,
because it catches element order too. The states here are `gaps = 0`, `gaps = 1`,
`gaps > 1`, with and without `firstGap`, and with and without a filter handler.

---

## R10 · The signal-flow row, and the wrap exception

**Decision**: A local row in `SignalFlowTab` — not `CondensedListRow` — whose second line is
the existing `ChainLine` and **wraps**. `tokens.md` §7 and `patterns.md` §7c gain a stated
exception naming this row.

**Rationale**: §7c's truncation rule has a reason attached — *"a row that grows to fit its
content breaks the pitch the list is read at"* — and the reason is about a **list you scan**.
Signal Flow is a list you **read**: each row is one chain, and a chain truncated at
`Beta 91A → SB1 in 1 → Mu…` has lost the answer to the only question the surface is asked.

An exception with a written reason is the design language working; an exception nobody wrote
down is how `M2` happened. So it goes in the documents in the same commit, worded as a
constraint rather than a licence: *the chain wraps because it is the content; a subtitle
summarising a row still truncates.*

**Alternatives rejected**: eliding the middle hops (`Beta 91A → … → SD10 ch 1`) — keeps the
pitch and loses the routing, which is the surface.

---

## R11 · The fixed-height shell, and the trap 6b hit

**Decision**:

```
Layout (phone)   h-[100svh] flex flex-col overflow-hidden
  header         h-14 flex-none
  main           flex-1 min-h-0 overflow-hidden  (px-4 py-4)
  MobileNav      flex-none, static, keeps its own safe-area inset
```

`EventDetail`'s phone return becomes `flex h-full flex-col gap-3`, with the switcher row
`flex-none` and the section `flex-1 min-h-0`. `MobilePanel`'s root gains `h-full` and its
rows region becomes `flex-1 min-h-0 overflow-y-auto`.

**Rationale**: The failure 6b hit has two halves and they pull in opposite directions,
which is why one rule does not fix it:

| The flex item's own `overflow` | Its automatic minimum size | What goes wrong in a column |
|---|---|---|
| `visible` | **its content** | It refuses to shrink and pushes the column past the viewport — the strip goes off-screen again |
| `hidden` · `auto` · `scroll` | **`0`** | It may collapse to nothing, and with `hidden` there is no scrollbar to reveal what was lost |

6b's three surfaces were the second row: `OverviewTab`'s `Card` and `PatchPanel` both carry
`overflow-hidden`, so as flex items they were free to collapse below their content and did,
silently.

So the shell needs both halves stated, and the split is by role rather than by element:

- **Everything that is not the rows region is `flex-none`** — header, switcher row, panel
  bar, strip, nav. None of them may absorb or yield space.
- **The rows region is `flex-1 min-h-0 overflow-y-auto`.** `min-h-0` because its ancestors
  have visible overflow and would otherwise refuse to shrink; `overflow-y-auto` and not
  `hidden` because the whole point is that what does not fit is reachable. That pairing is
  what 6b was missing: it had the shrinking without the scrolling.

This slice makes all three of the offending surfaces panels, so every child of the column
is either `flex-none` or a rows region carrying that exact pair — and there is no third
kind of child left to get it wrong.

`MobileNav` stops being `fixed`. Its `h-14` is already stated for exactly this reason —
`Layout`'s body padding derived from it — and that derived padding is now deleted, because
a sibling in a column does not need reserving for. **The safe-area inset stays on the nav**
and is still added to its own padding rather than absorbed (`M10`).

**Verification**: a render test that mounts the shell around a 60-row list and asserts
both halves — that the rows region is the **only** element carrying a scrolling overflow,
and that **no** element in the column carries `overflow-hidden` while also being allowed
to grow. The trap is invisible until content is tall, which is precisely how it survived a
whole slice, so the assertion is on the structure rather than on a rendered height that
this project's test method cannot measure.

---

## R12 · Where `Layout` gets the event's name

**Decision**: `Layout` matches `/events/:id` with `useMatch`, and reads
`useQuery({ queryKey: ['event', id], queryFn: () => getEvent(id), enabled })`. Title is
`data?.name` falling back to today's `getPageTitle` result.

**Rationale**: `['event', id]` is the key `EventDetail` already populates with the same
fetcher, so React Query serves both from one cache entry and one request — the same
"warming" argument `OverviewTab`'s doc comment already makes about its ten queries. No
context, no prop drilling, no store, and nothing new in the API layer.

The fallback matters: a failed or pending event must show the page title rather than an
empty header or a flash of `Event Detail` followed by a name.

**Alternatives rejected**:

- **A `usePageTitle` context the pages set.** New plumbing for one string, and it makes the
  header's content depend on child render order.
- **Passing it through the router's handle.** Requires the name at route-definition time,
  which is exactly when it is not known.

---

## R13 · Print, and where the sheet sits

**Decision**: In each of the three tabs, the phone branch returns a fragment: the existing
`<div className="print:hidden">` holding the panel, and the print sheet as its **sibling**.
The `Print` overflow action calls the same handler `PrintButton` uses.

**Rationale**: `print:hidden` is doing its job — the panel must not print — and the bug is
that it is the *only* thing in the branch. Making the sheet a sibling rather than moving the
wrapper is the smallest change that satisfies both, and it is exactly the desktop return's
shape.

Signal Flow already prints correctly because its phone branch is inside `PrintSheet`, and it
is the only one of the four that does — which is the argument that the other three were an
oversight rather than a decision.

**Testing**: the print sheets are already covered at desktop width; the phone assertion is
that the branch renders the same sheet element, which `renderToStaticMarkup` can check
directly.

---

## Method note · How any of this is tested

Per the constitution and this project's precedent (`Sheet.test.tsx`,
`MobilePanel.test.tsx`, `OverviewBands.test.tsx`): **Vitest with
`renderToStaticMarkup`**. No DOM, no React Testing Library.

That constrains what can be asserted and it is worth stating plainly: **structure, classes
and conditional rendering** are testable; scroll behaviour, focus and pointer events are
not. So the shell's column is asserted as *classes on the right elements* (R11), the
byte-identical desktop check is a *markup diff* (R9), and the geometry claims — 44 px
targets, 317 px bars — are asserted as the class strings that produce them, with the
arithmetic recorded here and in the contract.

`useIsMobile` guards a missing `window`, which 6b added for this reason; without it every
component that branches on reach is unrenderable by this method.
