## Why

Fifteen destructive deletes still ask with the browser's own `window.confirm`. The full
brief — cause, history and the three decisions it turns on — is `ROADMAP.md` under
**`### D6 — Eight deletes are still the browser's own dialog`**; this proposal does not
restate it. What matters here is that D2's policy (*"each takes `ConfirmDialog` when its
own surface is next opened"*) does not converge: nothing schedules these surfaces, so
*next opened* has meant *not scheduled* for two months, and the browser's dialog remains
the confirm most of the application actually uses.

D6's table names eight sites. The live count, verified by grep on 2026-08-05 and again at
the start of this change, is **fifteen** — the discrepancy was found while delivering
Slice 39 and left uncorrected there because amending a defect's brief is the user's call.
That call was made on 2026-08-05: **the scope is all fifteen.** Anything short of that
re-opens the same *not scheduled* trap for the remainder.

## What Changes

- Every remaining live `window.confirm` call becomes `ui/ConfirmDialog` — fifteen sites,
  one per file, listed under Impact. Fourteen confirm a delete; `LightingTab.tsx`
  confirms a bulk *move* and is the one non-delete in the set.
- Each existing sentence survives verbatim in meaning: it names the subject, then the
  consequence — already `ConfirmDialog`'s stated contract. Three of them
  (`OwnedGearManager`, `StageboxSection`, `StageMultiSection`) compute the sentence from a
  count, so their pending state carries the row, not a flag.
- No new `ConfirmDialog` props. No `design/` edit and no new design rule — this is a
  substitution onto a component that already exists and is already the language.
- D6's brief in `ROADMAP.md` is corrected from eight to fifteen, and closed out under
  **Fixed** with the decisions worth keeping.

**Not** breaking: no API, schema or data change. Nothing server-side is touched.

## Capabilities

### New Capabilities
- `destructive-confirmation`: what the application must ask before it destroys
  something — that the confirm is the application's own surface rather than the browser's,
  that it names the subject and then the consequence, that it cannot silently re-aim at a
  different row, and that it renders above the surface that raised it. This is behaviour,
  not visual language; every value it implies is looked up in `design/`, never restated
  here.

### Modified Capabilities

None. `openspec/specs/` is empty — this is the first change under OpenSpec, so
`destructive-confirmation` is created rather than amended.

## Impact

Frontend only, and within it only the component that raises each confirm:

`event/StagePlotInspector.tsx`, `event/StagePlotTab.tsx`, `event/ConsoleSection.tsx`,
`event/StageboxSection.tsx`, `event/StageMultiSection.tsx`, `event/InputSheet.tsx`,
`event/OutputSheet.tsx`, `event/InputDeviceSection.tsx`,
`event/ProcessingDeviceSection.tsx`, `event/TrueOutputDeviceSection.tsx`,
`event/LightingSheet.tsx`, `event/LightingTab.tsx`, `inventory/InventorySheet.tsx`,
`inventory/InventoryDrawers.tsx`, `OwnedGearManager.tsx`.

`ui/ConfirmDialog.tsx` is unchanged. `inventory/InventoryDrawer.tsx:21` mentions
`window.confirm` in a doc comment describing the surface it wraps; that sentence is
corrected but no code there changes.

No backend, no migration, no dependency change.

## Constitution Check

| Principle | Verdict |
|---|---|
| **I. Domain-First Data Model** | Not engaged. No domain type, table or field is touched. |
| **II. Extensibility by Design** | Not engaged. No category, connector or channel logic is involved; nothing branches on a category name. |
| **III. Full-Stack Monorepo Architecture** | Holds. Frontend-only, inside `frontend/src/components/`, using the existing `ui/` primitive. |
| **IV. Inventory-Driven Rental Workflow** | Not engaged, with one note: `OwnedGearManager`'s sentence counts the events that plan a piece of gear. That count is what makes the confirm worth having, and it is preserved exactly. |
| **V. Pragmatic Simplicity** | Holds, and is the principle this change is decided by. Per-site `useState` is chosen over a shared `useConfirm` hook: a promise-returning hook re-creates `window.confirm`'s own shape, and the pending state must be the *record* being confirmed rather than a boolean, which a generic hook cannot carry. Principle V's own clause — *dialog open/close state MUST use React's built-in state* — names this case directly. The hook is reconsidered only if the copies turn out identical, which Slice 39's two already show they are not. |

No deviation. Nothing goes in Complexity Tracking.

**Why this stays a defect and not a slice.** `CLAUDE.md` promotes a defect to a slice when
it edits `design/`, needs a migration, or spreads past a handful of files. The first two
do not apply. Fifteen files does spread — that was put to the user on 2026-08-05 with the
true count in hand, and the decision was that it stays a defect, because the substitution
is mechanical and the pattern is already settled by a delivered slice. The brief's own
escape hatch stands: **if the first two surfaces show the state shape genuinely differs
per site — differing in more than the row it carries — stop and convert to a slice rather
than improvise across the remaining thirteen.**
