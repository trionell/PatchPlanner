# D5 — A drawer's info note is remembered under its title

**Branch:** `d5-drawer-note-identity` · **Status:** complete 2026-07-31, unmerged ·
**Mockup:** waived
(ROADMAP D5, 2026-07-30 user decision — nothing on screen moves)

The traced fault, both of its halves and the decision they turn on are in
`ROADMAP.md` § *D5*. That section is the brief; this spec states only what the
fix *is*, and is the thing acceptance is checked against.

## The one line

`ui/Drawer.tsx:62` derives an info note's identity from the drawer's title:

```ts
const note = useInfoNote({ id: `drawer:${title}` })
```

A title is a label. It is chosen for what reads well in a header, it is
duplicated freely, and — since Slice 32 — it is sometimes a record's name. None
of that is true of an identity, so the note's memory collides where two drawers
share a title (*Pricing*, live today) and fragments where a title is data (a
catalog's name, one key per catalog ever opened).

## What changes

`ui/Drawer` gains a **`noteId`** prop. It is the note's identity; `title` goes
back to being only a label.

### Functional requirements

- **FR-001** `Drawer` accepts `noteId: string`, and derives its note from it:
  `useInfoNote({ id: \`drawer:${noteId}\` })`. The title is not read for identity
  anywhere in the component.
- **FR-002** `noteId` is **required whenever `info` is passed, and rejected when
  it is not** — enforced in the type, so a drawer that forgets it fails `tsc -b`
  rather than silently sharing another drawer's key. This is the requirement that
  catches the *Pricing* case before it can happen again; see plan.md for the
  decision behind it.
- **FR-003** All eight `info`-passing call sites name their note, and the names
  are unique. The identity is what the drawer *is*, not what its header says:

  | Call site | `noteId` |
  |---|---|
  | `EventFormDrawer.tsx` | `event-form` |
  | `event/BusesDrawer.tsx` | `buses` |
  | `event/UniversesDrawer.tsx` | `universes` |
  | `event/PricingDrawer.tsx` | `event-pricing` |
  | `inventory/InventoryDrawer.tsx` | `catalog-manage` |
  | `inventory/InventoryDrawers.tsx` · Categories | `catalog-categories` |
  | `inventory/InventoryDrawers.tsx` · Import | `catalog-import` |
  | `inventory/InventoryDrawers.tsx` · Pricing | `catalog-pricing` |

  `event-pricing` and `catalog-pricing` are the pair that shared one key. The
  three drawers that pass no `info` — Rig, Event details, the read-only inventory
  browse in `OverviewTab` — pass no `noteId` either, and are untouched.
- **FR-004** `design/components.md` §4 states `noteId` where `Drawer`'s props are
  stated: that a note's identity is a name the call site gives it, that `info`
  requires it, and why a title cannot serve — a title is a label, may repeat, and
  may be a record.
- **FR-005** The `pp-info:drawer:<Title>` keys already written to browsers are
  **left in place**. No migration, no cleanup pass. See plan.md.

### Not in scope

- `useInfoNote` itself. Its `id` contract is already right — the fault is in what
  `Drawer` hands it, and one line above the hook is where the fix belongs.
- The two panel notes (`flow-desk-job`, `plot-desk-job`), which name themselves
  already and are the pattern this brings `Drawer` into line with.
- Any visual change. Not one value, tier, or piece of spacing moves.

## Acceptance

1. Open an event's **Pricing** drawer, open its `i`, close the drawer. Open a
   catalog's **Pricing** drawer (Inventories → a catalog → Pricing): its `i` is
   **closed**, and opening it shows the supplier-factor sentence. Dismissing
   either leaves the other as it was.
2. Open the `i` on catalog *Backline*'s manage drawer; open catalog *PA*'s: it is
   open there too — one sentence, one memory. Renaming a catalog does not reset it.
3. `<Drawer info={…}>` without `noteId` is a type error; `noteId` without `info`
   is a type error. Both are pinned by a test that fails if either stops being one.
4. Gates green; no `localStorage` key derives from a title anywhere in `src`.
