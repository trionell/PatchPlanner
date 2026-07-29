# Data Model: The phone's panel

**Feature**: 034-phone-panel · Wave 6b

**No persisted model changes.** No table, no column, no migration, no endpoint, no
request or response type. This slice is a composition change over data the application
already fetches, and `git diff --stat -- backend/ frontend/src/api/` is expected to be
empty (research R10).

Three things are nevertheless *shapes*, and they are recorded here so the next slice can
find them.

---

## 1 · `hasGap` — a derived flag on two read projections

`MobileChannelListItem` and `MobileOutputListItem` are read projections built in `lib/`
from data the desktop already has. Each gains one derived boolean.

| Field | Type | Derivation |
|---|---|---|
| `hasGap` | `boolean` | True when the channel's or output's resolved signal chain has no ultimate source — the same condition that today makes `sourceLabel` render as `—`. |

**Why it exists**: the phone's filtered view must show *the rows the strip is reporting*,
and the strip reports gaps. Without the flag the filter would have to test
`sourceLabel === '—'`, making a behaviour depend on a display string — the next person to
change an em dash to *"no source"* would break a filter in a file they never opened
(research R7).

It is derived in the same pass as the labels, in the same function, and is covered by
that lib's existing test file. It is **not** stored and **not** sent by the API.

---

## 2 · `PatchStatus` — moved, not changed

`PatchStatus` already exists in `lib/patchCapacity.ts` and is unchanged. What moves is
its **construction**: from ~15 inline lines in `InputSheet` and `OutputSheet` into two
exported functions in the same lib, so the phone branch — which lives in the *tab*, not
the sheet — can reach the same verdict.

```
inputPatchStatus(channels, rows, consoles, stageboxes, stageMultis, cables)  → PatchStatus
outputPatchStatus(outputs, rows, consoles, stageboxes, stageMultis, cables)  → PatchStatus
```

Extraction at the second caller, not before (Principle V, research R6). The other two
rails need nothing: `dmxMap()`, `equipmentRows()` and `rentalStatusState()` are already
lib functions.

---

## 3 · Filter state — where it lives

Not a data model, but the answer to *"who owns the filter the strip toggles?"*, recorded
because getting it wrong would put state in a container that must stay content-blind.

| State | Owner | Note |
|---|---|---|
| The query | The **surface** (tab or page) | Already true today; unchanged |
| Whether the search row is open | **`MobilePanel`** | The only state the panel holds. Purely presentational (constitution V: local UI state is `useState`) |
| The strip's filter (`gapsOnly`, `LightingFilter`, `EquipmentFilter`, `RentalFilter`) | The **surface** | Exactly as the desktop sheets already do. The rail keeps its existing `onFilterChange` / `onShowGaps` prop and gains no state |

`MobilePanel` never sees rows, queries or filters. It is handed children and a strip, and
it renders a frame around them (FR-009).
