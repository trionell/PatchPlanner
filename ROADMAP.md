# PatchPlanner — Implementation Roadmap

Master plan to take PatchPlanner from its current state to a finished v1.
Each numbered slice (except Slice 0) is delivered through the Spec-Kit
workflow: `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` →
`/speckit-implement`, on its own feature branch.

Decisions baked into this roadmap (2026-07-07):

- **No rewrite.** The existing codebase builds clean, matches the constitution's
  architecture, and is small (~3.6k LOC). Refactoring is incremental.
- **Principle II — full compliance.** Connector types, cable types, signal
  types, mic stands, and DMX channel modes move from code enums / CHECK
  constraints to configurable database records (Slice 4).
- **Testing — pragmatic.** Lint + CI for both sides; Go `httptest` coverage for
  API handlers and the import/export/rental logic; Vitest only for non-trivial
  frontend logic.
- **All PROJECT.md §3 groups are in scope** except video equipment (§3.3) and
  multi-event/tour planning (§3.10), which remain post-v1.

## Slice 0 — Hardening & tooling (no spec needed; bug fixes) ✅ done 2026-07-07

Direct fixes on `main`, no Spec-Kit ceremony:

- [x] Enforce SQLite foreign keys on every pooled connection (DSN pragma, not
      a one-off `db.Exec` in `internal/db/db.go`). Deletes of stageboxes,
      multis, fixtures, and truss sections now clear referencing rows first;
      event deletion actually cascades.
- [x] Fix `AutoAssignDMX` to respect each fixture's assigned universe instead
      of re-packing everything from universe 1; >512-channel universes now
      fail with a 409 instead of silently spilling over.
- [x] Add truss section CRUD endpoints + UI (manager panel on the Lighting
      tab; fixture rows assign sections from a dropdown).
- [x] Split `frontend/src/pages/EventDetail.tsx` (800+ lines) into per-tab
      components under `components/event/` plus shared `lib/constants.ts` and
      a `useDraftState` hook.
- [x] Add `golangci-lint` config + ESLint (flat config) + Vitest; CI workflow
      at `.github/workflows/ci.yml` runs vet/test/lint on both sides.
- [x] Sync README API reference with actual routes and fix the
      migration-rule claim (multi-statement files apply fully; single-statement
      is kept as a convention).
- [x] Make listen address, DB path, migrations path, CORS origin, and
      `LL.xlsx` path configurable via environment variables.

## Slice 1 — Rental order correctness (spec: `rental-order-correctness`)

The core value proposition ("the rental order is derived automatically") is
currently only ~half true: mics, stageboxes, stage multis, cables, and stands
are never counted.

- Replace free-text `audio_patch_inputs.mic_model` with
  `mic_item_id REFERENCES inventory_items(id)` (migration + data backfill by
  name match).
- Link cables and mic stands to inventory items where the price list has them.
- Extend the rental summary aggregation to count: mic/DI/IEM items, stagebox
  inventory items, stage multi inventory items, cables, stands.
- Add write API for `event_rentals` (manual line items — the table exists but
  is unreachable today).
- Stock validation (§3.6): flag any line where planned quantity exceeds
  `quantity_available`, in both API response and UI.
- Tests: rental aggregation, xlsx import, patch CRUD (httptest).

## Slice 2 — Excel rental order export (spec: `xlsx-rental-export`) ✅ done 2026-07-07

The most pressing missing feature (§3.1). Depends on Slice 1 for correct
quantities.

- [x] Quantities written into a copy of `LL.xlsx` at the stored `xlsx_row`
      positions, columns located by header text; stale template quantities
      cleared; name-at-row verified before every write; everything else
      untouched (Constitution IV).
- [x] `GET /api/v1/events/{id}/rental-export` (download) +
      `/rental-export/report` (unplaced-lines preflight); Export button wired
      with notices for unplaceable lines.
- [x] Round-trip test: import → plan → export → re-import leaves the catalog
      unchanged; 7 writer/endpoint tests total.

## Slice 3 — Equipment lists: rigging, misc & owned gear (spec: `equipment-lists`)

§3.2 + §3.9. A generic per-event equipment list for anything that isn't an
audio-patch row or lighting fixture.

- Per-event equipment list referencing inventory items (rigging hardware,
  smoke machines, cables bought in bulk, …) with quantity + audio/lighting
  split; feeds `event_rentals` so it lands in the summary and export.
- Owned-gear catalog: items not in the rental catalog, attachable to plans,
  excluded from the rental order and export.

## Slice 4 — Configurable reference data (spec: `reference-data`)

Full Principle II compliance + §3.5.

- Lookup tables (with seed migrations) for: preamp/cable connector types,
  cable types, signal types, output types, mic stand types, power connector
  types, truss types.
- Drop the corresponding CHECK constraints; drive all frontend dropdowns from
  a `/api/v1/reference-data` endpoint instead of hard-coded arrays.
- `fixture_modes` table linked to inventory items: selecting a DMX mode
  auto-fills the channel count; modes editable per fixture model.
- Minimal admin UI (settings page) for adding values.

## Slice 5 — Print & signal flow (spec: `print-and-signal-flow`)

§3.7 + §3.4.

- Print-friendly views (CSS print stylesheets) for input patch, output patch,
  and lighting rig; per-tab Print button.
- Read-only signal-flow view per input channel
  (mic → cable → stagebox/multi channel → mixer channel) to catch patching
  errors; text/table-based first, no graph library.

## Slice 6 — Production packaging (spec: `production-binary`)

§3.8, constitution Principle III. Ships v1.

- `go:embed` the Vite build output; serve SPA with fallback routing from the
  Go binary.
- Embed migrations via `iofs` source so the binary runs from any directory.
- Build script / Makefile producing the single binary; document the release
  flow in README.
- Final pass: `go vet`, `golangci-lint`, `tsc --noEmit`, ESLint, full test
  suite green.

## Dependency graph

```
Slice 0 ─→ Slice 1 ─→ Slice 2 ─→ Slice 6
              │           ↑
              └→ Slice 3 ─┘
Slice 4 (independent, any time after 0)
Slice 5 (independent, any time after 0)
```
