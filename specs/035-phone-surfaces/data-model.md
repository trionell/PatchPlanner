# Data Model: The nine surfaces

**Feature**: 035-phone-surfaces · Wave 6c
**Date**: 2026-07-29

**No stored entity changes.** No migration, no column, no endpoint, no request shape. The
backend diff for this slice must be empty (FR-035), and so must `frontend/src/api/`.

What follows is the three *derived* shapes this slice adds in the frontend, and the one
existing shape it stops duplicating.

---

## 1 · `PanelAction` — an entry in the bar's overflow

```ts
export interface PanelAction {
  /** What the row says. Sentence case, an active verb: "Open Rig", "Print patch sheet". */
  label: string
  /** Drawn, never a target — the row is the target. */
  icon?: ReactNode
  /** One value the desktop's own control already shows: a count, a file kind. */
  hint?: string
  onClick: () => void
}
```

**Where it is built**: at the call site, by the surface that owns the action.
**Where it is rendered**: entirely inside `ui/MobilePanel` (R1) — the caller never builds
the sheet.

**Availability is expressed by absence, not by a flag.** There is no `disabled` and no
`hidden`: a surface that a role may not act on omits the entry, which is P7 and is how
`primaryAction` already works. Rental's *Export price list* is present only for a catalog
imported from one, by the same rule the desktop uses.

**Ordering is the caller's**, and it is the desktop bar's order left to right. Nothing
sorts it.

---

## 2 · `ReadinessLine` — one row of Overview's index

Assembled in `lib/eventSummary.ts` beside the verdicts it is made of, because both halves
already exist there and the point of the row is that they cannot disagree (FR-016).

```ts
export interface ReadinessLine {
  /** 'audio' | 'lighting' | 'rental' | 'equipment' | 'plots' — the existing verdict area. */
  area: ReadinessVerdict['area']
  /** The tab it opens. The verdict already carries this. */
  tab: string
  /** The verdict's own words: "3 gaps", "addressed", "2 over stock". */
  label: string
  /** 'ok' | 'warn' | 'error' | 'neutral' — decides the pill and the leading edge. */
  tone: ReadinessVerdict['tone']
  /** What the desktop's numbers band says about this area: "16 ch in · 8 out". Absent
      where the area has no figure of its own. */
  figure?: string
}
```

**It derives nothing new.** `area`, `tab`, `label` and `tone` are `ReadinessVerdict`
verbatim; `figure` is formatted from the same `EventSummary` fields `NumbersBand` reads. A
new `readinessLines(summary)` function returns `ReadinessLine[]` and
`summary.readiness` stays exactly as it is, so the desktop's `ReadinessRow` is untouched.

**Why it is a projection and not a component's local map**: the phone shows the figure and
the verdict on one row, and the desktop shows them in two different bands. If the phone
formatted its own figure, `16 / 8` and `16 ch in · 8 out` would be two renderings of one
fact with two places to get it wrong — which is the mistake `eventSummary` was created to
stop.

**Undeclared is not zero.** An area with no plan at all keeps the neutral verdict and gets
**no** `figure` — a dash, not a `0`. This is the distinction `Meter` and the numbers band
already make and the one thing most likely to be lost in translation to a row.

---

## 3 · The two edit-sheet drafts

Local component state, confirmed by one **Save** (`patterns.md` §2, §7d). Neither is
persisted anywhere but the mutation.

```ts
// MobileEquipmentEditSheet — an owned line
interface EquipmentDraft { quantity: number; note: string }

// MobileRentalEditSheet — the manual part of a line
interface RentalDraft { audio: number; light: number; note: string }
```

Both mirror the desktop `RowEditor` drafts field for field, deliberately: the same values,
the same clamping (`Math.max(0, …)`), the same call. **A rented line reached from Equipment
has no draft** — it is read-only there and offers to open the rental order, which is the
behaviour the desktop row already has.

**A failed save keeps the draft.** The sheet stays open with every value intact and the
error inline above the fields (FR, edge cases) — the one rule in this file that is about a
loading bay with two bars of signal rather than about types.

---

## 4 · What stops being duplicated

| Today | After |
|---|---|
| `SignalFlowStatusRail` holds its own copy of the strip's base classes, its two tints and its below-`xs` control | It passes `tint` and `filter` to `event/StatusStrip` like the other four (F1) |
| `RentalTab` and `EquipmentTab` each hold `editable = !readOnly && !isMobile` | `editable = !readOnly`; whether a phone form exists is a sentence, not a boolean (M4) |
| `MOBILE_SECTION_CAPABILITIES` | `MOBILE_SECTIONS` — the capability it was named for was deleted in 6a (F3) |

---

## 5 · Ownership of filter state, unchanged

6b's rule stands and this slice adds three surfaces to it: **the strip reports, the caller
filters.** A rail derives no verdict of its own and applies no filter; the tab holds the
filter state and passes already-narrowed rows plus a `filtered` flag, so an emptied filter
reads as *"nothing left to fix"* rather than as an empty surface.

New this slice: Signal Flow's `gaps` filter (state in `SignalFlowTab`, which already holds
it for the desktop). Overview and Settings offer **no** filter, so their strips are
sentences — the first two in the application, and the case `patterns.md` §7b describes but
nothing has demonstrated.
