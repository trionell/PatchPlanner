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

Revised 2026-07-08 after field feedback on slices 0–5: five new slices
(6–10) cover rental completeness for cables & stands, lighting-rig workflow,
mixer groups & DCAs, mono/stereo channels & DI cabling, and detailed output
signal chains. Production packaging (the old Slice 6) is dropped from the
roadmap — not of interest (2026-07-08 decision). Standing invariant from
Slice 6 onward: **every planned item that exists in the price list appears
on the rental order and in the Excel export** — any later slice that adds a
new place where equipment is selected must extend the rental aggregation in
the same slice.

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

## Slice 3 — Equipment lists: rigging, misc & owned gear (spec: `equipment-lists`) ✅ done 2026-07-07

§3.2 + §3.9. A generic per-event equipment list for anything that isn't an
audio-patch row or lighting fixture.

- [x] Rented extras (rigging hardware, smoke machines, bulk cables, …) were
      already covered by Slice 1's manual rental lines; the Equipment tab now
      surfaces and edits them alongside owned gear.
- [x] Owned-gear catalog (`owned_items`, Inventory page tab) with per-event
      lines (`event_owned_equipment`, Equipment tab): quantity + note,
      over-owned flagging, cascade deletes, and tested isolation — owned gear
      can never reach the rental order or the export.

## Slice 4 — Configurable reference data (spec: `reference-data`) ✅ done 2026-07-08

Full Principle II compliance + §3.5.

- [x] `reference_values` lookup table seeded with all eight vocabularies
      (signal types, preamp connectors, signal/speaker cable types, output
      types, mic stands, power connectors, truss types); values stored as
      text on planning rows, so the upgrade changed zero rows.
- [x] CHECK constraints on signal_type/mic_stand/output_type/truss_type
      dropped via table rebuilds (see research.md R1 for the deferred-FK
      subtleties); destination_type and power_connection stay structural.
- [x] All frontend dropdowns driven by `GET /api/v1/reference-data`
      (`useReferenceData` hook, legacy values merged per row); the
      hard-coded arrays in `lib/constants.ts` are gone.
- [x] `fixture_modes` table + per-model editor on the Inventory page;
      picking a mode copy-fills name and channel count on the rig fixture
      (copy-on-pick — mode edits never rewrite rigs); re-import leaves
      vocabularies and modes untouched (tested).
- [x] Settings page: add / rename-label / delete with duplicate rejection
      and in-use delete protection (409 with usage count).

## Slice 5 — Print & signal flow (spec: `print-signal-flow`) ✅ done 2026-07-08

§3.7 + §3.4.

- [x] Print-friendly views (print-only sheet components + CSS print rules)
      for input patch, output patch, and lighting rig; per-tab Print button
      opens the browser dialog (paper or save-as-PDF) with event header,
      black-on-white tables, repeating column headers, and no UI chrome.
- [x] Read-only Signal Flow tab per input channel
      (source → cable → stagebox/multi channel → console) built from the
      existing audio-patch response by a unit-tested pure function; missing
      links flagged and counted, direct-to-console shown without false gaps;
      the view prints like the sheets. No graph library, no new endpoints.

## Slice 6 — Rental completeness: cables & stands (spec: `rental-cables-stands`) ✅ done 2026-07-09

Feedback item 3. Cables and mic stands were selected on patch rows but never
reached the rental order or the Excel export.

- [x] Cable selection on inputs/outputs is a pick from inventory cable items
      (`cable_item_id`, the `mic_item_id` pattern) — the item encodes type +
      length ("Mikrofonkabel — 4m"); mic stand likewise (`stand_item_id`).
      Which categories feed each picker is data: `picker_role` on
      `inventory_categories`, seeded by migration, import-safe, editable per
      category on the Inventory page.
- [x] Conservative 019 backfill: only XLR + exact-length rows with a unique
      catalog match convert; everything else (other types, output cables,
      stands) keeps read-only legacy text until re-picked — verified against
      a copy of the real dev DB.
- [x] Rental aggregation counts cable/stand picks by item id (three new CTE
      arms); pricing, over-stock and discontinued flagging, manual-line
      merging, and the Excel export all apply unchanged. Print sheets and
      signal flow show the picked item labels.
- This establishes the standing invariant (see intro); slices 9 and 10 must
  extend the count for the cable pickers they add.

## Slice 7 — Lighting rig workflow (spec: `lighting-fixture-workflow`) ✅ done 2026-07-09

Feedback items 5–7. Independent of the audio slices.

- [x] `fixture_number` attribute on rig fixtures (the GrandMA fixture ID,
      shown as "FID"): editable in the table, duplicates flagged (never
      blocked), printed as the sheet's first column.
- [x] Bugfix: the Add Fixture dialog offers the selected catalog model's
      DMX modes (same cached query as the table cell, copy-on-pick, reset
      on model switch) instead of only free text.
- [x] Bulk-add fixtures: model + quantity + shared values (mode, truss
      section, universe, power) with fixture IDs incrementing from a
      suggested start; transactional endpoint appends positions and DMX
      addresses after the universe's occupied range (all-or-nothing,
      409 on overflow); existing fixtures never touched.

## Slice 8 — Mixer buses: groups & DCAs (spec: `groups-dcas`) ✅ done 2026-07-09

Feedback items 8–9 + channel-strip colors (added mid-slice).

- [x] Per-event **groups**: created/renamed/deleted in their own manager
      (like stageboxes); `LR` is always present as a built-in group
      (recolorable, never renamed/deleted) and is the default routing for
      new and pre-existing channels. Each input channel selects the set of
      groups it routes to (badge multi-select, explicit no-routing allowed).
- [x] Per-event **DCAs**: same management pattern; the channel's DCA is a
      multi-select over the event's DCAs instead of the old `dca_groups`
      string — migration 021 converted every legacy value (comma-split,
      whitespace-merged, per event) and dropped the column.
- [x] **Colors**: groups, DCAs, input channels, and output channels each
      carry an optional console channel-strip color from the
      `channel_colors` reference vocabulary (8 seeded, Settings-editable);
      shown in both patch tabs and printed on the input/output sheets
      (swatch + tinted names, print-color-adjust).
- [x] Input patch print sheet and Signal Flow tab show group/DCA
      assignments; no rental impact (verified unchanged on real data).

## Slice 9 — Mono/stereo channels & DI cabling (spec: `stereo-di`) ✅ done 2026-07-09

Feedback items 1–2. Data-model change on both patch directions.

- [x] Channel width **mono | stereo** on inputs and outputs. A stereo
      channel's two physical connections are **independently patchable**
      (own stagebox/multicore route each — not required to be neighboring
      channels or even the same box, e.g. a crowd-mic pair on opposite
      sides of the stage); flipping to stereo defaults side B to side A's
      route at the next channel as a one-time convenience, never silently
      reapplied. Input-only mixer behavior: *stereo channel* (one console
      number) vs *linked channels* (its number and the next, e.g. "5–6");
      suggested numbering for new rows skips occupied linked pairs.
      Channel numbering, both patch tabs, print sheets, and Signal Flow all
      show both sides.
- [x] DI cabling: a DI-type channel picks a **source cable** (source → DI)
      alongside the existing DI → preamp cable. A stereo DI channel chooses
      *two individual cables* (source cable counted ×2) or *one splitter*
      (3.5 mm TRS → 2×TS, counted ×1) — the DI box itself always counts
      once (a dual-channel DI feeds both sides). Signal Flow traces the
      full source → source cable → DI → XLR → console chain and flags a
      missing source cable as a gap.
- [x] Rental aggregation extended: stereo channels double per-side physical
      equipment (mic/source item, cable, stand, and on outputs the
      speaker); two-channel devices (the DI box, an amplifier) stay
      single-counted regardless of width. DI source cables are picked from
      the same cable catalog and counted like all cables (Slice 6
      pattern) — closes the price-list leak verified against the real
      reference event's DI channels (SC-002/SC-003).
- [x] Purely additive migration (022): every pre-existing row defaults to
      mono/stereo_channel/two_cables with no side-B routing and no source
      cable — verified byte-for-byte unchanged rental totals on the real
      reference event (SC-005).

## Slice 10 — Output signal chains (spec: `output-chains`) ✅ done 2026-07-09

Feedback item 4, the deepest model change — depends on Slices 6 and 9.
Today an output is just source + destination; real rigs are multi-hop
chains that branch.

- [x] Per-output **chain of hops** (`output_chain_hops`, replacing the flat
      destination/amplifier/speaker/cable shape): each hop is a `device`
      pick (inventory, owned gear, or a declared shared device) or a
      `route` hand-off onto a stagebox/stage-multi channel (with its own
      independent side B on a stereo channel), plus its own cable —
      models mixer → stagebox out → controller → amplifier → sub 1 →
      sub 2 (chained) → speaker top as readily as the trivial local-out →
      active-speaker case, with no forced extra steps for the simple rig.
- [x] **Shared output devices** (`output_devices`, its own per-event
      manager): declared once, referenced by position from any number of
      output channels' chains, counted exactly once on the rental order
      regardless of reference count — closes the fan-out gap (a
      multichannel headphone amp feeding 8 IEM mixes no longer needs to be
      double-booked or omitted). Deleting one clears every referencing
      hop instead of blocking, matching stagebox/stage-multi delete
      behavior.
- [x] Each hop's device (inventory items only — owned-gear hops are
      structurally excluded, Slice 3's invariant) and any hop's cable
      (Slice 6 pattern) are counted on the rental order; a stereo channel
      doubles per-hop, non-shared items exactly as the old
      speaker/cable arms did, while a shared-device hop stays single —
      generalizing Slice 9's amplifier-never-doubles rule.
- [x] Migration 023 is non-destructive: every existing output row converts
      losslessly into an equivalent chain (the old amplifier becomes a
      one-off shared device to preserve its non-doubling; the old speaker
      becomes a plain hop; the old destination becomes a route hop) —
      verified byte-for-byte unchanged rental totals against the real
      reference event's LR output.
- [x] Signal Flow tab and output print sheet render the full chain per
      channel, hop by hop, with any hop missing its device (or route)
      flagged as a gap — mirroring the input-side presentation from
      Slice 5/9.

## Dependency graph

```
Slices 0–10 ✅ done — roadmap complete
```
