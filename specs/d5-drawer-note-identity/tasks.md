# D5 — Tasks

Eight files in `frontend/src`, plus `design/components.md`; one order. T001 must land before T002 or the call sites do not
compile; T002 must land before the gates, for the same reason.

- [x] **T001 — `ui/Drawer` takes the note's name** (`frontend/src/components/ui/Drawer.tsx`)
  Split `DrawerProps` into the base plus the `{ info, noteId } | { info?: undefined,
  noteId?: undefined }` union (plan.md). Destructure `noteId`; derive the note from
  it. Delete the title from the note's identity — `useInfoNote({ id: \`drawer:${noteId}\` })`.
  Extend the `info` doc comment with what identity is and why the title was not it.
  → FR-001, FR-002

- [x] **T002 — The eight drawers name their note** (one prop each, per spec FR-003)
  `EventFormDrawer.tsx` `event-form` · `event/BusesDrawer.tsx` `buses` ·
  `event/UniversesDrawer.tsx` `universes` · `event/PricingDrawer.tsx` `event-pricing` ·
  `inventory/InventoryDrawer.tsx` `catalog-manage` · `inventory/InventoryDrawers.tsx`
  `catalog-categories`, `catalog-import`, `catalog-pricing`.
  Rig, Event details and `OverviewTab`'s browse pass no `info` and are not edited.
  On the two `Pricing` drawers, note in a comment that the name is the distinction
  the title never carried — that is the live half of the defect.
  → FR-003

- [x] **T003 — Pin the rule that catches the next one** (`frontend/src/components/ui/Drawer.test.tsx`)
  A second `describe`: `info` without `noteId` is a type error, `noteId` without
  `info` is a type error (both `@ts-expect-error`, with descriptions — `tsc -b`
  fails if either stops being an error), and a drawer with both renders one `i`
  and one panel. The `flush` suite is not touched.
  → acceptance 3

- [x] **T004 — State it in the design language** (`design/components.md` §4)
  `noteId` where `Drawer`'s props are stated, after the footer/`info` rule: a
  note's identity is a name the call site gives it, `info` requires it, and a
  title cannot serve because it is a label — it repeats, and since Slice 32 it is
  sometimes a record.
  → FR-004

- [x] **T005 — Gates** (`validator` subagent)
  `gofmt`/`vet`/`go test` unchanged by this slice but run anyway; `tsc -b`,
  `eslint src`, `vitest run`, `vite build`.

- [ ] **T006 — Verify the two acceptance walks in the running app** — *not done*
  The event-Pricing → catalog-Pricing walk (acceptance 1) and the two-catalogs walk
  (acceptance 2). Both are `localStorage` behaviour, which no test in this project
  can reach: there is no DOM and no browser automation here, and both walks need a
  signed-in session with real catalogs. What was checked instead is everything that
  determines them — `tsc -b` proves every `info` has a name, and `grep -n 'noteId='`
  proves the eight names are distinct. **Left for the user's field-test round**,
  which is where this project's browser verification has always happened.
  Acceptance 4's second clause **is** owned here and was run: `grep -rn 'localStorage'
  src` — every remaining key derives from an id (`eventId`, `plotId`) or a literal
  (`flow-desk-job`, `plot-desk-job`), and no key anywhere in `src` derives from a
  title. `ui/Drawer` was the only place that ever did.

- [x] **T007 — Review** (`reviewer` subagent), then write the outcome back into
  `ROADMAP.md` § *D5* under **Fixed**, mark the heading ✅ with the date, and drop
  the D5 row from the **What remains** index.
