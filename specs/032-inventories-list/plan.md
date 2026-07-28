# Implementation Plan: The inventory list, and the catalogs nobody could see

**Branch**: `032-inventories-list` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/032-inventories-list/spec.md`

## Summary

The last card list becomes one panel, and the number that has been guarding the
delete since Slice 16 becomes a column.

**The list.** One `PatchPanel` — bar with a search field and one primary action,
navigation-tier rows carrying name, items, categories, **used on** and source,
and a strip that redraws against the search. A row click opens the catalog. The
three ghost buttons per row become one control opening a drawer.

**The drawer.** One `ui/Drawer` at `narrow`, serving create and manage from two
entry points, built entirely from `ui/GearList` — the drawer language Rig, Buses
and Universes are made of. Rename lives in its form, duplicate is the section's
action, delete is **absent** when events depend on the catalog and asks in place
when they do not. A *Used on* section lists every bound event as a link.

**The counts.** `GET /inventories` gains three per row — items, categories, and
bound events — as sub-selects. That deletes N requests from the page it serves:
today the list fetches all 308 items of every imported catalog to call
`.length`. One new read-only route, `GET /inventories/{id}/events`, gives the
drawer the events themselves.

No migration, no new `components/ui/` file, no new dependency. The page's derived
structure — what the search leaves and what the strip says about it — is one pure
module, `lib/inventoryList.ts`, tested without rendering anything.

## Technical Context

**Language/Version**: Go 1.25 (backend), TypeScript 5 / React 18 (frontend)

**Primary Dependencies**: chi router, `modernc.org/sqlite`; TanStack React Query,
react-router-dom, Tailwind. Nothing added.

**Storage**: SQLite, unchanged. Three counts are computed per request as
correlated sub-selects over `inventory_items`, `inventory_categories` and
`events`; nothing is stored and there is no migration.

**Testing**: Go `httptest` for the two handlers and `go test` for
`internal/db`; Vitest for `lib/inventoryList.ts`. Per the constitution's
pragmatic-testing rule the tests land on the query, the payload and the pure
module — not on the rendering.

**Target Platform**: Single Go binary serving an embedded SPA; desktop browsers
plus a mobile branch driven by `useIsMobile`.

**Project Type**: Web application — `backend/` (Go) + `frontend/` (React/TS + Vite).

**Performance Goals**: Rendering the list issues **exactly one** request,
however many catalogs exist (today: 1 + N, each returning the catalog's entire
item list). The drawer issues one more, only when opened.

**Constraints**: The counts must come from the same predicate the delete guard
uses, so the column and the refusal cannot disagree. The *Used on* section must
carry no height of its own, so a catalog bound to forty events scrolls the
drawer body rather than a private box inside it.

**Scale/Scope**: One page's list view rewritten, one new drawer component, one
new pure module, one endpoint extended, one endpoint added, two tab labels.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — see below.*

| Principle | Assessment |
|---|---|
| **I · Domain-First Data Model** | **Pass.** A catalog's binding to an event is already a first-class relationship (`events.inventory_id`); this slice traverses it in the one direction nothing had traversed — from the catalog to the shows that depend on it — and shows the result rather than inventing a field to hold it. Nothing becomes free text. |
| **II · Extensibility by Design** | **Pass.** No enum, no vocabulary, no branch on a category name. The *source* column renders `sourceFormat` as data, and an unknown format falls back to the plain filename rather than to a new case. |
| **III · Full-Stack Monorepo Architecture** | **Pass.** The added route is resource-oriented (`GET /inventories/{inventoryID}/events`) and lives inside the existing owner-guarded group; handler in `internal/api`, query in `internal/db`, no new package, no migration. |
| **IV · Inventory-Driven Rental Workflow** | **Pass, and reinforced.** *"No inventory may be a dead end"* — a catalog whose bindings are invisible is a soft dead end, since the user cannot see what would break if it changed. The `sourceFormat` column also puts the reason for the price-list export's presence or absence on screen for the first time. |
| **V · Pragmatic Simplicity** | **Pass.** One drawer serves four operations because they are the same operation on the same object; no `components/ui/` change, because every primitive already exists — which is the test of whether this is one language or several. The counts are three sub-selects in an existing query rather than a summary endpoint. |

**Gate result: pass.** No entries in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/032-inventories-list/
├── mockup.html                 # approved, revision 4 — the visual source of truth
├── spec.md
├── plan.md                     # this file
├── research.md                 # Phase 0
├── data-model.md               # Phase 1
├── quickstart.md               # Phase 1
├── contracts/
│   └── inventories-api.md      # Phase 1
├── checklists/
│   └── requirements.md
└── tasks.md                    # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/internal/
├── domain/inventory.go              # Inventory gains 3 omitempty counts
├── db/
│   ├── inventories.go               # list query gains 3 sub-selects;
│   │                                #   + ListEventsForInventory
│   └── inventories_test.go          # counts, and the events list
└── api/
    ├── inventories.go               # + listEvents handler, + route
    └── inventories_test.go          # payload counts; events route; non-owner 404

frontend/src/
├── types/index.ts                   # Inventory: itemCount/categoryCount/eventCount
├── api/inventories.ts               # + listInventoryEvents
├── lib/
│   ├── inventoryList.ts             # new — filter + strip totals, pure
│   └── inventoryList.test.ts        # new
├── components/inventory/
│   └── InventoryDrawer.tsx          # new — create + manage, one construction
└── pages/Inventories.tsx            # tabs renamed; InventoryList/InventoryRow
                                     #   replaced; Manage in the detail bar;
                                     #   the create Dialog deleted
```

**Structure Decision**: Web application, existing directories only. The drawer
joins `components/inventory/` beside `InventoryDrawers.tsx` (Categories and
Import) rather than becoming a fourth export of that file — it is opened from a
different surface and shares no state with them.

## Delivery order

Each step is a commit, and each leaves the tree green.

1. **The counts** — domain fields, the list query's sub-selects,
   `ListEventsForInventory`, the handler and the route, with Go tests. The
   frontend does not read them yet; nothing renders differently.
2. **The pure module** — `lib/inventoryList.ts` and its tests. Nothing imports
   it yet.
3. **The list** — `InventoryList`/`InventoryRow` replaced by the panel, the
   tabs renamed, the mobile branch added.
4. **The drawer** — `InventoryDrawer.tsx`, wired to the row control and to a
   **Manage** control in the catalog panel's bar. Both `window.*` calls and the
   create `Dialog` are deleted here, which is why steps 3 and 4 land together
   rather than leaving the tree without a way to rename.
5. **The documents** — `design/audit.md` records that the last card list is
   gone; `design/patterns.md` gains the two rules this slice had to state out
   loud; `ROADMAP.md` gains the slice.

Steps 1–2 are independently reviewable and cannot regress the interface; step 3
is where the page changes; step 4 is where the browser dialogs die.

## Phase 0 — Research

Six questions, in [research.md](research.md): where the counts are computed
(R1), whether the drawer's event list needs its own route (R2), where the
counts live on the wire (R3), what the drawer's interior tier is and why the
mockup got it wrong twice (R4), why *Used on* takes no height (R5), and what
belongs in the pure module (R6).

## Phase 1 — Design & Contracts

- [data-model.md](data-model.md) — the three derived counts and the binding
  they traverse; no schema change.
- [contracts/inventories-api.md](contracts/inventories-api.md) — the extended
  list payload and the new events route, with their error cases.
- [quickstart.md](quickstart.md) — how to see it work, including the
  forty-event case and the two states that used to be browser dialogs.

### Constitution re-check, post-design

Unchanged: **pass**. The design added one route and no package, no dependency,
no migration and no `components/ui/` file. The one thing worth re-stating after
design is Principle V: the drawer is a single component whose mode is implied by
whether it was given a catalog, rather than two components sharing a layout —
the same call `GearForm` makes about adding and editing, and the reason the two
look like one operation.

## Complexity Tracking

No violations. Nothing to record.
