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

## Slice 11 — Audio output signal-flow graph (spec: `output-signal-graph`) ✅ done 2026-07-10

Live field feedback after using Slice 10: a flat, ordered per-channel hop
list doesn't show a real rig's shape — shared equipment and branching (an
amplifier feeding two speakers, a stage multi carrying unrelated channels
to unrelated destinations) don't fit a straight line. Replaces Slice 10's
chain editor outright with an interactive Sankey-style graph.

- [x] Devices are nodes (`output_devices` extended with configurable
      input/output port counts and a connector type per side — an
      amplifier really does have XLR in and Speakon out — plus a
      per-event canvas position). Cables are edges (`output_cables`)
      drawn port-to-port with a catalog picker; the mixer is an
      always-present implicit node (one or two independent ports per
      output channel), stageboxes stay output-only sources, and stage
      multis are full processing nodes whose channels route
      independently — and whose own built-in input wiring is never
      double-billed as an extra cable (`cable_item_id` forced `NULL`
      into a `stage_multi`, no picker shown for that connection).
- [x] Canvas: output-only nodes (mixer, stageboxes) pinned to a left
      rail, input-only devices pinned to a right rail, everything else
      (processing devices, stage multis) free-floating in the middle —
      drag devices to reposition, click a free port then a compatible
      free port to cable them together. A basic flat table of every
      device and cable remains available alongside the graph.
- [x] Existing Slice 10 chains — including the real, already-built
      reference rig ("LR amplifier"/"LR splitter") — convert
      automatically on startup via a one-time Go migration (not a
      `.sql` script; the branching involved has no safe SQL-only
      expression), sequenced so it can never run twice or against an
      already-settled database. Verified port-for-port, item-for-item
      against the real data, with byte-for-byte unchanged rental totals
      (SC-004).
- [x] Rental aggregation simplifies here: stereo becomes two real rows
      instead of one row doubled by a flag, so the width-based
      `CASE WHEN` logic Slices 9/10 needed disappears entirely for this
      feature's arms — a device/cable just counts once per row it
      appears in.
- [x] Signal Flow tab and output print sheet walk the cable graph from
      each mixer port, branching into multiple paths when a device fans
      out to more than one destination; a device's unwired declared
      input ports are flagged as gaps, a stage multi's unused channels
      are not (normal spare hardware capacity, not a mistake).

## Slice 12 — Audio input signal-flow graph (spec: `input-signal-graph`) ✅ done 2026-07-13

Mirrors Slice 11 on the input side, reversed in direction: Sources (left
rail) → Stageboxes/Stage-Multis/Devices (free-floating) → Channels (right
rail). Separates the physical origin of a signal from the console strip
that ends up carrying it — the old flat `audio_patch_inputs` row
conflated the two, which made double-patching (the same mic feeding two
strips at once) and a DI box's shared 2-in/2-out device impossible to
express cleanly.

- [x] `InputSource` (physical origin: mic/line, connector, width) and
      `InputChannel` (console strip: name/width/mixer_behavior/color/
      groups/DCA/notes) are fully independent rows, tied together only
      via the `input_cables` graph — never a stored FK either way.
- [x] A Source's output port may originate more than one cable at once
      (double-patching, mirroring Slice 11's Mixer fan-out exemption);
      every other port stays one-cable-per-port via a partial unique
      index. A Stagebox's/Stage-Multi's console-side hop into a Channel
      is always cableless (`cable_item_id` forced `NULL`), the mirror
      image of Slice 11's stage-multi rule.
- [x] `input_devices` is a separate table from `output_devices` (not
      reused) — the two are independent directional graphs sharing
      stagebox/stage-multi rows but never a mutable resource.
- [x] Canvas: Sources/Channels each render as one compact node listing
      every row (so the graph's height never grows per Source/Channel),
      Stageboxes/Stage-Multis/Devices free-float in between, same
      drag-and-cable interaction as Slice 11.
- [x] Color lives only on the Channel; every other port's displayed
      color is derived by tracing the graph forward to whichever
      Channel(s) it reaches — a shared color if they agree, neutral
      otherwise — reflected in the graph and as tinted rows in the
      Sources/Channels tables.
- [x] A stereo splitter cable (one physical cable feeding both sides of
      a stereo pair) is two cable rows with only one side's
      `cable_item_id` set, billed once — no stored "splitter" flag, a UI
      convenience offers the same item for the second side.
- [x] Existing rows (`audio_patch_inputs`, renamed in place to
      `input_channels`) convert automatically on startup via a one-time
      Go migration. Verified against the real reference event's actual
      data, which surfaced a genuine legacy quirk this migration now
      handles instead of crashing on: a "stereo" row's second-side
      columns sometimes duplicate a jack (or a channel number) that a
      wholly separate pre-existing row already owns — the conversion now
      detects the collision, skips the redundant synthesized side, and
      falls back to a direct cable rather than aborting. Fixing this
      also corrected a pre-existing rental-count overcount for that
      exact real event (a double-counted overhead mic/stand/cable).

## Slice 13 — Stage plots (spec: `stage-plots`) ✅ done 2026-07-18

New per-event Stage Plots tab: any number of named, to-scale, layered
drawings on a draw.io-style editor (palette / cm-native SVG canvas /
inspector + layers panel), with an approved mockup driving the design.

- [x] **To scale by construction**: 1 SVG user unit = 1 cm; elements
      store x/y/z + width/depth/height + rotation in centimetres; zoom
      is purely a viewBox transform, so proportions can never drift.
      Shapes (rect/ellipse/line/text), resources with a built-in icon
      registry — person, mic, speaker, monitor, rack, truss, fixture,
      plus one **distinct glyph per instrument** (drums, both pianos,
      keyboard, both guitars, bass, cello, trumpet, saxophone), each in
      three projection variants.
- [x] **Grid & snapping**: per-plot toggleable grid (cm spacing),
      independent snap-to-grid and snap-to-objects with alignment
      guides; snapping math runs in cm space (exact landings, SC-003),
      thresholds derive from screen px; adaptive grid density at far
      zoom.
- [x] **Layers**: create/rename/reorder/color/hide/lock, active-layer
      placement, last-layer delete protection, per-element layer moves.
- [x] **Linked resources & stacks**: one polymorphic links table serves
      inspector assignments and speaker/rack stack entries, referencing
      the event's existing sources/channels/devices/stageboxes/multis/
      fixtures by id; every entity delete path clears its links, and the
      aggregate read drops dangling rows as defense in depth. Links
      never touch the rental order.
- [x] **Trusses**: event-scoped (the shared-device pattern) — assembled
      from `picker_role = 'truss'` catalog pieces with copy-on-pick
      lengths parsed from item names ("Tross F34 2m" → 200 cm), hang
      height, fixtures attached at offsets that move with the truss.
      One new rental CTE arm counts pieces (lighting column) once per
      event regardless of placements. The Lighting tab's truss-section
      manager is superseded: fixtures' truss display is read-only,
      derived from plot attachments; legacy `truss_sections` carried
      over by the third one-time Go conversion (label-only pieces, no
      inventory link → zero rental impact) and dropped by migration 033.
      Verified byte-for-byte unchanged rental totals on the real dev DB
      ("Bakre truss" + 2 fixtures converted exactly).
- [x] **Fixture labels**: per-plot checkboxes compose name / FID / DMX
      universe.address beside each fixture, missing parts omitted.
- [x] **Three linked projections**: top (default) / front / side render
      the same rows through one pure `projectElement` function — edits
      propagate with no sync code; heights to true scale; rotation is
      plan-view-only; per-view icon variants; print sheet renders the
      active view with a scale caption.

## Dependency graph

```
Slices 0–13 ✅ done
Slice 10 (output chains) ──→ Slice 11 (output signal graph, replaces it) ✅
Slice 11 (output signal graph) ──→ Slice 12 (input signal graph, same pattern reversed) ✅
Slice 7 (lighting rig) + Slice 12 ──→ Slice 13 (stage plots; supersedes Slice 0's truss sections) ✅
```
