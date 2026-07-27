# Implementation Plan: The pages, and what is left over

**Branch**: `wave-4-5-convergence` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

## Summary

Five surfaces converge and three are left alone. Six pieces:

1. **The usage count** — one field on `domain.ReferenceValue`, populated by the
   function the delete guard already calls. The wave's only backend work, and it
   lands first so the vocabulary panel has something to render.
2. **The rail** — the construction Inventories and the vocabularies share, built
   once as a column of `PatchPanel` and used twice. Two uses in one wave is what
   justifies building it rather than laying out each surface by hand.
3. **The inventory catalog** — panel, rail, sheet, two drawers, and the modes
   dialog deleted.
4. **Owned gear** — the same conversion without a rail.
5. **Vocabularies** — the rail's second use, on Settings and My Defaults.
6. **The dashboard** — a rebuild, and the one place the sanctioned pulse goes.

Then the small ones — Events' search, Login's retyped button, the start page's one
radius — and the documentation that closes A4, A6 and A7 for good.

### The plan's two decisions

**The usage count is a query, and Wave 4's summary was not** — see
[research.md](./research.md) R1. The two answers look contradictory and are the
same rule applied twice: the derivation lives once, where the data is. Overview's
figures walk graphs the browser already holds; a reference value's usage is a
count over eight tables only the database can see, and `countReferenceUsage` is
already written.

**The rail is a column of the panel, not a drawer** (R2). A category filter you
cannot see all of is a filter that does not work, and the same is true of nine
vocabularies. What *does* go in a drawer is category *management* — a category is
declared once and referenced by every item, which is the drawer rule stated
exactly.

## Technical Context

**Language/Version**: TypeScript 5, React 18; Go 1.25 for one struct field.

**Primary Dependencies**: unchanged. No new dependency in either language.

**Storage**: SQLite, **no migration**. The usage count is computed, not stored.

**Testing**: Go `testing` for the usage count against the delete guard; Vitest for
`lib/dashboard.ts`'s date partitioning. `tsc -b`, `eslint`, `vitest`, `go vet`,
`go test` as gates. The visual claims are in [quickstart.md](./quickstart.md).

**Target Platform**: desktop browsers; every `isMobile` branch untouched.

**Project Type**: web — `frontend/` and a few lines of `backend/`.

**Performance**: `ListReferenceData` gains ~55 `COUNT(*)` queries per call on a
fully-populated event — one per value per usage table. Local SQLite, on a settings
page nobody polls. If it ever matters it becomes one grouped query per vocabulary;
it is not worth the complexity now.

**Constraints**: `components/ui/` may change only in `Button.tsx`, only by
addition (FR-053). Every Wave 4 surface is frozen.

**Scale/Scope**: 1 Go field + its test, 2 new pure modules with tests, ~10 new
components, 5 surfaces rewritten, 1 shared component widened.

## Constitution Check

| Principle | How this slice honours it |
|---|---|
| **I · Derived, not stored** | `usageCount` is computed per request from the plan tables; nothing caches it, so it cannot go stale. |
| **II · Vocabularies are data** | This is the surface where vocabularies *are* edited, and it still hard-codes nothing: the nine names come from `domain.Vocabularies` via the API response, and an unknown one is ignored rather than fatal. |
| **III · One event, one plan** | The Settings panel states in its strip that it is the event's own copy — the fact Slice 17 established and no surface has ever said out loud. |
| **IV · Explicit over implicit** | `In use` replaces "try it and see whether the server refuses". A refusal the interface could have predicted is a bug in the interface. |
| **V · Fix, don't abstract** | `countReferenceUsage` is *called*, not reimplemented, which is the whole point of FR-033. And the rail is extracted only after the second caller exists, not before. |

## Phases

Each phase is one commit and leaves the application working.

### Phase 1 · The usage count

`domain.ReferenceValue.UsageCount`, populated in `ListReferenceData`; the template
response deliberately without it. A Go test pinning it to the delete guard.

### Phase 2 · The rail

`ui/PanelRail.tsx` — a filter column for a `PatchPanel`. Built here rather than
inside Inventories because Phase 5 is its second caller, and extracting after the
fact means touching a finished surface.

> This is the one place the plan risks Principle V. The mitigation is that both
> callers are in this wave: if the second one had needed something different, the
> honest answer would have been two local columns.

### Phase 3 · The inventory catalog

Panel, rail, sheet, row editor with the modes notice, `Categories` and `Import`
drawers, strip. The modes dialog and both always-open forms deleted. The list view
gains counts and a primary action.

### Phase 4 · Owned gear

The same conversion, no rail, no drawer.

### Phase 5 · Vocabularies

`VocabularyPanel`, used by `SettingsTab` and `MyDefaults`; `VocabularyCard`
deleted.

### Phase 6 · The dashboard

`lib/dashboard.ts` partitions events into next / upcoming / past; the hero, the
dated rows, the strip, and the pulse.

### Phase 7 · The small ones

Events' search and empty state; `Button`'s exported classes and Login's use of
them; the start page's one radius.

### Phase 8 · Gates and documentation

Every gate in quickstart. `design/audit.md` closes A4, A6 and A7 and records the
start-page exemption; `design/principles.md` records it in P2, where the start
page is currently listed as a navigation surface without qualification;
`design/patterns.md` gains the rail; `design/design-language.html` is republished.
`ROADMAP.md`, `PROJECT.md`.

## Risks

| Risk | Mitigation |
|---|---|
| The rail is extracted before its second caller is written | Both callers land in this wave, two phases apart. If Phase 5 needs a different shape, the rail is inlined into Phase 3 and the abstraction is deleted rather than parameterised. |
| `ListReferenceData` gains N queries | Measured in the Go test's timing, not guessed. Local SQLite, ~55 counts, a settings page. Stated in the plan so the next person knows it is deliberate. |
| The pulse annoys | It is on one page, wrapped in the media query the language requires, and it is the animation `tokens.md` already sanctions by name. |
| `Button`'s class export invites retyping elsewhere | It is exported *because* Login was retyping it. The comment says so, and the only caller is Login. |
| Deleting `VocabularyCard` breaks My Defaults | Both callers are rewritten in the same phase, and `tsc -b` fails loudly on a dangling import. |

## What this plan does **not** do

- No migration, no new endpoint, no new route.
- No sorting, no bulk edit, no cross-category move.
- No conversion of the start page — the exemption is the decision.
- No rail on the phone: Inventories keeps its category dialog and Settings its
  stacked cards there.
