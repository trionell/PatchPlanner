# Research: The phone's panel

**Feature**: 034-phone-panel · Wave 6b
**Date**: 2026-07-29

Ten decisions. Every value cited is either in `design/` or verified against the code
and the framework config rather than assumed — **R2 is the whole reason that
distinction matters in this slice**.

---

## R1 · What `MobilePanel` takes

**Decision**: `title`, `search` + `onSearch`, `actions`, `strip`, `children`. The panel
owns the bar's shape; `actions` is a node.

**Rationale**: The desktop's `PatchPanel` takes `bar` as a single node and its nine bars
converged anyway, because `patterns.md` §1 states the order. The phone cannot rely on
that alone: at 375 px there is room for a title and two or three targets, and that
scarcity is exactly what would tempt nine call sites into nine different compromises.

So the two things **every** phone bar has — the title and the search target — are props,
and the panel builds them in the stated positions. Everything only some surfaces
have — Print, the rental exports, the Rig button, the Inventories category filter, and
6d's `Sheet | Flow` toggle — arrives through `actions`, which the panel places between
the flexible gap and the primary action without knowing what any of them are.

**Alternatives rejected**:

- **A `bar` node, like `PatchPanel`.** Nine bars each re-deciding where search goes, at
  the width where that decision is hardest.
- **Props for everything** (`onPrint`, `onOpenRig`, `onExport`, `filterControl`…). This
  is the `<EntityList fields={…}>` failure `ui/GearList` was built to avoid
  (`components.md` §2): the panel would grow a prop per surface and end up harder to read
  than the six bars it replaced. Principle V.

---

## R2 · The row's height — F3

**Decision**: The row states `min-h-[44px]` with `leading-tight` on both lines. Its
padding (`py-1.5`) is derived, not stated. `tokens.md` §7's `px-3 py-2.5` is corrected.

**Rationale**: `tokens.md` §7's row line makes three claims at once — `px-3 py-2.5`,
`text-sm` over `text-xs`, and "44 px tall". Verified against
`frontend/tailwind.config.ts`, which extends **only** `colors.zinc.850` and therefore
leaves the framework's default type scale in place:

| | Font | Line box |
|---|---|---|
| `text-sm` | 14 px | **20 px** |
| `text-xs` | 12 px | **16 px** |
| `leading-tight` | — | **1.25 × font** |

- **As written**: 20 (padding) + 20 + 16 = **56 px**.
- **With `leading-tight`**: 12 (padding) + 17.5 + 15 = **44.5 px**.
- **Today's card**: 12 + 16.25 + 13.75 + 2 (its own border) = **44 px**, at a 48 px pitch
  once `space-y-1` is counted.

So the stated padding produces a row a quarter taller than the one it replaces. At
375 × 667 the rows region is 371 px: **six rows at 57 px of pitch, eight at 45.5**. The
drawn specimen (`min-height: 44px`, 5 px padding, a 1.3 line box) and the shipped code
(`py-1.5`, `leading-tight`) independently reach 44 px and independently disagree with the
table.

**Which is why the fix is not "change 2.5 to 1.5".** A padding is an input and a row
height is the thing anyone cares about; stating both invites them to disagree, and for
five waves they have. `tokens.md` already makes exactly this move for the header, the nav
and the body's bottom padding — *the height is stated and everything else derives* —
and `audit.md` `A5` is the same finding on a different edge.

**Consequence for `M2`**: `py-1.5` is withdrawn from the off-ladder list. It was never
the defect; it is what makes 44 px with two tight lines, and it is what the corrected
rule arrives back at. The defect was the two type sizes it was holding —
`text-[13px]` and `text-[11px]`.

**Alternatives rejected**:

- **Build it as written and accept 56 px.** Loses a fifth of every list on every phone,
  to a value nothing in the tree has ever used.
- **Keep both a padding and a height in the table.** The condition that produced F3.

---

## R3 · Search as a target

**Decision**: A 44 px target in the bar toggles a second bar row holding an
`Input size="md"`. State lives in `MobilePanel`; the query is the caller's.

**Rationale**: `patterns.md` §7b's ASCII draws `[🔍] [＋]` and says the bar *"wraps to two
rows before it scrolls"* — one sentence, not two. An always-open field costs 44 px on
every screen to serve something done on some of them, and it is what leaves today's bar
with room for nothing else.

The split of state is what keeps the panel content-blind (FR-009): **the panel owns
whether the row is open; the caller owns the query and does the filtering**, exactly as
every one of these surfaces already does with its own `search` state.

**Behaviour**, so that a filter is never invisible:

| Event | Result |
|---|---|
| Target tapped | Row opens, field focused |
| `Escape` in the field | Row closes, query cleared |
| Clear control | Row closes, query cleared |
| Field emptied by typing | Row **stays open** — the user is mid-edit |
| Row closed with a non-empty query | Cannot happen: closing clears |

**Alternatives rejected**:

- **Always-open field.** The status quo, and `M1`'s bar-shaped half.
- **Search inside a `Sheet`.** A whole overlay to type six characters, and the list is
  hidden behind it while the query is composed.

---

## R4 · How a status rail acquires a phone form

**Decision**: Each of the four rails branches on `useIsMobile()` **inside itself**.

**Rationale**: The precedent is `ui/Drawer` in 6a — four lines in one component gave six
drawers a phone form without any of their call sites being edited. The same holds here:
five surfaces render these rails, and none of them should have to know the viewport to
get the right one.

It also keeps `P9` enforceable in one place: the rail's derivation, its three states, its
tints and its words are written once and cannot drift between widths, because there is
only one component.

**Alternatives rejected**:

- **A `dense` / `mobile` prop.** Five call sites, each passing the answer to a question
  the component can ask itself.
- **Four phone rails.** Eight components saying the same four things.

---

## R5 · The strip as its own control

**Decision**: On a phone, when a rail has a filter handler, the **rail's root element is
a `<button>`** spanning the panel's width at ≥44 px, and its desktop `h-6` control is not
rendered. Without a handler it stays a `<div>`.

**Rationale**: The desktop's `h-6 px-2 text-[11px]` control is deliberate and correct
there — a control inside a strip must not set the height of the bar closing the panel —
and it is a 24 px target in the hand. Making it 44 px would double the strip's height on
the one surface where height is rows.

Putting the target on the strip itself costs nothing, puts it at the bottom edge where
the thumb already is, and makes the sentence and the control the same object: *3 gaps* →
tap → the three gaps.

The conditional element type has a precedent in the tree — `CondensedListRow` already
does `const Comp = onClick ? 'button' : 'div'` — so this is an existing idiom rather than
a new one.

**The filter itself does not move.** The rail keeps its existing `onFilterChange` /
`onShowGaps` prop and the **caller keeps the filter state**, exactly as on the desktop.
The phone branch of each tab gains the same two lines its desktop sheet already has.

**Affordance and its absence**:

| State | Strip |
|---|---|
| Something to filter to, handler present | `<button>`, with `only gaps ›` at the trailing edge in the state's hue |
| Nothing to filter to (*complete*, *addressed*, *all covered*) | `<div>`, no chevron |
| No handler (read-only role) | `<div>`, no chevron |
| Filtered | `<button>`, `show all ›` |

**Alternatives rejected**:

- **Shrink the control to fit.** Amendment 1, broken by the one control that acts on the
  problem the surface just reported.
- **Drop the controls on a phone.** Honest, and it makes the phone a place you read a
  problem you cannot then look at. On a 56-channel patch, *3 gaps* with no way to see
  which three is an instruction to start scrolling.
- **Move them into the bar's overflow.** Two taps and a menu, for the surface's single
  most likely action.

---

## R6 · Where the audio patch status is derived

**Decision**: Extract the `PatchStatus` construction from `InputSheet` and `OutputSheet`
into `lib/patchCapacity.ts`, at its **second** caller.

**Rationale**: The strip needs a `PatchStatus`, and today it is built inline in each
sheet — about fifteen lines assembling `consoleCapacity`, `boxUsage`, `cablesPicked` and
the per-row gap list. The phone branch lives in the *tab*, not the sheet, so it cannot
reach it.

`components.md` §6 already states where this belongs: *pure derivations go in `lib/`, not
inside components, so they are testable without rendering*. The other three rails already
comply — `dmxMap()`, `equipmentRows()` and `rentalStatusState()` are all lib functions the
phone branch can call directly, which is why only the two audio patches need this.

This is an extraction at the second caller, not a speculative one (Principle V): the
alternative is the identical fifteen lines in two files, where one of them is the phone
and would silently drift.

**Alternatives rejected**:

- **Duplicate it in the tab.** Two derivations of one verdict, one of which nobody looks
  at on a desk.
- **Render the desktop sheet on a phone to get its strip.** The sheet is twelve columns.

---

## R7 · The gap predicate

**Decision**: `MobileChannelListItem` and `MobileOutputListItem` gain `hasGap: boolean`.

**Rationale**: The phone's filtered view must show *the rows the strip is reporting*. The
list builder already knows — it writes `sourceLabel: '—'` when the chain has no source —
but testing for the string `'—'` makes a filter depend on a display value, and the next
person to change an em dash to *"no source"* breaks a filter in a file they never opened.

The flag is derived in the same pass, in the same lib function, and is covered by that
lib's existing test file.

---

## R8 · The Inventories item list's category filter

**Decision**: It moves into `actions`, as a target beside search.

**Rationale**: It is already a `Sheet` — 6a converted it from a `Dialog`. It is a
surface-specific control, which is precisely what `actions` exists for (R1), and it needs
no new decision: 6a settled what the overlay is, and 6b settles where the thing that
opens it lives.

---

## R9 · How this is tested

**Decision**: `renderToStaticMarkup` from `react-dom/server`, asserting on markup.
No DOM, no React Testing Library — the project's constitution and the precedent in
`OverviewBands.test.tsx` and `Sheet.test.tsx`.

**What can be pinned this way**, and is:

| | Invariant |
|---|---|
| P1 | A rendered panel contains exactly one bordered frame, and no row inside it carries a border, radius or raised ground |
| P2 | The strip is a **sibling** of the scrolling rows region, not inside it — so it cannot scroll away (the 6a footer invariant, one edge over) |
| P3 | The row emits `min-h-[44px]` and `leading-tight`, and neither `text-[13px]` nor `text-[11px]` |
| P4 | A rail with a filter handler renders a `<button>` on a phone and a `<div>` on a desktop |
| P5 | A rail in a clean state renders no chevron and no `<button>`, at either width |
| P6 | A restricted role's panel emits no primary action element at all |
| P7 | `hasGap` is true exactly when the chain has no source (lib test, no rendering) |

**What cannot**, and is therefore named in `quickstart.md` rather than claimed: every
height in this slice. `renderToStaticMarkup` produces no layout, so "eight rows at
375 × 667" is arithmetic over stated values, and the handset pass is a human's.

---

## R10 · Asserting the desktop is unchanged

**Decision**: Three mechanical checks, run and recorded before the slice is called done —
the same three 6a used.

1. `git diff --stat -- backend/ frontend/src/api/` is empty. No endpoint, no migration,
   no type.
2. The changed-file list is closed and stated in `plan.md` up front; anything outside it
   is a finding, not a change.
3. Every desktop class string on a touched shared component is compared through
   `twMerge` before and after, rather than read. The four status rails are the risk
   surface here, because they are the only files in this slice that a desktop surface
   renders.

**One delta is expected and declared in advance**: the two audio sheets lose their inline
`PatchStatus` construction to a lib call (R6). That is a refactor with no rendered
difference, and its test is that the sheets' existing tests still pass.
