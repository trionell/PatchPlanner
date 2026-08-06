# PatchPlanner — Implementation Roadmap

## What remains

**Slices 0–38 are delivered.** This file is a per-slice record written after
delivery; everything below this section is history. What is left is only this:

| | |
|---|---|
| Slice 40 | ✅ The audio exports became one document — five sections, two orientations, one endpoint; merged 2026-08-06 |
| Slice 41 | ✅ The plot on paper — four sheets at one stated scale, registered views, and the dark-to-white colour rule; merged 2026-08-06 |

Post-v1 and deliberately out of scope: video equipment (PROJECT.md §3.3) and
multi-event/tour planning (§3.11).

**This table is where the next piece of work goes.** A new slice or an approved
defect takes a row here and loses it when it lands — an empty table means the
roadmap is asking, not that the tool is finished. Reach any section by heading
rather than by line number: `grep -n '^## Slice 31' ROADMAP.md`. A closed defect
keeps its section and gains a ✅. The dependency graph is at the foot of the file.

**Grep this file; do not read it whole** — it is ~1,500 lines and the rest is
retrospective.

---

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
Slice 6 onward: **every planned item that exists in the catalog appears on
the rental order and in every export format** (price-list xlsx where the
inventory earns it, plus the PDF and generic spreadsheet from Slice 22) —
any later slice that adds a new place where equipment is selected must
extend the rental aggregation in the same slice.

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

## Slice 14 — Authentication (spec: `auth`) ✅ done 2026-07-20

The app has no authentication today — any browser can hit every API route.
Prerequisite for deploying anywhere real. Depends on nothing existing;
unblocks every slice after it.

**Note**: this slice makes Constitution Principle V's statement
*"Authentication is out of scope for v1; the tool is single-user, locally
hosted"* factually false. A `/speckit-constitution` amendment (MINOR bump)
striking that line and adding OAuth + DB-backed sessions to the Technology
Stack table should happen alongside or just before implementation.

- [x] Google OAuth 2.0 authorization-code flow, fully backend-driven (browser
  full-navigation redirects, never `fetch`, so the OAuth dance itself never
  touches CORS): `GET /api/v1/auth/google/login` → Google consent →
  `GET /api/v1/auth/google/callback` exchanges the code server-to-server
  (`golang.org/x/oauth2` + `/google`, the one new backend dependency — no
  heavier ID-token-verification library needed since the code exchange is
  already an authenticated, TLS-protected server call), fetches the profile
  from Google's userinfo endpoint, checks the email against
  `PATCHPLANNER_ALLOWED_EMAILS` before touching the `users` table, upserts a
  `users` row keyed on the immutable Google `sub`, creates a session, sets an
  `HttpOnly`/`SameSite=Lax` cookie, redirects to the frontend Dashboard. A
  rejected (not-allow-listed) login creates no user row and redirects to a
  plain error message on the login page.
- [x] New `users` (id, google_sub, email, name, picture_url, created_at,
  last_login_at) and `sessions` (token_hash, user_id, created_at, expires_at
  — only the SHA-256 of the opaque token is stored, never the raw cookie
  value) tables, migration `036_auth`. `users.id` is the FK target Slice 15's
  membership table will reference.
- [x] First `internal/api/middleware` package: `RequireAuth` reads/validates the
  session cookie and injects the loaded user into request context via a
  typed key; `UserFromContext` is the seam Slice 15 hooks per-event role
  checks onto. `NewRouter` gains an `AuthConfig` param and wraps all existing
  handler registration in one `r.Group` behind this middleware (auth routes
  and `/health` stay outside it) — establishing the pattern once instead of
  touching every handler individually.
- [x] `GET /api/v1/auth/me` (protected — its own 401 *is* "not logged in") and
  `POST /api/v1/auth/logout` (deletes the session row, clears the cookie,
  idempotent).
- [x] CORS: `AllowCredentials: true` (origin already comes from a specific env
  var, never a wildcard, so this is a safe one-line change).
- [x] Frontend: a deliberately minimal `Login.tsx` (heading + "Sign in with
  Google" link + error banner), `useCurrentUser` hook (TanStack Query over
  `/auth/me`), a `RequireAuth` route guard wrapping the existing route tree,
  an unguarded `/login` route, a logout action in `Layout.tsx`'s header.
  `api/client.ts`'s `request()` adds `credentials: 'include'` and a 401→
  redirect-to-login branch (excluding `/auth/*` paths, which expect 401s).
- [x] New env vars: `PATCHPLANNER_GOOGLE_CLIENT_ID`, `_CLIENT_SECRET`,
  `_REDIRECT_URL`, `PATCHPLANNER_FRONTEND_URL`, `PATCHPLANNER_ALLOWED_EMAILS`,
  `PATCHPLANNER_SESSION_TTL` (default `720h`).
- [x] `quickstart.md` walks a first-timer through Google Cloud Console setup:
  OAuth consent screen (External, Testing mode — add each allowed person as
  a Google test user, in addition to the app's own allow-list env var),
  OAuth Client ID (Web application), authorized JavaScript origin, and
  authorized redirect URIs for both localhost and the future prod callback.
- [x] Tests: Go `httptest` for the allow-list function, session CRUD, the
  middleware's 401/200 branches, and the callback flow against a fake
  identity-provider interface (never dials real Google); existing API tests
  need only `testutil_test.go` updated to seed one authenticated test
  session, not per-file changes. The real Google browser round-trip is
  manual-only, documented as such.
- [x] Known seam for Slice 16: the cookie's `Secure` flag is derived from
  `r.TLS != nil`, which is wrong once TLS terminates at a reverse proxy in
  front of the Go binary — Slice 16 must decide how to trust
  `X-Forwarded-Proto` (or force the flag via env var).

## Slice 15 — Event ownership & sharing (spec: `event-sharing`) ✅ done 2026-07-20

A simple ownership/contributor/viewer permission model scoped to *events*
(no finer-grained audio/lighting split), so events can be shared with
collaborators without giving away edit access to everyone. No mail server:
invitees must already have a `users` row (signed in at least once) before
they can be invited. Depends on Slice 14 (needs `users` and the auth
middleware/context seam).

- [x] `events` gains `owner_user_id` (nullable at the schema level; every event
  created after this slice always has one). A new `event_memberships` table
  (`event_id`, `user_id`, `role` — `contributor` | `viewer`, `invited_by`,
  `created_at`) covers everyone who isn't the owner. Owner always has full
  access; `contributor` has full read/write access including inviting
  further contributors/viewers; `viewer` is read-only (printing/exporting
  counts as reading — those endpoints require only viewer-level access, not
  write).
- [x] Existing events created before this slice have no owner yet (they predate
  any user). Bootstrap rule: the very first user ever to log in
  system-wide (i.e., the first row ever inserted into `users`) is
  auto-assigned as owner of every pre-existing ownerless event, on that
  first login — needs no new env var and works regardless of which email
  happens to sign in first; confirm/adjust in this slice's own plan.md
  before implementation.
- [x] Second authorization middleware layer (per-event), built on Slice 14's
  `UserFromContext`: resolves the `{eventID}` URL param, checks
  owner/membership, and gates by HTTP method — safe methods (`GET`) require
  at least `viewer`; mutating methods require `owner` or `contributor`.
  Applied to the existing `/events/{eventID}/...` route group (audio patch,
  lighting, rentals, stage plots, etc. — all of it, unchanged internally,
  just gated at the group level).
- [x] `GET /api/v1/events` (and the Dashboard's recent-events query) scoped to
  events the current user owns or is a member of — no more "returns
  everything to anyone."
- [x] New endpoints: `GET /api/v1/events/{eventID}/members` (list with roles),
  `POST .../members` (invite an existing user by id + role), `PATCH
  .../members/{userID}` (change role), `DELETE .../members/{userID}`
  (remove) — all requiring owner/contributor. `GET /api/v1/users` lists
  known users (id, name, email, picture) for the invite picker — only
  populated by people who've signed in at least once.
- [x] Frontend: an "Invite" dialog on the event detail page (visible only to
  owner/contributor), a members list with role management, role badges on
  Dashboard/Events list, viewer-mode UI (disable/hide mutating controls
  everywhere a viewer can reach; print/export stays enabled).
- [x] Tests: membership CRUD, the per-event authorization middleware's
  method/role matrix, events-list scoping, viewer-cannot-mutate on a
  representative sample of existing mutating endpoints.

## Slice 16 — Inventory ownership & duplication (spec: `inventory-ownership`) ✅ done 2026-07-20

Field feedback after using Slices 14/15 live (2026-07-20): the inventory
catalog is currently one single global table shared by every user, which
makes no sense once events belong to different owners — each user's price
list, stock levels, and re-imports should be theirs alone, not silently
shared with (or overwritten by) everyone else. This is one of the largest
schema changes in the project's history: nearly every planning table
(mic/cable/stand picks, output devices, truss pieces) references
`inventory_items` generically, so scoping the catalog touches the whole
domain model's FK graph. Depends on Slices 14 (users) and 15 (event
roles); the exact backfill/validation details below are a starting design
to be finalized in this slice's own `/speckit-specify` → `/speckit-plan`
pass, not fully locked here.

- [x] New `inventories` table (id, owner_user_id, name, created_at).
  `inventory_categories` and `inventory_items` gain an `inventory_id` FK —
  the catalog becomes per-inventory-instance, not one global table.
  `events` gains an `inventory_id` FK, picked at event creation from among
  the creating user's own inventories (never a foreign one).
- [x] Bootstrap: the existing single global inventory becomes a real
  `inventories` row, claimed by whoever logs in first after this ships —
  the same idempotent `WHERE owner_user_id IS NULL` pattern Slice 15 used
  for ownerless events (research.md R3 there), reused here rather than
  reinvented. Every user after that gets their own empty starter inventory
  auto-created on their first sign-in, ready to import an LL.xlsx into —
  no dead-end empty state.
  **Both halves of that were reversed on 2026-07-30 while fixing D1** — a
  login now provisions nothing and adopts only a catalog the user's own
  events already read. The "dead-end empty state" argument had expired:
  Slice 32 gave the Inventories page a real onboarding empty state, so an
  auto-created *My Inventory* was a row nobody asked for, and first-login
  adoption would hand a new user someone else's catalog.
- [x] Duplication: `POST /inventories/{id}/duplicate` deep-copies categories,
  items, and their `fixture_modes` into a brand-new inventory owned by the
  caller; the original and any events already using it are untouched.
- [x] Access control: a second `RequireInventoryAccess`-style middleware
  (mirrors Slice 15's `RequireEventAccess` pattern directly) gates
  `/inventories/{inventoryID}/...` routes. **Read** access follows from
  having any role at all on an event bound to that inventory; **write**
  access (add/rename/re-import/adjust stock, and duplication) is
  restricted to the inventory's own owner only — a deliberate, explicit
  exception to Slice 15's "contributor = full access" rule, scoped to
  inventory alone, per field feedback: an edit to a shared inventory could
  otherwise ripple unexpectedly into other events using the same one.
- [x] Every existing global inventory route (`/inventory/categories`,
  `/inventory/items`, `/inventory/import-xlsx`,
  `/inventory/items/{itemID}/fixture-modes`) moves under
  `/inventories/{inventoryID}/...`.
- [x] New data-integrity validation this model introduces: every existing
  picker into `inventory_items` (mic/cable/stand picks, output devices,
  truss pieces, etc.) must confirm the picked item belongs to the same
  inventory the event is bound to — a gap that couldn't exist before this
  slice, since there was only ever one inventory to pick from.
- [x] Frontend: restructures around "my inventories" (a personal management
  page — list/create/duplicate/rename, reachable independent of any
  event) versus "the inventory used by this event" (reachable from the
  event, read-only unless the viewer is also that inventory's owner,
  feeding every existing picker unchanged in shape, just scoped). Event
  creation gains an inventory picker, defaulting silently to the user's
  inventory when they only have one.

## Slice 17 — Per-event settings from a personal template (spec: `event-settings`) ✅ done 2026-07-21

Same field-feedback session as Slice 16: the reference-data vocabularies
(connector types, cable types, signal types, mic stands, output types,
power connectors, truss types, channel colors — Slice 4's `reference_values`
table) are global today, the same problem as inventory. Settings should
live under the event, not be shared across every user. Depends on Slices
14 and 15; independent of Slice 16 (different tables), but sequenced after
it per the user's stated preference — stabilize the domain model before
deployment (Slice 18).

- [x] Each user gets their own personal, editable template of the 8
  vocabularies (a "my defaults" settings surface, auto-created on first
  sign-in the same way Slice 16's starter inventory is, seeded from
  whatever the current global `reference_values` set is at migration
  time — existing labels survive byte-for-byte for the first user, this
  project's usual migration-safety bar).
- [x] Event creation copies the creating user's *current* template into new
  event-scoped reference-value rows — a **one-time snapshot, not a shared
  link** (explicitly different from Slice 16's inventory-sharing model,
  per the user's own distinction): editing an event's vocab afterward
  never affects the user's template, nor any other event, even one
  created from the same template a moment later.
- [x] The existing global Settings page splits into two surfaces: a personal
  "My defaults" page (edits the user's template — used only as a seed for
  future events, has no live effect on any already-created event) and a
  per-event Settings tab (edits that event's own already-copied vocab,
  same add/rename/delete UI as today, just scoped) — an owner/contributor
  concern, per Slice 15's roles.
- [x] `fixture_modes` (per-catalog-item DMX modes) stays with inventory
  ownership (Slice 16), not this slice — it's tied to inventory items, not
  event-level vocab.
- [x] Every dropdown currently reading `useReferenceData()` from the global
  `GET /reference-data` moves to an event-scoped
  `GET /events/{eventID}/reference-data`.
- [x] Migration bootstrap for pre-existing events: since the global table is
  going away, every event that existed before this slice needs a one-time
  copy-in of the vocab as it existed at migration time — this doesn't
  depend on who logs in first (unlike Slices 15/16's claim pattern), so it
  needs its own one-time Go conversion sequenced in `db.go`, following the
  established pattern from Slices 11–13.

## Slice 18 — Production deployment (spec: `deployment`) ✅ done 2026-07-21

An actual production deployment path — currently undefined (two
independently-run dev processes, no Docker/CI-deploy, no production docs).
Depends on Slices 14 and 15 (needs working auth/authz before exposing the
app publicly); sequenced after Slices 16/17 so the domain model is
stable before anything goes live, per the user's stated preference
(2026-07-20).

- [x] Go backend serves the built frontend itself: `go:embed` the Vite
  `frontend/dist` output into the binary, with a catch-all route (excluding
  `/api/*` and `/health`) serving `index.html` so React Router's
  client-side routes work on a hard refresh/direct link. Single deployable
  binary, single origin in production.
- [x] Build step: `npm run build` (frontend) must happen before `go build`
  embeds its output — add a `Makefile` (or equivalent script) target so this
  isn't a manual two-step ritual.
- [x] Reverse proxy in front of the Go binary for TLS (Caddy or Nginx — Caddy
  recommended for its automatic HTTPS on a simple personal deployment).
  Document trusting `X-Forwarded-Proto` from the proxy so the session
  cookie's `Secure` flag is set correctly even though the Go process itself
  only sees plain HTTP from the proxy.
- [x] Update the Google Cloud OAuth client's authorized redirect URI to include
  the real production callback URL before this slice ships (otherwise login
  fails with `redirect_uri_mismatch`) — call this out explicitly in
  `quickstart.md`/deployment docs since it's an easy miss.
- [x] Ops docs: example `systemd` unit file for running the binary as a
  service, env var checklist for production (Google prod client
  id/secret/redirect URL, allow-list, session TTL, DB path, migrations
  path), and a simple SQLite backup strategy (periodic file copy of the
  live DB — no new tooling).
- [x] `PATCHPLANNER_CORS_ORIGIN`/the CORS middleware becomes effectively a
  no-op in production (same-origin) but stays for local dev.
- [x] No CI/CD pipeline is in scope here unless wanted later (manual build +
  copy + restart is fine for a single small VPS to start).

## Slice 19 — CI/CD deploy to VPS (spec: `cicd-vps-deploy`)

Automates what Slice 18 left as a manual runbook: a GitHub Actions
workflow builds, tests, and deploys the app to the production VPS on
every push to `main`, plus an on-demand manual trigger. Depends on Slice
18 (needs the `make build` target and the VPS's nginx/systemd setup to
already exist — this slice only automates getting new builds onto it).

- Single GitHub Actions job (checkout, backend `go vet`/`go test`,
  frontend typecheck/lint/test, `make build`, SSH deploy) — a failing
  check step blocks deploy with no extra wiring, matching GitHub Actions'
  default step-failure behavior.
- SSH-based push deploy using only the OpenSSH client already on the
  runner — no third-party GitHub Actions for SCP/SSH.
- A fixed, version-controlled VPS-side script (`deploy/remote-deploy.sh`)
  is the only thing the pipeline is allowed to invoke on the server: it
  atomically swaps in the new binary, restarts the `patchplanner` systemd
  service, health-checks it, and automatically restores the previous
  binary if the new one never comes up healthy.
- A dedicated, non-root `deploy` VPS user with a `sudo` rule scoped to
  exactly two `systemctl` commands — no broader privilege than deploying
  requires.
- `workflow_dispatch` trigger lets an operator redeploy the current
  `main` on demand, going through the identical checks as an automatic
  run.

## Slice 20 — Start page redesign (spec: `start-page-redesign`) ✅ done 2026-07-21

Reworked the signed-out landing page and the signed-in dashboard so the
first screen explains what the tool is and gets a returning user to their
current event in one click.

## Slice 21 — Mobile-friendly redesign (spec: `mobile-friendly-redesign`) ✅ done 2026-07-24

Made the whole app usable on a phone without disturbing the desktop
layouts. Every mobile view is an additive `useIsMobile()` branch inside an
existing component — desktop code paths are never modified in place, and
desktop rendering is pixel-unchanged.

- Bottom tab bar (`MobileNav`) replacing the fixed sidebar below 768px,
  with a "More" bottom sheet and safe-area padding.
- Shared mobile primitives in `frontend/src/components/mobile/`:
  `CondensedListRow`, `MobileEntityList`, `SectionSwitcher`, and the
  `Mobile*EditSheet` editors.
- Equipment and Rental Order are read-only on mobile for **every** role —
  a deliberate density decision, not a permission one.
- No new runtime dependency and zero backend changes.

## Slice 22 — Generic inventory formats & PDF order (spec: `generic-inventory-formats`)

Ends the tool's dependency on one supplier's price list. A technician who
rents anywhere can now build a catalog and get an order out of it. Depends
on Slice 16 (per-inventory ownership is what `source_format` hangs off).

- **Generic Excel import** alongside the LL import: one flat sheet
  (`Category | Type | Name | Description | Quantity | Price`), columns
  found by heading rather than position, extra columns ignored. A bad file
  is rejected whole, naming every offending sheet row.
- **One import button for both formats.** The server detects which it was
  handed — a price list by its `Prislista LL` sheet (exactly what the LL
  parser requires, so detection and capability cannot disagree), a generic
  list by asking the generic parser's own column locator — and reports the
  result back so the user can confirm it. Neither check duplicates a
  parsing rule, and neither importer was modified to accommodate it.
- **Downloadable template**, generated server-side with a frozen header
  row, a `Type` drop-list, and a worked-example sheet the importer never
  reads. A round-trip test binds the template to the parser so the two
  cannot drift apart.
- **Manual catalog management** on any inventory: create, edit and delete
  categories and items. Hand-entered items carry `is_manual` and are
  excluded from both halves of the import's upsert, so imports can neither
  discontinue nor overwrite them. Deleting an item referenced by a plan is
  refused with its reference count.
- **Format-aware export**: the LL.xlsx export is gated on
  `inventories.source_format = 'll'` — hidden in the UI and refused by the
  API otherwise. Every inventory additionally gets a category-grouped PDF
  order (server-rendered, `go-pdf/fpdf`) and a plain spreadsheet order.
- Constitution amended to v0.4.0: Principles I and IV no longer name
  LL.xlsx as *the* inventory source and export target, and IV gains the
  negative half — fidelity to a supplier's format is earned by having
  imported it, never assumed.

## Slice 23 — Audio patch shell: sheet, flow, drawers & the console (spec: `audio-patch-shell`)

Replaces the two audio tabs' stack of six cards with one shell: a Sheet you
land on, a Flow toggle, and Rig/Buses drawers. Adds the entity the audio
model never had — the console itself. Depends on Slice 11 (output graph)
and Slice 12 (input graph): the console is a node in both, and the sheet's
chain column is a render of their existing cable walks.

- **One toolbar, two views.** `AudioPatchShell` holds the Sheet/Flow toggle,
  the search box, the drawers, print and one add action, identical on both
  tabs. Every former card is now a drawer entry or a sheet row; the
  graph/table toggle and both flat resource tables are gone.
- **A channel's whole path on one line**, from `lib/patchSheet.ts`, which
  turns the existing `buildInputChannelFlow`/`buildOutputChannelFlow` walks
  into addressable segments — shared with the print sheets, so paper and
  screen cannot drift. A status rail states capacity, gaps and cables picked.
- **The console** (`event_consoles`, migration 042). Named, with a role, an
  optional catalog **or owned** item, per-event port counts, and a position
  on both canvases. Several per event. `console_local` is a new port kind
  shaped exactly like a stagebox on each graph, so a source can land in the
  desk directly. One more UNION arm in `rentalSummaryQuery` — **this closes
  the last hole in the standing invariant above**: the most expensive item in
  the truck could previously only reach the order as a hand-typed line.
- **Flow at festival scale.** The source rail keeps one 20px row per source
  (a card each would be ~1,700px at 32 sources), gains a derived colour tape,
  the picked model and a red 48 V bar, and stacks a stereo source's ports
  vertically. Colour now runs end to end along any run that reaches a
  channel, with cable-versus-network encoded as a dash pattern so the two
  readings stay independent.
- No new dependency, no change to the cabling rules, and no mobile code path
  touched.

## Slice 24 — Audio patch shell, second pass (spec: `patch-shell-fixes`)

Four defects found by field-testing Slice 23. Two were real bugs with narrow
causes; two were the UI not having been built to the approved mockup.

- **A channel kept losing its desk.** The sheet's row editor PATCHed eight
  fields and not `console_id`, and the update writes that column
  unconditionally, so a nil became NULL — on the *first save of any field*,
  not on create. Fixed at both layers: every caller carries the field, and
  update falls back to the event's only desk exactly as create already did,
  which also repairs rows that are already detached. With several desks it
  stays nil rather than guessing, because putting a monitor send on the FOH
  desk would put a wrong line on a printed sheet. The node holding deskless
  rows is now draggable too — it had no handler at all, so it sat immovably
  on top of the desk it covered.
- **A desk's own sockets led nowhere,** in both directions. The desk node drew
  them one-sided: only the out side on the output graph, so a bus had nothing
  to land on; only the in side on the input graph, so a cabled-in source could
  never reach a channel. They are now their own two-sided node in the
  processing lane, drawn by the same shape as a stagebox — which is what makes
  the two interchangeable to look at as well as in the data. Migration 043
  gives that node its own placement per graph. A second bug fell out of
  confirming the first: the output chain walker had no `console_local` branch,
  so a run through a local out read as ending at the desk.
- **The Rig and Buses drawers** are rebuilt on one design language
  (`ui/GearList.tsx`): a mono micro-label heading, one card per item reading as
  a summary line with a spec line and — for a desk — a usage meter, and fields
  only once Edit is pressed. Stacked full width: `StageboxMultiManager`, whose
  whole job was to put stageboxes and multis in two columns, is retired, and
  that two-column layout inside a `max-w-3xl` drawer is why the fields were too
  narrow to type into. The three near-identical device sections became thin
  wrappers over one shared list.
- **The sheet's row editor** is one flowing strip instead of a fixed column
  track. Notes spanned all but one column, so the actions landed in a 9 rem
  cell where the buttons shrank — which is what compressed "Save channel"
  against its padding and squashed the delete icon into a tall sliver. One
  cause, three of the reported symptoms. Adds the missing **Edit in Flow**,
  which selects the row's own upstream source.
- No new dependency, no new table, and no change to the cabling rules or the
  rental query. A run through a desk's sockets bills exactly the same number
  of cables as the equivalent run through a stagebox, and a test pins it.
- **Deliberately left for a slice of its own:** carrying this design language,
  and a chosen typeface, to the other eight tabs. Only the audio tabs and the
  shared controls they needed are touched here.


## Slice 25 — The mockup's visual language, for real (spec: `patch-visual-language`)

Second field test of the audio surface. Two things that did not work, three
that were the surface not having been built to the approved mockup.

- **Edit in Flow forgot the row it was pressed from.** `onEditInFlow={() =>
  setView('flow')}` ignored its argument, and the canvas owned its selection
  privately — so it was unmounted while the sheet showed and could not have
  received one anyway. The selection is now the tab's, which also makes it
  survive the view toggle in both directions and lets a selected source be
  scrolled into view on a long rail.
- **The outputs graph drew every port grey.** Slice 23 gave that graph
  `derivedCableColor` for its cables and nothing for its ports, so a coloured
  output was cabled in colour and ported in grey. The backward walk is now
  `derivedOutputPortColor`, with `derivedCableColor` defined in terms of it —
  they were always the same question, so a port and its cable cannot disagree.
- **One framed panel** (`ui/PatchPanel`) instead of three rounded cards with
  gaps. With three cards the view toggle appears to rebuild the page; with one
  it changes the content of something that stays put. The lane labels and the
  zoom control moved out of the strip that used to sit between the toolbar and
  the canvas — the thing that broke the reading — into the canvas and the bar.
- **The sheet at the mockup's density** (`ui/SheetTable`): mono micro-label
  headings on a darker ground, one-line rows, striping you have to look for,
  tabular figures, and the tape colour as a bar before the name. A chain now
  reads as a signal path, and a hop through the desk's own socket is **amber** —
  which is the billable-versus-not distinction made visible for the first time.
  `ui/Table` and `ui/Badge` are untouched: six other tabs render them.
- **The inspector as the mockup's rail**: a left border rather than a card,
  fields beside 44px labels rather than under them, Reaches and Legend as
  bordered notes, and the legend drawn as stroke samples using the same widths
  and dash arrays the canvas strokes.
- **Shared graph primitives** (`components/event/graph/`). Both canvases held
  their own `NodeShell`, `PortDot` and `PortRow`, which is why their boxes had
  drifted; each now keeps a thin adapter over one shared set. A pass-through is
  one row per jack with its two ports on opposite edges — index N in *is* index
  N out, and two columns only lined up by luck. Port lists draw **every** jack —
  the mockup's `⋯ N more` row was overruled in the field test, because a box that
  hides eight jacks is not a shorter box, it is an incomplete one.
- **The sources rail** rebuilt row by row: a full-height colour tape, the model
  in quiet mono, the 48 V bar showing off as well as on, stereo two slots tall
  with L above R, a count in the header and `+ Source` in the footer.
- No dependency, no migration, no change to routing, guards or the rental query.
- **Still a slice of its own:** a typeface for the application, and this language
  on the other six tabs.


## Slice 26 — An inspector for the outputs flow graph (spec: `output-flow-inspector`)

The outputs Flow view could be looked at but not worked in. Selecting a box marked
it and nothing else, because that canvas had no inspector — a documented Slice 25
boundary ("the mockup draws none"), which left every output field Sheet-only while a
source on the inputs side was editable from either view.

- **The rail, on the entity that maps onto the sheet's rows.** Clicking an output
  row's label opens an inspector holding all seven fields the sheet's inline editor
  holds, so a bus can be renamed, retyped, recoloured or moved to another desk
  without leaving the view where its routing is visible. Fields save one at a time
  with no draft: a rail holding a draft would be a second copy of a row the sheet
  may be editing at the same time.
- **One rail, not two look-alikes.** The frame, header, field row, note box and
  legend strokes were extracted from the inputs inspector into
  `graph/InspectorRail` **before** the second caller existed, so a regression there
  was attributable to the move alone. The legend splits: its strokes are shared
  (their only claim is "this is a line the canvas draws"), its wording is not —
  the input side's colour says which channel a run *reaches*, the output side's says
  which output it *carries*, and no output has phantom power.
- **`mixer` left the selection union.** It was doing two jobs: a mixer *port*'s id
  is an output's id, the mixer *node*'s selection id was a desk's id. The desk box
  is no longer selectable at all — its fields are in the Rig drawer and its rows
  have rails of their own — so the ambiguity is now unwritable rather than merely
  unwritten.
- **Two gestures, one row.** The label opens the rail, the port dot still starts a
  cable — the split the sources rail already field-tested. A stereo output's two
  rows answer to one selection, because a mixer port's id *is* the output's id.
- **"Lands on" reads the sheet's own chain model**, so the rail and the Chain column
  cannot disagree about where a run goes — the same reasoning that defined
  `derivedCableColor` in terms of `derivedOutputPortColor` rather than walking twice.
- **The sheet's row-level Edit in Flow now selects the output.** It used to settle
  for the first box downstream of the desk, so asking to edit a bus opened a
  stagebox.
- Frontend only, asserted by a gate rather than assumed: no migration, no route, no
  Go file touched.
- **Still a slice of its own:** the same rail for the inputs canvas's channel rows,
  and splitting the outputs canvas out of its tab file to mirror `InputGraphCanvas`.


## Slice 27 — Lighting becomes a sheet (spec: `lighting-sheet`)

Wave 3 of the design convergence, and the last surface in the application that was
a form pretending to be a list: thirteen columns, twenty-four permanently-live
inputs and selects, no read state at all, so a rig of forty fixtures showed seven
of them and none of the three numbers a planner reads lined up with the row above.

- **Nine columns, no control in a closed row**, and the editor beneath the row it
  belongs to. Row height ~90 px → 25 px, so a screen shows about twenty-eight
  fixtures instead of seven. Two columns merged (power now names the fixture it
  chains from), two deleted — the row ordinal, and DMX chain, which printed a raw
  row id that nothing had ever written.
- **The rig has a DMX map for the first time.** Nothing in the application had
  ever noticed two fixtures sharing addresses; auto-assign packed each universe
  from 1, so its own output was always clean and a clash could only arrive by
  hand-editing afterwards, silently, until a technician was standing in the room.
- **Sharing an address is not a clash.** Twenty identical pars on one address is
  how a room wash is rigged. Four conditions a universe can be in *all at once* —
  shared, clash, out of bounds, unaddressed — kept independent by partitioning
  identical spans into one group **before** any pair is compared, which is also
  what lets the packer preserve sharing without remembering to.
- **Two bulk operations, one packer.** Auto-assign repacks each universe from 1 in
  rig order; Optimise keeps the order already set and closes the gaps. Both move
  groups rather than fixtures, neither moves a fixture between universes (a
  universe is usually a cable run to one truss), and an over-full universe is left
  exactly as it was instead of failing the whole rig.
- **An occupied address asks rather than refusing**: *make room* ripples the
  fixtures above up by just enough — stopping at the first that already clears, so
  a gap left on purpose survives — *share address* appears only on an exact match,
  and *place anyway* is always there, because nothing here is ever blocked.
- **One editor replaces two dialogs**, with a quantity defaulting to 1. The two
  had already drifted: the single-add dialog had no universe and no power field
  where the bulk one had both, so every hand-added fixture started on universe 1
  with a Schuko. The tab now has zero dialogs.
- **The backend got smaller.** `AutoAssignDMX` was deleted rather than rewritten:
  the browser must derive the map anyway, so Go keeps the guarantee (one
  transactional endpoint applying a plan whole or not at all) and TypeScript keeps
  the arithmetic. One migration, and it only drops a dead column.
- 49 unit tests over `lib/dmxMap` and `lib/dmxPlan`, none of which renders
  anything. `components/ui/` and `components/event/graph/` are untouched, asserted
  by a diff rather than assumed.
- **Still a slice of its own:** making the two operations undoable, running one on
  a single universe, and DMX chaining as a modelled relationship.

## Slice 28 — Four tabs, one shape (spec: `event-tabs`)

Wave 4 of the design convergence: Rental Order, Equipment and Signal Flow become
the work panel Wave 3 proved on Lighting, and Overview stops being a form.

- **The rental order is a sheet.** Nine columns, no control in a closed row, and
  the editor states what it *cannot* change — "from the plan · 8 audio · 0
  lighting" is read-only, because that number comes from the patch and the rig.
  That sentence is what the tab is for and it was nowhere on screen. The totals
  row leaves the table body for the strip; over stock stops tinting nine cells
  and turns the one cell that is wrong.
- **Owned gear and rented extras become one list** with a `Source` column. They
  were two cards because they come from two endpoints, which is a reason the
  planner does not have. A rented extra *is* a manual rental line — the same
  record from two tabs — and each now says so.
- **The signal chain is fixed-pitch.** It was proportional sans, so hop *n* of two
  adjacent rows started at two different x positions and the eye could not run
  down the column, which is the tab's entire job at load-in. No Inputs|Outputs
  toggle: the tab prints, and a toggle would print half the document.
- **Overview states the event.** Editing moved into a drawer, which settles the
  app's one explicit Save rather than deciding it. The tab is now five figures at
  26 px, the rig drawn as the flow canvas one row high, and every work panel's own
  verdict collected in one line — eight tabs each held one shard of "how is this
  show doing" and no screen held the answer.
- **The summary is a derivation, not an endpoint.** The mockup proposed one; the
  spec withdrew it. *2 gaps* is a walk over the cable graph and *addressed* is a
  partition of identical spans, so a Go copy would let Overview disagree with the
  strip on the tab it links to. `lib/eventSummary.ts` calls the owning functions,
  and asserts the agreement in 23 tests.
- **A tab can finally open another tab.** `RowEditor`'s hand-off slot and
  `LightingSheet`'s `onOpenPlot` shipped in Wave 3 and had never rendered, because
  `EventDetail`'s desktop `Tabs` was uncontrolled. The selection moved into
  `?tab=`, so a hand-off is a link — it survives a reload and the back button.
- Frontend-only: no endpoint, no migration, no backend file changed. `components/ui/`
  changed in one file, `Tabs.tsx`, additively; the canvases, the audio sheets,
  Stage Plots, the phone branches and the print sheets are untouched, asserted by
  diffs.
- **Still a slice of its own:** a hand-off carries the tab and not the row, no
  sheet is sortable, and the rental order cannot be filtered by department.

## Slice 29 — The pages, and what is left over (spec: `pages-and-residue`)

Wave 5, and the end of the design convergence: the audit's last four findings
close, and every surface in the application is now built from the same
vocabulary.

- **The inventory catalog was the audit's miss.** Filed under "pages, mostly
  already right", it is the largest table in the application by row count — 308
  items in the sample price list, and the list the entire rental order derives
  from — rendered on the navigation tier at about nine rows to a screen. It is a
  panel with a category rail now, and the rail does exactly one thing: the twelve
  categories used to show about four, because each tile carried a rename, a
  delete, a picker-role select and a count in its corner.
- **Two drawers take what the layout was carrying.** Category management, because
  a category is declared once and referenced by every item; and import, which is
  the one operation on the page with something to explain — the server detects
  the file's format, and that explanation was a `title` tooltip whose result
  landed as a paragraph that shifted the page down.
- **The DMX modes dialog is gone**, into the item editor's `notice` slot. A mode
  belongs to an item; opening a dialog *from a row* to edit part of that row is
  the pattern the convergence has been removing since Slice 27. The sheet gained
  a `Modes` column, so which items carry modes is visible without opening
  anything — which used to cost one click each.
- **Nine vocabulary cards become one panel**, the rail's second caller. The
  stored value stops being a truncated caption and becomes a column, and the
  values gained the one thing this surface never said: **how many plan rows use
  each of them.** The server has refused to delete a referenced value since Slice
  17 and the interface found out by trying; the count comes from the same
  function that guards the delete, so it cannot be a lie.
- **The dashboard is rebuilt, not trimmed.** Five cards saying twelve, four, two
  and here are some links become one show and a spine of dates: the next event at
  full size with its rig as a one-row ribbon, its countdown and every tab's
  readiness verdict, then dated rows, then the account totals as the footnote
  they always were. Three `Badge`s that repeated their own labels go with them.
- **The one sanctioned animation moves inside.** `tokens.md` permits exactly one
  pulse and names it; it had lived only on the signed-out start page. It now
  walks the hero's ribbon, staggered, in the same reduced-motion wrapper — and
  stays off every working surface, which is why Overview draws the same ribbon
  still and does not animate it.
- **The start page is exempt**, in writing. It shares the brand mark, the accent
  and the type families and nothing else; converging it would have made the
  audit's greps come out clean at the cost of the only page whose job is to be
  memorable.
- One field on the backend and no migration. `components/ui/` gained two files
  and shrank one. **A4, A6, A7 and A9 are closed**; the audit has no open
  findings left.

## Slice 30 — The Events timeline, and events that have length (spec: `events-timeline`)

Two things, because the second was found inside the first.

**The Events page was the last surface that never converged.** `audit.md` A6
exempted it under P1 as a list of genuinely independent objects — correctly, and
that settled the frame while never asking what the page was *for*. It is now one
panel containing a chronological spine: a date gutter carrying every time label,
a hairline with a mark per event, today cutting across it in amber, month and
year headings, and a closing strip. A row opens in place into the show's rig,
its counts and every tab's readiness verdict. Above the list, a year track draws
every event of a year at calendar scale — nothing aggregated, so nothing capped.

**An event stopped being one day long.** Three nullable columns join the one it
had — `load_in_date`, `end_date`, `load_out_date` — each deriving from its
neighbour when absent, so every existing row means exactly what it always meant.
`date` was renamed `start_date` in its own commit, since with three siblings it
was otherwise the one column a reader has to be told about.

- **This repaired a live defect.** An event was past the moment its single date
  was behind today, so a multi-day show vanished from the dashboard on its
  second morning — while the user was standing in the venue working it. Past is
  now decided by load-out, and a `running` bucket takes precedence over the next
  show on the dashboard hero.
- **`days to load-in` became true.** It has been labelled that since Wave 4
  while counting to the event's only date. The value moved to meet the word.
- **Recording load-in is what makes clash detection correct**, not merely
  possible. Two events can share on-site days without sharing a show day — a
  one-evening job the day you rig a festival — which is the collision you
  otherwise find out about by turning up. `overlaps` and `on-site clash` are two
  words because they are two facts, both derived from one sweep that also packs
  the year track's lanes, so the brace on the spine and the stacking on the
  track cannot disagree.
- **A clash is a fact about a plan, not an error in it**: amber and a word,
  never red, and never blocking a save.
- **Writing one date formatter turned up another bug.** `shortDate` has claimed
  since Slice 29 to be a fixed width, and `en-GB` under a current ICU renders
  September as `Sept`. Month and weekday names are tabulated now, which also
  makes the output stable across ICU builds.
- No new endpoint, no new `components/ui/` component, and one migration pair.
  `design/` gains patterns §4c, the collision colour rule and the unfold as the
  second sanctioned motion.

**Out of scope, and named as a decision:** rental pricing by duration. The order
quotes a five-day hire as a one-day hire, which it did before too — what changed
is that the tool now *knows* the duration, which is why it is the next slice.

## Slice 31 — Rental pricing by duration (spec: `rental-pricing-duration`) ✅ done 2026-07-30

**A day rate is not a price.** Between the two sit a table the supplier
publishes, a discount somebody negotiated and a VAT rate, and the schema held
none of them — so a festival that loaded in on Wednesday and out on Sunday was
quoted at the price of a Tuesday afternoon, on screen, on the Overview figure and
in all three exports.

**The file already knew.** `LL.xlsx` ships three sheets and PatchPlanner read
one. `Hyresfaktor` is sixteen rows of `days → multiplier`, starting at row 19
under eighteen blank ones. `Sammanställning` holds the supplier's own arithmetic,
already written — `(subtotal − subtotal × Rabatt) × Hyresfaktor` — with exactly
two cells a human types. This slice reads both and writes the second.

- **Four numbers, three stores.** Charged-days rule and VAT cascade from the
  user's defaults → the catalog → the event, where `NULL` means *follow the
  catalog*. The rate card belongs to the catalog because it is a fact about the
  supplier; the discount belongs to the event because it is a fact about the job.
- **A catalog copies the defaults when it is *created*, not when it is imported
  into.** The columns are `NOT NULL`, so an import has no unset state to detect,
  and one that re-applied them would silently undo the edit the catalog's own
  drawer exists to allow. An import applies only what the **file** states.
- **The rate card is read by stepping down**, clamped at both ends: 17 days gets
  the 14-day factor, 45 gets the 30-day one. Settled with the user against
  interpolating — a supplier cannot be asked to honour a rate they never
  published. An empty card means ×1.00 and says so in amber words on the strip;
  the strip's *tint* stays the stock verdict it has always been.
- **An import carrying a rate card replaces the whole table.** There is no
  `is_manual` here, unlike catalog items: a hand-typed 5-day factor and an
  imported one are one fact disagreeing, not two things that can coexist. An
  import carrying none leaves the table alone, which is what makes the blank
  generated template harmless.
- **VAT is read out of a formula.** `LL.xlsx` never states 25% as a value; it
  states `*1.25` inside seven formulas. The rate is taken from the one on
  `Summa utrustning ink`, and every failure path — missing sheet, renamed row,
  absent formula, unparseable multiplier — means *this file states no rate*.
  Nothing fails and nothing is guessed from a partial read.
- **`db.GetRentalSummary` fills the pricing block, and that is the slice's one
  structural decision.** Its four callers are the whole set of places an order is
  rendered, so no export can be written that omits the price.
- **`total_ex_vat` was renamed `subtotal_ex_vat`**, keeping its meaning. The
  rename was the point: a field added beside it would have left all nine sites
  that show money compiling and eight of them wrong — including the Overview
  number band, which had shown a day rate labelled *RENTAL, EX VAT* since Wave 4.
- **The factor multiplies the order, not the line.** Every line keeps its day
  rate on every surface and in all three exports, so each stays checkable against
  the supplier's published list.
- **The LL export writes four cells and no total**, located by row label in
  column A, and leaves the `*1.25` formulas alone — filling in the two cells that
  file was built to have filled is a different act from editing its model. Where
  the labels have been renamed the quantities still arrive and the report says
  so; where an event's VAT disagrees with what the file computes, both numbers
  are named. Principle IV's duty is to report, not to refuse.
- One migration pair (050), five routes and two drawers. `ui/Drawer` had already
  solved the phone — it branches to `ui/Sheet` itself — so the separate mobile
  sheet the tasks planned was not built.
- **`design/` was untouched until the built page was used on a phone.** Two
  things came back from that (audit.md M14, both now rules on `ui/Drawer`): a
  drawer's closing paragraph belongs in `ui/InfoNote`, not in `footer` — on a
  bottom sheet a two-sentence footer is a fifth of the screen with no way to put
  it away — and an editable number sits at the **right edge** with its hint to
  the left, which is where the thumb is and which aligns it with the ledger
  below. Four drawers had the footer fault, two of them older than this slice.
  The `InfoNote` rule had existed since Wave 6a but was written only at the
  `InfoNote` entry, not at the `Drawer` entry where somebody choosing between two
  props is actually looking.

**Verified against the real data**: a 32-line wedding order at 5 994.00/day,
priced over five on-site days at ×2.20 less 25%, comes to 9 890.10 ex VAT and
12 362.62 inc, identically on the API, in the PDF and in the spreadsheet.

**Out of scope, and named as decisions:** pricing owned gear (gear you own is
not hired), interpolating between rate-card rows, per-line period pricing,
labour and transport (`Sammanställning` has columns for both and PatchPlanner
models neither), and price history.

## Slice 32 — The inventory list, and the catalogs nobody could see (spec: `inventories-list`)

The last card list. `/inventories`' list view becomes one panel with
navigation-tier rows, a search field and a closing strip; the two tabs become
**Rental catalogs** and **Owned gear**.

The column that carries the slice is **Used on** — the count of events bound to
each catalog. `DeleteInventory` has computed it since Slice 16 and spent it
entirely on a 409 after the user confirmed a browser dialog. `GET /inventories`
now returns it alongside item and category counts as sub-selects, which also
deletes one request per row (the page used to fetch all 308 items of every
imported catalog to call `.length`). One new read-only route,
`GET /inventories/{id}/events`, gives the manage drawer the events themselves.

Rename, duplicate, delete and create move into one `ui/Drawer` built from
`ui/GearList`, from the row's ⋯ and from the catalog panel's own bar. Delete is
**absent** while events depend on the catalog — the drawer lists every one of
them as a link instead — and asks in place when they do not. The application's
only `window.prompt` goes with it.

No migration. Two rules came out of it into `design/patterns.md` §3: a drawer's
frame is navigation tier while its contents are the work surface's, and no
section inside a drawer takes a height of its own.

## Slice 33 — The sheet, and the edge the thumb is on (spec: `phone-sheet`)

Wave 6a of the design convergence, and the first of the phone's four phases. It
builds no surface: two primitives, one hardening, six conversions.

`ui/Sheet` is the phone's sibling of `ui/Drawer` — bottom-anchored,
`max-h-[85svh]`, the body the only thing that scrolls, the safe-area inset added
under whatever the last row is. Six props, and it decides nothing about its
contents, which is the reason it is a component rather than a `className` on
`Dialog`. **`ui/Drawer` anchors itself**, so Rig, Buses, Universes, Categories,
Import and the catalog's manage drawer all acquired a phone form from four lines
in one component, without one of their own files being touched.

- **`ui/Dialog` stays centred, and the rule is now written down**: an overlay
  with fields is a `Sheet`; an overlay that is a sentence and two buttons is a
  `Dialog`. M8 was never *"`Dialog` is the wrong shape"* — it was *"`Dialog` is
  being used as the phone's edit form"*. It gained `Escape` and internal scroll
  by addition; the one desktop delta in the slice, stated in advance, is that a
  dialog taller than the viewport now scrolls instead of overflowing.
- **The footer was drawn wrong and the prose was right.** `design-language.html`
  had Save, Cancel and Delete in one row — at 375 px a ~185 px confirm with a
  destructive control 10 px from it, in the corner a thumb rests on. The footer
  now holds the confirm, full width, alone; delete sits at the foot of the
  scrolling body; Cancel is gone, because the close target, the scrim and the
  back gesture were already three ways out. The specimen was redrawn to match.
- **Eighteen `FieldLabel`s became `FieldStack`** (M12) — the label the Rig
  drawer renders above the same fields on a desk. The geometry needed no work at
  all: the phone's controls already defaulted to `h-10`. Only the voice changed,
  and the forms gained real label association on the way, because `FieldLabel`
  had been a *sibling* of its control and labelled nothing.
- **The section switcher stopped grading what it cannot know** (M7). Nine
  sections were labelled *editable / read-only / viewer* from a fixed table that
  cannot see a user's role — it told a viewer that Audio Inputs was "Editable" —
  in a hue reserved for the legend's stroke, through a sixth micro-label
  definition no grep would have found. All deleted; `sky` now appears nowhere in
  `components/`.
- **The safe area had never existed.** `index.html` had no `viewport-fit=cover`,
  so every `env(safe-area-inset-*)` evaluated to `0` on iOS and both call sites
  added in Slice 21 were inert from the day they landed — invisible in a desktop
  browser at 375 px. Fixing it is what turned M10 from dormant into urgent, so
  the nav states `h-14` and the body derives its padding from that.
- Frontend only, asserted rather than assumed: no endpoint, no migration, no
  backend file. `Drawer`'s desktop return is byte-identical and every class
  string on both components' desktop paths was compared through `twMerge`.
- **Still a phase of its own:** the panel frame and the status strip (6b), the
  nine surfaces (6c), and the canvases (6d) — where the sheet's un-scrimmed,
  non-modal form was built for and left unwired.

## Slice 34 — The panel, and the row that stops being a card (spec: `phone-panel`)

**Design wave 6b.** `ui/MobilePanel` — the phone's frame: a bar that wraps, a rows
region that scrolls, and the status strip that closes it. Closes audit findings
**M1, M2 and M3**, and leaves five of the phone's twelve open, all of them surfaces
that have not been built yet rather than surfaces speaking a language of their own.

- **All nine phone lists are one bordered frame**, not nine `space-y-*` stacks of
  free-standing cards. Four of the nine live on pages — Dashboard, Events and
  Inventories — which belonged to no wave phase, because 6c is *the nine event
  sections*. They held four of the seven call sites of the shared row, so leaving
  them would have shipped a phone with two kinds of row in it.
- **The row is not taller.** It loses its own border, radius and ground and gains the
  navigation tier's 14/12 type; the pitch falls from 48 px to 45.5, because a card's
  border and the gap to the next one are what paid for it.
- **F3, and it is the finding of the slice.** `tokens.md` §7 stated `px-3 py-2.5`
  *and* "44 px tall" for the same row. At the framework's default line boxes that is
  56 px, and building it as written would have taken two rows of data off a 667 px
  handset. Two implementations — the drawn specimen and the shipped code — had
  independently reached 44 px and independently disagreed with the table for five
  waves. The row's line now states a **height** and the padding derives, and `M2`
  **withdraws `py-1.5`**: it was never the defect, it is what makes 44 px with two
  tight lines.
- **On a phone the strip is the control.** The rails' desktop filter buttons are a
  size below `xs` for a good reason and a 24 px target for a bad one, so the strip's
  root becomes the button — full width, 44 px, filtering to exactly what it just
  reported. All four rails branch inside themselves, the `ui/Drawer` precedent, so
  five surfaces gained a strip without one of them being edited for it.
- **The phone shell was going to be a fixed-height column and is not** — built and
  reverted inside the slice, and this entry claimed otherwise until Slice 35 corrected it.
  A column makes every child a flex item, and the three phone surfaces that were not
  panels yet collapsed below their content. Handed to 6c by name, and done there.
- Frontend only, asserted rather than assumed. The four rails' desktop return was
  verified byte-identical by rendering all eleven states before and after and diffing
  the markup — stronger than 6a's `twMerge` comparison, because it catches element
  order too.
- **Still a phase of its own:** the nine surfaces (6c — M4, M5, M9, M11) and the
  canvases (6d — M6).

## Slice 35 — The nine surfaces (spec: `phone-surfaces`)

**Design wave 6c**, and the last conversion phase. The nine event sections go in 6b's
frame; after it the phone is not a subset of the application, and Wave 6 has one phase and
one finding left, which is the Flow canvas.

- **`M4` — a viewport is not a permission.** Three tabs `&&`-ed the viewport into the role,
  so every downstream check read *you may not* when the truth was *nobody built it*. The
  expressions are role-only now and the phone forms that makes necessary exist. **Slice 21
  FR-012 is superseded**, on the record. The sharper half was one line: `MobileEntityList`'s
  `onClick={readOnly ? undefined : …}` is correct on six desktop sheets and wrong here,
  because a phone row is a **truncation** — a viewer could not read the patch at all.
- **`M5` — the cheapest finding in the wave.** All three drawers have had a phone form
  since 6a; `ui/Drawer` branches internally and the tabs simply returned before reaching
  them. **No drawer file was edited.** Third time this wave a branch inside a shared
  component gave several surfaces a phone form for free.
- **`M9` — Overview is the design work.** Its composition is five 26 px figures side by
  side and a rig drawn as a canvas one row high; every part of it is a *read across*, which
  a phone has not got. So the bands were decided separately: a figure stays a figure, a
  ribbon stays a drawing and **pans**, and a verdict becomes a **row** — five 44 px rows
  that state where the plan stands and open the section that fixes it. Settings was one
  branch inside `VocabularyPanel` for two surfaces.
- **`M11`** — the print sheet is a sibling of the `print:hidden` wrapper rather than its
  only content.
- **Three findings the slice added.** There is a **fifth status rail**: `SignalFlowStatusRail`
  hand-built the shell's markup and was missed because its surface was not among 6b's nine
  lists — so `M1` was still standing on exactly the surface nobody counted, and joining the
  shell closed a latent filter bug with it. The bar's **overflow** was specified in 6b and
  never built. And a constant was still named after the badge 6a deleted.
- **The shell is the column 6b reverted**, with both halves of the flex rule stated this
  time: a visible-overflow item refuses to shrink, a hidden-overflow item may collapse
  silently, and 6b had the shrinking without the scrolling.
- **And one thing from the review rather than the findings:** the event's **name** is in the
  shell's header now — the one thing visible in all nine sections that never scrolls. The
  block it replaces hands ~48 px back to every section.
- Frontend only, asserted. The two shared components' desktop markup was diffed state by
  state: `StagePlotInspector` byte-identical, and the rail's two deltas read and written
  down rather than waved through.
- **Left for 6d:** the Flow canvas (`M6`).

## Slice 36 — The canvases (spec: `phone-canvas`)

**Design wave 6d**, the last phase of Wave 6 and the only one that is a **new capability**
rather than a conversion. Both audio Flow canvases mount on a phone, closing `M6` — and
with it every finding in `design/audit.md`, desktop and phone.

- **`M6` — the canvas is a viewport, and the finding was one line.** Both canvases compute
  their logical space as `panelWidth / zoom`, so zooming *out* on a desk **grows the
  coordinate space** — right for a canvas being composed, and backwards in a hand: at the
  scale where the whole graph fits, the space would become ~1950 px and the desk lane
  would slide out past `x = 1730`. **Zooming out to see the whole graph would push the
  graph away as fast as you zoomed.** `patterns.md` §7f had described the phone's
  behaviour correctly for four waves without anyone noticing the code said the opposite.
- **The question the audit deferred here by name is arithmetic, not preference.** *Pan-and-
  zoom or fit-to-width?* — both wrong. 100 % opens onto the Stage lane with no sign a desk
  exists; fitting the *width* needs a scale below the shared control's floor. The axis the
  question never mentioned settles it: the graph is 640 tall and the canvas region ~300, so
  at ~42 % it fits **both axes, whole, once**. Fit is the opening state, pan-and-zoom the
  working state, and the readout resets to fit rather than to 100 %.
- **The design work came out of that rather than into it.** On a 341 px window over an
  820 px graph the hard thing is finding a box, not reading one. Both canvases already
  dimmed non-matching nodes; one `scrollIntoView`-shaped call turns a highlight into a
  direction. **Unconditional**, not guarded on reach — a 60-channel graph scrolls on a desk
  too — and **one** predicate both dims and aims, because a second is how the dimmed set
  and the window's target come to disagree.
- **The withholding is what makes the pan good.** The canvas is handed no gesture handler
  at all, so one finger is left to the platform's own scrolling, with momentum and both
  axes; only pinch is written by hand. §7g reads as a restriction and is also an enabling
  condition.
- **Two duplications 6c created are deleted.** `ZoomControl`'s targets are 28 px, which
  `tokens.md` §7 amendment 1 forbids in the hand, so 6c hand-built a second cluster inside
  `StagePlotTab` — and a segmented view control with it. Both are shared components now.
  Fifth and sixth time in this wave that a branch inside a shared component gave several
  surfaces a phone form at once, and the rule has stopped being a surprise: **the phase
  that needs a thing twice is the phase that should own it.**
- **The inspector is the rail's own contents in the un-scrimmed sheet 6a built for it and
  left unwired for four phases.** `InspectorFrame` *renders* `InspectorRail` and
  `InspectorHeader` rather than reimplementing them, so the desktop return is identical
  **by construction**; it is a new component rather than a branch inside the rail because
  the rail has a third caller that supplies no header at all.
- **And one of the audit's own greps stopped working.** `grep "!isMobile"` was the check
  for *a reach check is never a permission*; this slice makes it return four hits, none of
  them a permission. The rule is intact and the proxy is not — recorded in `audit.md`
  rather than quietly replaced, and the check that means what the rule means is whether a
  reach term ever shares an expression with `readOnly`.
- Frontend only, asserted. Three desktop surfaces were captured before the change and
  diffed after: `ZoomControl` and both flow inspectors, byte-identical in every state.
- **Wave 6 is complete**, and `design/audit.md` Part 1 is empty for the first time.

## Slice 37 — The flow canvas as a plane (spec: `flow-canvas-plane`)

**Reported from use**, not from a field-test script: *"on desktop I place the nodes
where I want them but on mobile the rig (middle) section is tighter and the nodes bunch
together and overlap."*

- The middle lane was **92 px wide on every phone**, for nodes that are 200 px wide,
  because it was defined as what is left between two rails pinned to the coordinate
  space's edges and that space was measured from the browser window. A desk's lane is
  ~1144 px. See `design/audit.md` **M13**.
- **A pin is not a clamp.** A pinned node's x was overwritten and then saved back by the
  next drag, so four position columns in event 1 held four different window widths
  (1310, 1520, 1562, 2202) recorded as coordinates. This had been true since Slice 23,
  and a narrow window rewrote real placements permanently.
- Adopts the stage plot's model at both reaches: absolute coordinates, one plane as large
  as the graph on it, pan and zoom as the only view state. Deleted: every `canvasWidth`
  term, `clampProcessingX`, the `'y-only'` drag mode, the `y ≥ 8` floor, `LaneBands`, and
  the Sources rail's internal scroll with its cable re-attachment path.
- **Negative coordinates in both axes.** A floor at zero is an arbitrary limit; the plane's
  origin is derived from its content instead. The cost is `originShift` — the origin moves
  when a node is dragged past an edge, and the scroll offset must be compensated in the
  same frame or the graph lurches under the finger holding it.
- *Fit* is measured from the content's bounding box and is a **control** at both reaches.
  A surface opens **where it was last left**, per event and per surface, device-local in
  `localStorage` — following `usePatchView`, not `stage_plots`. Six columns on `events`
  were proposed and rejected: zoom and pan are one person's view of one screen.
- Migration 047 normalises the columns that were never placements, and only those.
  Rehearsed against a copy of the database. Its `down` is a documented no-op.
- One desk cost, and it pays for itself: the Channels/Destinations rail no longer hugs the
  window's right edge. Opening at *fit* — now true on the desktop too — is what puts it
  back on screen.

## Slice 38 — Who can see this event (spec: `event-access`) ✅ done 2026-07-31

**Reported from use:** *"I can't find a way to invite a user to my events on
mobile."* It is not there. Sharing has been an owner-only desktop affordance since
Slice 15 and never got a phone form, and the surface it opens is the last one in
the application still shaped by the pre-redesign vocabulary.

Two halves, and they are one slice because the second decides the first:

**1 · The phone cannot reach it at all.** `EventMembersDialog` is complete — invite
picker, role change, remove — and its only trigger is the desktop header's *Invite*
button (`pages/EventDetail.tsx:130-135`). The mobile branch returns at
`EventDetail.tsx:85`, above both that button and the dialog's own mount at line 140,
so on `(max-width: 767px)` neither element exists. There is no second door: none of
the nine `MOBILE_SECTIONS` is an access surface, `SettingsTab` has no member UI, and
`OverviewTab` fetches `listMembers` (line 60) only to fill a band. An owner on a
phone can see who has access and change none of it. The backend has been complete
throughout — this is entirely a missing frontend.

**2 · The desktop surface is a `Dialog`, and the rule says it should not be.**
`components.md` §`ui/Dialog` settles this: *an overlay with fields is a `Sheet`; an
overlay that is a sentence and two buttons is a `Dialog`.* Manage access is an
overlay of fields — two `Select`s and a button to invite, a `Select` and a delete
per member. It is the same fault D4 found in the catalog browse, which had been a
`Dialog` for four slices, and it has the same consequence: **a `Dialog` stays centred
at every width, so it has no phone form, while `ui/Drawer` is `Sheet` below 768 px.**
Getting the desktop shape right is what gives the phone its surface — one component,
not two.

Which shape is the decision the mockup makes first. It is not the read-only
consult-while-working case `Drawer` was ruled for in D4, and it is not `Sheet`'s
phone-edit-form case either; it is an owner managing a small list. Whatever it lands
on, `Drawer`'s `narrow` (`max-w-md`) is the width in the neighbourhood, not
`Dialog`'s `max-w-2xl`.

**Slice 39 states the test this turns on** — *a `Dialog` interrupts with one choice
before you can continue; a `Drawer` is a companion workspace beside what you are doing*
(2026-07-31; see that section). Manage access is the second: nothing is waiting on it,
you open it to work in it. The two slices share one rule and it is written once —
whichever runs first writes it into `components.md`, and the other applies it.

What the redesign has to cover once the shape is chosen:

- **The invite row does not fit a phone.** Three across in one flex —
  person `Select`, role `Select`, *Invite* button (`EventMembersDialog.tsx:119-141`).
  At 375 px that is a stack, and the role belongs with the person it applies to.
- **Two controls below the 44 px minimum**, on the row a thumb has to hit: the
  per-member role `Select` is `h-8` (line 97) and the remove control is a `ghost`
  button around an `h-3.5` icon (lines 99-101). `tokens.md` §7 amendment 1.
- **Removing a member is a destructive act behind a bare icon** — no confirm at all
  (`removeM.mutate` fires on click). `ui/ConfirmDialog` exists for exactly this.
- **The empty state is an explanation, not a label** — *"Everyone who has signed in
  is already on this event. New people must sign in at least once before they can be
  invited"* (lines 114-117). Two sentences read once: `ui/InfoNote`, per the
  footer/`info` rule D5 restated. Read that rule before placing it.
- `readOnly` and its defense-in-depth comment (lines 17-20) survive the move intact;
  a viewer still sees the list and no controls, and `canManageMembers` still gates
  the trigger client-side rather than leaning on the 403.

Design approval is required — it is a new phone surface *and* it touches the
`Dialog`/`Drawer`/`Sheet` rule in `components.md` §5, which is the second trigger
and not a judgment call. Depends on Slice 15 (the membership model and endpoints,
unchanged) and Slice 33 (`ui/Sheet`, and `Drawer`'s phone branch).

### Delivered

Design approved 2026-07-31 from `specs/038-event-access/mockup.html` rev 4, with
the mockup's three open questions ruled as drawn. No backend change: the
endpoints, their role gating and the owner-row protection were already complete
and tested from Slice 15, and that was verified rather than assumed.

**The rule, written once, here.** `components.md` §`ui/Dialog` no longer asks
what an overlay *contains*. It asks what it is **for**: a `Dialog` interrupts —
one choice before what you were doing can continue — and a `Drawer` accompanies,
a companion workspace you go on working in, which does not have to be editable
because consulting is accompanying. The old test misfiled both directions at
once: the cable pickers have fields while being interruptions, the read-only
companions have none while being workspaces. It also pointed the fielded case at
`Sheet`, which is the phone's anchor and has no desktop form — which is why the
desktop shape of a working overlay was never actually named, and why
`EventMembersDialog` and `PlotTrussManager` both sat in that gap for slices.

§`ui/Drawer` therefore **lost** a paragraph: D4's *a read-only work surface
opened from another surface is a `Drawer`* is a sub-case of the new clause, not a
third answer beside the old two. Slice 39 applies this rule rather than restating
it.

This slice is where both halves were demonstrated on one surface, which is why it
is the one that wrote them down: the access list accompanies, and the removal
confirm it raises interrupts.

**What shipped beyond the shape.** The door is an access row in Overview at both
widths — a `CondensedListRow` on the phone, the catalog row's own arrangement on
a desk — replacing the header's *Invite* button, which named the smaller half of
the surface and hid the list from viewers entirely. Overview's meta line gave up
its two access phrases to it. The member card stacks in the hand at 117 px with a
40 px role control and a 44 × 44 remove; removing raises `ui/ConfirmDialog`,
which is `ConfirmDialog`'s third caller and D6's *convert it when the surface is
next opened* working as intended. Role chips are neutral at every role — a viewer
drew the amber *warning* badge, and amber means *needs attention*.

**Decisions worth keeping:**

- **`readOnly` changed meaning.** It was defense in depth behind a hidden
  trigger; it is now the only client-side gate there is, because the door is open
  to every role. Who can see an event is worth knowing whether or not you can
  change it. Four of the eleven new tests are that single risk.
- **The owner's row and your own row carry a chip and no controls.** The server
  refuses every write against an owner, so a disabled control there would be a
  promise it never intends to keep. Your own row is the inferred half — the
  mockup marked it as yours without saying whether it could be acted on, and a
  contributor who removed their own row would drop out of the surface they were
  standing in. Leaving an event is still not a thing you do from here.
- **The two sentences split**, and the footer/`info` test is what split them.
  What contributor and viewer mean is durable and goes behind the `i`; *everyone
  who has signed in is already on this event* is a **state** that stops being
  true the moment anyone new signs in, so it stands where the picker stood. Same
  test as Rig's *"· 12 items"*, which stays a footer because it changes while you
  work.

**And one value was asserted before it was multiplied out.** The card was built to
the mockup's stated 114 px and 68 px, and the first cut shipped neither: `GearCard`
had a fixed `px-2.5 py-2` and accepted no override, so the phone quietly got the
desk's padding. It gained a `className` for the phone tier. The heights are **117
px and 71 px** border-box — the mockup's two figures are each 3 px light, modelling
the 10 px mono email line at 14 px where the framework's inherited `line-height:
1.5` gives 15, and omitting the card's two 1 px borders. The design did not change;
the arithmetic printed beside it did. *This is the third time a stated design value
has been built to without being multiplied out first, and the second time the number
reached this file before the code produced it.*

**Two process failures in the mockup, both caught before they landed.** Revision
1 cast the owner as the real account this application is developed against,
putting a real name and email into a file bound for git history — caught while
the directory was still untracked; every person in the file is invented now, and
the file says so. Revision 3 stamped an approval into five places before one had
been given: the subagent had been fed messages impersonating the user. It was
stripped out before the page was ever shown, and the approval recorded now is the
real one. **The rule both point at: a mockup is a document that gets kept, so
what it records has to have happened.**

## Slice 39 — The Trusses overlay (spec: `plot-trusses-drawer`) ✅ done 2026-08-05

> **Slice 38 landed first and wrote the rule** (2026-07-31). `components.md`
> §`ui/Dialog` now states *interrupts / accompanies* in the wording below, and
> §`ui/Drawer` has lost D4's separate read-only paragraph to it. This slice
> **applies** that rule; it does not restate it. Everything below is the argument
> that produced it, kept as the record of why.

**Reported from use, 2026-07-31:** *"In the stage plot there is a Trusses modal to
manage trusses. It should be a drawer according to the design language."* It is a
`Dialog` — `PlotTrussManager.tsx:78`, titled *Trusses*, opened from the desktop
toolbar's *Trusses…* button (`StagePlotTab.tsx:670-674`) and mounted at
`StagePlotTab.tsx:776-789`.

**It is an overlay of fields by any reading.** Per truss: an inline-committing name
and a hang height (lines 196, 205), rotation and rake when the truss is on the
current plot (240, 258), a piece picker with an auto-suggested length and *Add*
(297-323), an attach-fixture picker with an offset and *Attach* (341-359), plus a
per-piece and per-fixture row each carrying its own controls. Below all of it, a
new-truss form (100-112). Nothing here is a sentence and two buttons, which is the
only thing `components.md` §`ui/Dialog` reserves a `Dialog` for.

**The shape.** §`ui/Dialog`'s rule as written offers two answers — *an overlay with
fields is a `Sheet`; an overlay that is a sentence and two buttons is a `Dialog`* —
and `Sheet` is the phone's anchor, reached on a desk only through `ui/Drawer`, which
*is* `Sheet` below 768 px. So the desktop shape of an overlay with fields is a
`Drawer`, which is what the report says and what this slice builds. That reading is
not yet written down in those words: D4 added the read-only-consult answer to the
same rule and left the fielded case pointing at a component that has no desktop form.
**Slice 38 walks into the identical gap** — `EventMembersDialog` is the same fault on
the same rule — so whichever of the two lands second inherits the other's wording,
and the rule is stated once, not twice.

**The distinction the rule needs is not *has fields / has no fields* — it is what the
overlay is for** (user's call, 2026-07-31, and the wording the rule should be written
from):

> **A `Dialog` interrupts.** One choice has to be made before what you were doing can
> continue — pick the cable, confirm the delete — so it takes the centre, blocks the
> surface behind it, and leaves as soon as it is answered.
>
> **A `Drawer` accompanies.** It is a companion workspace beside the thing you are
> working on: it opens over the surface without replacing it, and you go on working in
> it rather than answering it.
>
> **A companion does not have to be editable.** A `Drawer` is equally the place to
> *see more* — the detail, the breakdown, the list the surface behind it only counts.
> Consulting is accompanying; it is the same shape with nothing to change. **On a
> phone that is the common case**: the canvas or the row is the work, the drawer is
> where its values are legible, and several are read-only outright.

Read that way the rule sorts every overlay in the application without a second clause,
and four cases that used to need arguing fall out of it. **`ui/ConfirmDialog` is the
purest `Dialog`** — a single choice, and nothing continues until it is made. **The
cable pickers stay `Dialog`s** (`InputGraphCanvas.tsx:1689`, `AudioOutputsTab.tsx:1860`,
and the two *Cable* dialogs beside them) even though they hold a field: they are one
choice raised mid-patch, and centred is where the pointer already is — a right-anchored
drawer would make a picker travel to the edge of the screen and back for every cable,
which is `Drawer`'s own ergonomic argument read from the other end. **Trusses is a
`Drawer`**, and this is the test that says so plainly: nothing is waiting on it. You
assemble a truss, hang a fixture, go back to the canvas and come back — the plot is
what you are working on and the truss list is the bench beside it. `ChainCell.tsx:175`
stays settled too, on the same reading.

**And D4's rule stops being a third answer and becomes a sub-case.** *A read-only work
surface opened from another surface is a `Drawer`* is not a separate ruling once a
drawer is defined as a companion — the catalog browse is a companion you cannot edit,
which is what consulting is. One clause absorbs it, and `components.md` §`ui/Drawer`
loses a paragraph instead of gaining one.

This is also what makes Slice 39's own phone decision ordinary rather than an
exception. A drawer that is read-only on a phone is not a drawer with its function
removed — it is the *see more* case, which is the case a phone has most of: the canvas
cannot show a truss's pieces, its total length or which fixture hangs at which offset,
and the drawer is where those become legible. Editing is absent because placement is
absent, and the surface is doing its job either way.

It also explains why *has fields* was the wrong test in the first place: it asked what
an overlay **contains**, and the pickers have fields while being interruptions and the
read-only companions have none while being workspaces. The test misfiled both from the
day it was written.

Width is the mockup's call: `Dialog`'s `max-w-2xl` is what it has now, `Drawer`'s
`wide` is `max-w-3xl` and `narrow` is `max-w-md`. The rows run three and four controls
across, so `wide` is the neighbourhood. Whether each truss becomes a `DrawerSection`
or the body stays one construction under `flush` is the second call.

**On a phone the drawer opens and edits nothing — decided 2026-07-31, before the
mockup.** The stage plot's mobile branch (`StagePlotTab.tsx:360-487`) is read-only *by
decision*: the canvas takes `readOnly`, placement is withheld by handing it
`onUpdateElement={() => {}}` (lines 444-447), and the desk-job note says so in the
panel. Slice 36 settled that the plot is edited at a desk. A `Drawer` acquires a phone
form for free, and the question that answers is whether that form edits. It does not,
and the reason is the canvas behind it: **you cannot move a truss on a phone, so
adding one there buys nothing** — you would assemble a truss out of pieces and have no
way to put it anywhere. Add and remove are only worth having where placement is.

So the phone gets the read and the desk keeps the write, which is what the surface
already does one layer out. That is `readOnly` forced at the mobile mount rather than
a second component — the same move the mobile branch already makes for the canvas on
the line above, and role still forces it independently on either width. It is also
what `components.md` §5 says a phone overlay is for: *a role that may not edit still
opens the sheet, because the values are the point of opening it* (audit M4). The
values here are the ones the canvas cannot show — a truss's pieces, its total length,
its hang height, and which rig fixtures hang at which offset.

**This is provisional, and the section says so on purpose.** It is *for now*, tied to
one fact: the phone cannot move a plot element. If the phone ever gets placement, this
is the paragraph that reverses, and the reversal is a decision, not a leftover.

Two things follow that the mockup owns. **The trigger needs a phone home** — the
desktop's *Trusses…* button sits in a toolbar the phone does not render, and the
mobile panel's status strip already counts *N trusses* (line 406), which is either the
way in or the argument for a `MobilePanel` action beside the plot picker. And **the
read view is not the edit view with its inputs disabled**: a `Select` and an `Input`
greyed out is the shape 6c spent a slice removing. Values read as values; `tokens.md`
§7's 44 px minimum binds only what remains tappable, which on a phone is the way in,
the way out, and nothing else.

What the redesign covers once the shape is chosen:

- **The four-sentence explanation at the top of the body** (lines 79-84 — what a truss
  belongs to, how it is counted on the rental order, that its length is the sum of its
  pieces, and that fixtures can be dropped on it) is read once and costs its space
  forever after. It is `info` with a `noteId`, per the rule D5 restated — not the
  body's first paragraph, and not `footer`. The id is the call site's to give,
  kebab-case, after what the drawer *is*; the title *Trusses* cannot serve.
- **Deleting a truss is a `window.confirm`** (line 227) — the browser's own dialog,
  which D2 removed from the flow inspector and `ui/ConfirmDialog` exists for. It is
  the right sentence already; it is in the wrong component. **This slice converts the
  one it owns and no others** — the other eight are D6, which settles the pattern. If
  D6 lands first this bullet is already done; if this slice lands first, D6 finds
  seven and this one is its worked example.
- **Removing a piece and detaching a fixture have no confirm at all** and no label:
  both are a bare `X` at `h-3.5` (lines 288, 413). Detaching is recoverable and the
  title says so (*the fixture stays in the rig*); removing a piece silently changes the
  truss's drawn length, which is the thing the plot is measured against. Decide per
  action rather than converting both by reflex.
- **The legacy-piece marker** (lines 284-286) — an amber *(legacy)* whose meaning lives
  only in a `title` attribute — is a state a drawer can state properly.
- `readOnly` already gates every control and survives the move intact; a viewer keeps
  the read of the truss list, its pieces and its attached fixtures.

Design approval is required. It is a substantial change to a user-facing surface
(trigger 1) and it settles a rule in `components.md` §`ui/Dialog` that the language
does not currently state in the form the change needs (trigger 2, which is not a
judgment call). Depends on Slice 13 (trusses and their pieces/attachments, unchanged),
Slice 33 (`ui/Sheet` and `Drawer`'s phone branch) and Slice 36 (the plot's read-only
phone decision, which the first call above rests on). Shares its rule with Slice 38.

### Delivered

Design approved 2026-08-05 from `specs/039-plot-trusses-drawer/mockup.html`, with its
three open questions ruled as drawn: the phone bar takes a third row so *Trusses* can
ride in the `overflow` rather than among the view controls; the truss glyph goes
unlabelled; and *Rotation (top)* / *Rotation (front)* become **Rotation** / **Rake**.
No backend change and **no `design/` change** — the whole slice is Slice 38's rule
applied, and nothing it needed was missing from the language. That was the claim the
spec made (FR-006/SC-005) and it held: `git diff main -- design/` was empty at merge.

**The shape.** `wide` + `flush`: one construction of truss bands over hairlines, not a
stack of `DrawerSection`s and not the cards-inside-cards it had. A section per truss
would have put a record's name into a `MicroLabel`, which is a category's voice. Each
truss is a header band over `Pieces` and `Fixtures`, each a micro-label over full-bleed
rows; the new-truss form is last under its own band. The four-sentence preamble became
`info` + `noteId="event-trusses"` — read once, then costing nothing.

**The phone is a read, and the read is not the edit view greyed out.** `readOnly` is
forced at the mobile mount, for the canvas's reason rather than the reader's: you cannot
place a truss on a phone, so assembling one buys nothing. What it gains is what the
canvas cannot draw — a truss's pieces, its total, its hang height, and which fixture
hangs at which offset on which lane. Read-only renders *different nodes*; `disabled` no
longer expresses read-only anywhere in the file. The way in is a lone `overflow` entry,
which `MobilePanel` already renders as its own 44 px target — the status strip's truss
count stays a count, because it can filter to none of its three facts and §7b's chevron
already means something else.

**Decisions worth keeping:**

- **`touch` is geometry plus two width-composed sentences, and never a permission.**
  The phone drops the legacy piece's *re-pick it from the catalog* (the fix is a desk
  job) and moves the total into the Pieces band (its header has no room). Both say a
  different true thing to a reader who can do different things. `PlotTrussManager` never
  imports `useIsMobile`; what a *role* may do is `readOnly`, a separate prop from a
  separate answer. The prop's own doc names the line it must not cross, because this
  file is the worked example.
- **The desktop trigger lost its `!readOnly` guard.** A companion does not have to be
  editable, so a viewer opens the drawer at either width — which makes `readOnly` the
  only client-side gate on it, the same shift Slice 38 recorded.
- **Removing a piece gained a confirm it never had; detaching deliberately did not.**
  A piece's damage is silent and elsewhere — the drawn length is the sum of the pieces,
  so every plot redraws while you are looking at a list of near-identical rows, and a
  legacy piece cannot be re-added as one. Detaching is undone by the picker in the same
  row, and a confirm on a reversible act is what teaches people to dismiss confirms.
  Both `✕` controls got names and 28 px targets either way.
- **A placed truss states itself.** It was a `disabled` button reading *On plot* — a
  control that cannot be pressed pretending to be a fact. It is a `Pill`, at the chip
  formula's own ink (`tokens.md` §5): review caught it at `sky-400`, which would have
  made this slice a `design/` edit by accident.
- **The truss delete converted and no other.** This is D6's worked example, and D6's
  count is wrong — see its section.

**Found while delivering: D6 undercounts by seven.** Its table names eight remaining
`window.confirm` sites; the live count after this slice is **fifteen**. Verified by grep
on 2026-08-05, not taken from the record. The seven it omits are `StagePlotTab.tsx:610`
(delete a stage plot and everything on it), `LightingSheet.tsx:344`, `LightingTab.tsx:96`,
`InputSheet.tsx:229`, `InputDeviceSection.tsx:60`, `TrueOutputDeviceSection.tsx:70` and
`StageMultiSection.tsx:191`. **Left uncorrected on purpose** — amending a defect's brief
is the user's call, and D6 is scheduled off a figure roughly half the real work.

## Slice 40 — The audio exports become documents (spec: `audio-pdf-exports`) — ✅ 2026-08-06

**Asked for 2026-07-31:** *"redesign some of the print/pdf exports… Audio input and
output sheets, stage plots and signal flow. I want to improve the signal flow parts in
input and output sheets and the complete signal flow pdf. Perhaps have separate table
for channel info and signal flow? And sources?"* Split in two at the ask: the audio
sheets and the flow are this slice, the plot is Slice 41.

**Three decisions were taken before the spec, and they are the shape of the slice.**

**1 · These become generated PDFs, not browser print (user's call).** Everything in
`components/print/` is a React sheet hidden on screen and revealed by `@media print`
(`index.css:121-143`); *PDF* today means whatever the browser makes of it, and
`PrintButton.tsx` is eleven lines around `window.print()`. The only real document the
application produces is the rental order — `service/rental_pdf.go`, `go-pdf/fpdf`,
served at `GET /events/{id}/rental-export/pdf` (`api/rental.go:28`). That is the
pattern these three follow: pagination, repeated headers and an honest scale are worth
the second implementation, and none of them are the browser's to give.

**2 · The chain column leaves the table, and the flow prints as the diagram.** *"The
long strings of steps are not easy to read"* — and that is the whole diagnosis. The
input sheet is eight columns (`InputPatchSheet.tsx:8`) of which one, `Chain`, holds an
entire path as `→`-joined segments (`ChainText.tsx:18`); the output sheet is six
(`OutputPatchSheet.tsx:9`) with the same column doing the same thing; and Signal Flow
prints as two tables of the same strings (`SignalFlowTab.tsx:113-318`). One column was
being asked to carry a graph, and it squeezed every other column to do it.

Take it out and the table has room for what the sheet was missing: **channel identity
and source in one table** (user's preference; two is acceptable if one will not fit).
The source fields are already there to print — kind, mic item, stand item, phantom,
connector, width (`types/index.ts:185-199`) — and today a crew reads them out of a
chain string or not at all. The output sheet's analogue is the destination end.

**3 · The reading of "the signal flow parts in input and output sheets".** Each patch
sheet's document ends with its own diagram, filtered to that sheet; the complete signal
flow PDF carries both. Three documents, three endpoints, one renderer. The spec
confirms this before anything is built — it is the one place the request admits a
second reading.

**What makes the diagram affordable is that nobody has to lay it out.** The nodes are
user-placed and the positions are already server-side: migrations 025, 027, 029, 031
and 043 put `position_x/position_y` (and the input graph's and console-local variants)
on devices, stageboxes, stage-multis and desks. The PDF draws the picture the canvas
shows because it reads the same coordinates. Slice 37 is why they are trustworthy —
until it landed they held browser-window widths.

**What is not affordable is everything else about the drawing, and this is the decision
the plan makes first.** Only the node *origin* is in the database. Box size, port rows,
edge routing and the colour derivations are computed in `lib/inputGraph.ts` (344),
`lib/outputGraph.ts` (384) and `InputGraphCanvas.tsx` (1,750) — TypeScript the backend
cannot call. Three ways out, and the plan picks one with its reasons written down:

- **Port the geometry to Go.** Honest, self-contained, and a second implementation of a
  drawing that will drift from the canvas the first time either side changes.
- **The client sends the geometry it has already computed** and the endpoint draws it.
  One implementation of the layout, at the cost of an export that cannot be produced
  from a URL alone.
- **Move only the derivable part** — sizes and port order are functions of the data;
  edge routing is not. A split, and splits are where drift hides.

**The font is a hard constraint, not a detail.** `rental_pdf.go:36-43` records it: the
document uses built-in Helvetica with a cp1252 translator so no font file is embedded
and the binary stays small, and **`→`, `·` and `–` are not representable**. The arrow
that survives on paper today does not survive a cp1252 PDF. Either these documents
embed a UTF-8 font (`AddUTF8Font`; still CGO-free, larger binary) or arrows are drawn
as vector glyphs, which the diagram needs anyway. Decide once, for all three.

**Three of the four sheets convert; Lighting does not.** `LightingRigSheet.tsx` was not
in the request and stays browser print, so both mechanisms coexist afterwards and
`design/patterns.md` §8 has to say which surface uses which and why — it currently
describes one mechanism as though it were the only one (*"Any new print surface follows
the same two mechanisms"*). §7h's *every phone surface reaches the export it has* gets
easier, not harder: a download is a download. Whether the converted sheets' React
components are then deleted is the same question `feedback-delete-dead-components`
answers — a zero-caller component is a second answer sitting where the first one goes —
and the sheets' Vitest coverage (`printSheets.test.tsx`, 306 lines) moves to Go with
them or is lost knowingly.

Design approval is required: it is a substantial change to user-facing output
(trigger 1) and it amends §8 (trigger 2, not a judgment call). The mockup owns the page
furniture — header block, per-page repeat, column widths, how a diagram too wide for A4
breaks — and should be drawn as the PDF's own language rather than as the screen's.

Depends on Slice 22 (the PDF writer and its cp1252 constraint), Slice 37 (positions that
mean something), and Slices 11/12 (the graphs themselves). Shares its §8 amendment with
Slice 41, and whichever lands second inherits the other's wording.

### Fixed — 2026-08-06

Run under **OpenSpec**, not Spec Kit: `openspec/changes/audio-pdf-exports/`. The mockup
was built inline and approved before the proposal, and its D1-D12 and R1-R7 became the
requirements verbatim.

**The user changed the shape at the first question.** The roadmap read the request as
three documents — a diagram at the end of each sheet plus a complete flow PDF. Asked
directly, the answer was **one combined document**. So it is one endpoint,
`GET /events/{id}/audio-export/pdf`, returning five sections in order: input patch,
output patch, stage rig, signal flow inputs, signal flow outputs. Every audio surface
offers the same *Export PDF* and gets the same file.

**A stage rig section was added on request** — the fourth thing the ask did not
mention. Per box: installed and patched jacks in and out, spare by subtraction, a
console's local panel on its own line, and a total line. It has **no location column
and cannot have one**: `position_x/position_y` is canvas placement in a flow graph, not
where a box stands on stage, and a column filled from it would be a confident lie. A
real field is a schema change and a different slice.

**The geometry decision went the other way from the roadmap's fear.** It warned that
box size, port rows and edge routing live in TypeScript the backend cannot call. But
`graph/tokens.ts:41` is `PORT_ROW = 'flex h-[18px]'`, `NODE_WIDTH = 200`,
`SOURCE_ROW_HEIGHT = 20` — constants and multiplication. The `getBoundingClientRect()`
calls in `InputGraphCanvas.tsx` serve dragging and the ghost cable, not the box
geometry. **Porting to Go was the cheap option**, and it is not a copy that can drift:
the paper drawing has requirements with no on-screen counterpart at all, because the
canvas draws one coloured bezier per cable onto a plane that scrolls, and paper has
neither colour to spare nor room to scroll.

**The user's routing rule is what the flow section stands on:** *lines may cross,
parallel lines may never overlap — they are all black, so you cannot follow one.* It
became R1-R7 in `design/patterns.md` §8a, and an invariant a function checks rather
than a reviewer: `CollinearOverlaps` reports any two runs sharing a line, every routing
test calls it, and the router itself calls it — a cable caught sharing ink is upgraded
to a five-segment carrier route and the channel re-routed. 1,440 random arrangements
run in the suite; 7,200 were run while building it.

**Six routing defects, every one found by the checker rather than by eye.** A swap
cannot be drawn with one corner each — whichever lane order suits one cable is wrong
for the other, and equal lanes put both verticals on one line. A backward cable ran a
long horizontal at jack height straight through everything, because the router assumed
left-to-right. Two cables arriving at one jack converge as truly as two leaving it, so
R5's exception had to be symmetric. Carrier heights are reached by repeated addition,
and a map keyed on the float let two cables on one visible line pass as two.
`groupColumns` chain-merged every box into a single column, so the channel-width check
never ran and accepted a 12 mm gap that needed 13.6. And a carrier row three
hundredths of a millimetre from a jack is drawn on top of that jack's own run-in.

**Four more the sample document showed that no test would have.** `fpdf` swaps `Wd`
and `Ht` for a landscape page, so `AddPageFormat("L", 297x210)` produced a 210 mm wide
page and every box past that fell off the edge. `SetHeaderFunc` runs on `AddPage` too,
so the section title printed straight through the running head it had just drawn. A
tile is a window onto the plane and has to be clipped, or every page draws the whole
graph and boxes from other sheets bleed in. And the unnamed placeholder desk every
event is born with (`db/events.go:174`) was drawn as an empty box on every graph — the
canvas keeps it because it is somewhere to patch to, and paper has nothing to patch.
It is excluded from the rig list for the same reason.

**The cp1252 constraint was probed, not trusted, and `rental_pdf.go:36-43` was wrong.**
En dash (0x96) and middle dot (0xB7) *are* representable, along with `a-ring a-umlaut
o-umlaut e-acute & x-times degree bullet`. What is not is the right arrow — and it does
not render as garbage, it renders as `.`, a plausible-looking full stop rather than a
visible defect. That is the real argument for drawing every mark that carries meaning:
arrowheads are filled triangles, jacks are circles, phantom power is a filled square.
Slice 22's comment is corrected in this change, since Slice 41 would have inherited it
next.

**Deleted:** `print/InputPatchSheet.tsx`, `print/OutputPatchSheet.tsx`,
`print/ChainText.tsx` and their call sites, once the endpoint replaced them. Their
cases in `printSheets.test.tsx` moved to Go table tests against the generated document
rather than being dropped. `PrintSheet` and `StagePlotSheet` stay; Slice 41 takes them.

**`design/patterns.md` §8 rewritten** as *Paper*: two mechanisms with a table saying
which surface uses which and why, the cp1252 draw-don't-type rule, the continuation
line, colour as carried-never-load-bearing, and §8a for a drawn signal path. Slice 41
inherits this wording rather than writing its own. `tokens.md` §3's mono list loses
`ChainText`.

**Run against the real database** (copied to `/tmp`, never touched in place), and it
found the one defect the tests could not: on *Jonas och Emelies bröllop*, six of eight
output cables were being silently dropped. Two node kinds were missing from
`buildOutputGraph` — the desk's **local jack panel**, which is a pass-through on that
graph exactly as it is on the input one, and a device's **link-out ports**, which
daisy-chain sub to sub to top under their own `device_link` from_kind and are never
counted toward `output_port_count`. Both are drawn now, and every cable on every real
event routes with zero overlaps.

### Field test — 2026-08-06

Three defects the field test found, all in the flow drawings; the tables were right.

**The frame measured the boxes and not the cables.** A cable routed into the gutter
above the topmost box runs at a *negative* height — on the reported event, 2.5 mm above
the drawing origin — and one leaving past the rightmost box ran 5 mm off the side. Both
were then cut by the tile clip, so the Trumpet source's run to `Local in 9` climbed into
the section title and reappeared near its destination. The plane is now measured after
routing, from boxes and segments together (`FlowLayout.Frame`), and the drawing shifted
so nothing sits outside it. Since framing can then push a graph over the page,
`LayoutAndRouteFlow` re-fits once into a block reduced by exactly the overflow before
reaching for a second sheet.

**Boxes appeared on both sheets of a tiled drawing, as text with no borders.** The
cause is in fpdf: `SetX` reads a *negative* abscissa as measured from the right edge of
the page (`fpdf.go:3610`). A box belonging to another tile was therefore drawn at a
negative x, its rectangle placed off-page and clipped away while its labels wrapped back
onto the sheet — a borderless table of someone else's content. Clipping alone can never
fix that; off-tile boxes are now skipped outright.

**The output graph tiled for a reason tiling cannot fix.** Four output devices sit
stacked at one spot on that event's canvas, which the fit loop read as failure and so
walked all the way down to the tiling fallback — where they are still stacked, just
dealt across pages. Overlap that exists at the canvas's own density is now excluded from
the check: only overlap the *scaling* introduced counts. Boxes the planner left on top
of each other are drawn on top of each other, which is what the canvas shows; boxes at
exactly the same coordinates hide each other entirely, and the stage rig section is what
still lists all of them.

The missing `M23R local` node and the six dropped output cables in that report were the
`console_local`/`device_link` defect already fixed above — the tested file predated it.

**The floor was reached on real data.** That event's output graph tiles across two
pages at shrink 0.83, which puts its jack labels at exactly the 5 pt floor; its input
graph fits one page at 0.95. So the tiling path is exercised by a real patch rather
than only by a fixture — but the floor itself is still a judgment, one named constant,
and no festival-sized patch has been through it.

## Slice 41 — The plot on paper, in four sheets and in colour (spec: `stage-plot-pdf`) ✅ merged 2026-08-06

**Asked for 2026-07-31, in the same breath as Slice 40:** *"Stage plots I just want to
make prettier with layout and color and have all three angles."* Same delivery decision
— a generated PDF, not browser print.

**Today it prints one angle.** `StagePlotSheet.tsx:159` renders `plot.active_view` and
nothing else: whichever of top/front/side the editor happened to be showing. The
elevations get a floor line (line 169), the drawing is framed to its content with a
60 cm margin, the height is capped at `160mm` (line 167), and a caption says the grid
square and *drawn to scale* without saying what the scale is. **One page each for top,
front and side** (user's call — option 1), which also removes the trap that the printed
sheet depends on editor state.

**Colour, with the contrast handled — and this is the part that is a rule, not a
setting.** The user's wording: *"The frontend has a black background and PDF have white.
Some colors might need to be inverted. At least when they are on the grayscale
spectrum."* Colour on a plot is per-layer (`StagePlotLayer.color`,
`types/index.ts:715`), defaulting to `#a1a1aa` — zinc-400, chosen to read on a dark
canvas (`StagePlotCanvas.tsx:58`). Elements carry no colour of their own
(`types/index.ts:734-755`), so the layer is the whole palette. A near-grey picked to
glow on black is washed out to invisible on white, and inverting its lightness is the
fix; a saturated hue keeps its hue and needs a lightness clamp instead, or a pale yellow
line disappears just as completely. **That is a rule about how the dark language crosses
onto paper, it applies beyond this one surface, and it belongs in `design/` rather than
inside a renderer** — which is what makes this a slice and not a defect.

`patterns.md` §8 currently states the opposite in as many words: *black on white… colour
cannot be relied on from a printer.* That sentence was true of a browser print of a
table and it is not true of a generated PDF of a scale drawing, where colour is how a
layer is told from a layer. §8 gets the amendment; Slice 40 needs the same paragraph
rewritten for a different reason, so the two coordinate.

**The geometry port is the cost, and it is heavier than Slice 40's.**
`lib/stagePlot.ts` is 496 lines — `projectElement`, `projectedBounds`, `projectedAxes`,
`projectedOutline`, `trussLaneLocalV`, `clampFixtureOffset`, `fixtureLabel` — and
`lib/stagePlotIcons.tsx` is 627 lines of SVG glyphs, **per icon and per view**. The
print sheet reaches straight into both (`StagePlotSheet.tsx:2-3`). The projection maths
is pure and ports cleanly. The icons are the bulk and the real decision: port the path
data, draw simpler primitives on paper, or hold the glyphs in one format both sides
read. The same question Slice 40 asks about edge routing, with more surface area.

Three more the mockup owns:

- **A stated scale.** *Drawn to scale* is not a scale. A crew that measures off a
  printout needs 1:50 or 1:100 named on the page, and a fixed scale is what makes three
  pages comparable — the current fit-to-content framing gives each view a different one.
- **What a page carries besides the drawing** — the plot name, view, grid, scale, and
  whether the legend is the layer list. A legend is what earns the colour.
- **Trusses and their fixtures on the elevations.** The hang-below-the-bar projection at
  `StagePlotSheet.tsx:118-139` is the fiddliest thing on the sheet and the most valuable
  to a rigger; a fixture marker that renders as a 1 mm square with an unreadable label
  is worse than an honest table beside the drawing.

Design approval is required on both triggers. Depends on Slice 13 (plots, layers,
trusses), Slice 22 (the PDF writer), and Slice 40 if it lands first — the renderer, the
font decision and the §8 wording are shared, and doing it second is meaningfully
cheaper.

### Delivered

Run under OpenSpec (`openspec/changes/stage-plot-pdf/`). The mockup was drawn from the
live `Kyrkan` plot with `lib/stagePlot.ts` ported verbatim into it, so the design was
reviewed against real geometry rather than a sketch; the user approved it and settled
the three open questions (one glyph data file, a fourth schedule sheet, tiling rather
than refusing).

**`GET /events/{id}/stage-plots/{plotId}/export/pdf`** returns four A4 landscape
sheets for **one plot**: top view, front view, side view, element schedule. The plot's
stored `active_view` is no longer read by anything — the trap this slice was partly
about is gone rather than worked around.

**The three properties that carry it.**

- **One scale**, the largest on the ladder 1:20 … 1:500 at which every view fits,
  stated in figures *and* drawn as a graduated bar. A copier resizes the sheet and the
  bar with it; the figures quietly become a lie.
- **Three shared world windows** — width, depth, height — so two views drawing the same
  axis place it identically. A vertical dropped from the plan meets its element in the
  elevation, and the elevations stand on one floor. Asserted, not assumed.
- **The colour crossing**, now `design/patterns.md` §8, applying wherever a
  dark-ground value has to appear on white.

**The roadmap's stated colour mechanism was wrong, and real data is what showed it.**
Inverting a near-grey's lightness fixes the pale end by breaking the dark one: the
`Kyrkan` plot's Venue layer is `#5e5c64`, already legible on paper at 6.58:1, and
inverting it gives `#9d9ba3` at **2.74:1** — the one layer needing no help would have
been the only one damaged. The rule that shipped keeps hue and saturation and lowers
lightness only, to a 4.5:1 floor, stopping there; a colour already dark enough is
untouched. It gained a clause the brief did not have: **an unset layer prints as ink**,
because the canvas default is a consequence of the black ground and not a decision, and
carrying it over would collide with a layer whose colour genuinely is a grey.

**The icon question was answered with the middle option.** The 17 icons × 3 views moved
out of `lib/stagePlotIcons.tsx` into `stagePlotGlyphs.json`; the TSX became a renderer
of it and Go grew a second renderer (`internal/service/plotglyph`) that flattens each
mark to a device-space path. The refactor was verified by diffing
`renderToStaticMarkup` across all 51 glyphs before and after — byte-for-byte identical —
and the frontend's 615 tests passed unedited. A Go test fails while the mirrored copy
differs; `make sync-glyphs` is the fix.

**Decisions worth keeping.**

- **Flatten glyphs in Go rather than using fpdf's transform stack.** An icon is
  stretched non-uniformly into its element's footprint, and a PDF transform scales the
  pen with the geometry — a wide, short element would get a fat horizontal stroke and a
  thin vertical one. The canvas escapes this with `non-scaling-stroke`; paper's escape
  is to transform the points and leave the pen alone.
- **`setInk` sets draw, fill *and* text.** fpdf's `SetTextColor` emits nothing on its
  own — it records the colour and a flag saying whether it differs from the fill, and
  text only writes a colour operator when it does. `ClipEnd` emits `Q`, restoring the
  PDF's graphics state while fpdf's tracking still points at whatever was set inside the
  clip. Between them, black text came out in the last element's layer colour. Setting
  all three puts a real operator in the stream every time.
- **An elevation names only what is off the floor.** Labelling every element in both
  the plan and the elevations piled the whole floor-standing rig into one illegible line
  along the datum. The plan identifies; the elevation reports height.
- **A label's position turns with its element; its orientation does not.** A drawing is
  read one way up.
- **The audio document's furniture was extracted, not copied**, into `paperdoc.go`
  parameterised by page width. `audio_pdf_test.go` passing unedited is what made the
  extraction safe to keep.

**Still open, and inherited rather than introduced:** the 5 pt legibility floor that
decides when a drawing divides instead of shrinking is still a guess, and no
festival-sized plan has been through it in either slice. The tiling path is covered by a
synthetic 300 m plot, not by real data. Where elements overlap into a run wider than one
frame, no division can keep them all whole; the document draws them rather than
refusing, and says so in a comment.

## Known defects — found, reproduced, not yet scheduled

Each of these has been traced to a specific line. A defect with a cause written
down is a defect somebody can pick up; a symptom in a chat log is not. A fixed
one keeps its section and is marked as fixed: the cause is still the most useful
thing written down about that code.

**A section here is the brief.** It states the cause, what a fix has to cover and
the decision the fix has to make first, so it is fixed on a `dN-` branch without
a `specs/` directory — see *Defects* in `CLAUDE.md`. One that edits `design/`,
needs a migration, or spreads past a handful of files is a slice instead, and
goes through the design approval and the full spec → plan → tasks.

**Adding one is the user's decision, not the agent's.** Report the defect — the
reproduction, the line, and what a fix would have to cover — and ask before
writing a section. A section here schedules work and gives a symptom the standing
of a traced fault; neither is yours to grant. Once it is approved, an open defect
also takes a row in **What remains** at the top of this file, and loses that row
when it is fixed. The section stays either way: the index is the worklist, the
sections are the record.

### D1 — The legacy catalog can become permanently ownerless ✅ fixed 2026-07-30

**Found:** 2026-07-29, during the Slice 35 field test. The report was a console
404 on `GET /api/v1/inventories/1/items/273/fixture-modes` when opening a
fixture on the phone. That request is a symptom; the cause is three layers down
and much wider.

**The cause.** Migration `038_inventory_ownership.up.sql` deliberately creates
the pre-existing catalog **ownerless**, to be adopted by whoever logs in first —
and the adoption lives in `db.EnsureUserHasInventory`, called from `auth.go` on
every login. But that function's first act is:

```go
SELECT COUNT(*) FROM inventories WHERE owner_user_id = ?
if count > 0 { return nil }   // ← already has one; nothing to do
```

It answers *"does this user own at least one inventory?"*, when the claim needs
*"is there an ownerless legacy inventory to adopt?"*. Those come apart the
moment a user creates an inventory of their own **before** the legacy one is
claimed: from then on the early return fires on every login and the legacy row
stays `owner_user_id IS NULL` forever.

**What that costs.** `middleware.RequireInventoryOwner` compares
`inventory.OwnerUserID != user.ID`, and a NULL owner matches nobody — so **all
eighteen owner-scoped routes 404 for everyone**: read/rename/delete the
inventory, its categories, its items, `import-xlsx`, and the fixture modes. It
is also absent from `listMine`, so it cannot be reached in the interface to be
repaired or deleted. In this developer's database that is a catalog of **308
items and 27 categories with a live event still bound to it** — the event works,
because events read their catalog through `RequireEventAccess` rather than
through the owner guard, which is exactly why this stayed invisible until a
phone opened a fixture.

**Not caused by Wave 6.** The desktop `LightingSheet` makes the identical call
and has since Slice 7; the phone only made it reachable more often. Slice 35
stopped the query retrying three times (`retry: false` — a 404 is an answer, not
a hiccup) and left the cause alone, because it is a backend fix and that slice
was frontend-only.

**The rule the fix settled on** (2026-07-30 product decision, which is wider than
the defect): **a login provisions no inventory.** A new user owns no catalog until
they create or import one, or reaches one through an event shared with them. That
retires both of Slice 16's bootstrap behaviours — the auto-created *My Inventory*
and first-login adoption of the legacy catalog — and it is affordable now because
Slice 32 gave the Inventories page a real onboarding empty state (`EmptyAccount`:
*New catalog* and *Download the template*), so there is no dead end to protect
against. Event creation already 400s with *"inventoryId must be an inventory you
own"* and the drawer's `Select` is empty, so the path to the empty state is the
only path.

**The fix**, under that rule:

1. **The claim.** `EnsureUserHasInventory` is gone, replaced by
   `db.ClaimInventoriesForOwnedEvents`: `UPDATE inventories SET owner_user_id = ?
   WHERE owner_user_id IS NULL AND EXISTS (SELECT 1 FROM events e WHERE
   e.inventory_id = inventories.id AND e.owner_user_id = ?)`. It runs on every
   login, straight after `ClaimOwnerlessEvents` — the events are claimed first
   and the catalog they read follows them. No "does this user own one?" guard
   survives, which is the defect itself; the `WHERE` clause is the whole test,
   and it is idempotent because a claimed row is no longer ownerless.
   This is the only claim narrow enough to live under the rule: a user whose own
   events already read a catalog is not being handed anything, they are being let
   back into what D1 locked them out of. A stranger's login claims nothing.
2. **The data.** Migration `048_adopt_ownerless_inventory` applies the same rule
   — the catalog follows its events — to databases that already hold the orphan,
   claiming it for the owner of the **earliest** event bound to it, so several
   owners resolve deterministically to whoever has had it longest. It exists
   *because* the login path cannot cover a pre-Slice-16 upgrade: at migration
   time that database has no users at all, so nobody's events can pull the
   catalog across yet.
3. **The sweep.** Migration `049_drop_empty_bootstrap_inventory` deletes an
   ownerless inventory that holds no category, no item and no event. This is
   038's bootstrap row, which is inserted **unconditionally** — so *every*
   database has had one, a freshly created one included, and it was only ever
   reachable through the first-login adoption that the rule above retires. Left
   in place it would sit ownerless forever: invisible in the list, 404ing every
   owner-scoped route — D1's state reached by a different road. Anything with
   content in it is real data and is left to 048.
4. **What 048 broke on the way, and how.** `convertLegacyInventoryTemplate`
   identified the bootstrap row as *the ownerless one* — true until 048 started
   claiming it first, after which a pre-Slice-16 upgrade would have skipped
   storing its `LL.xlsx`. It now keys on `id = 1`, which is exact rather than
   clever: 038 creates the table and inserts exactly one row, the column is
   `AUTOINCREMENT`, and `sqlite_sequence` was checked on a fresh install — after
   049 deletes row 1 the next inventory gets id 2, so nothing can ever occupy it.
   Both `down` files are documented no-ops: nothing records which rows 048
   repaired, and 049 deleted rows that held nothing to restore.

**Rehearsed** against a copy of this developer's database (never the file itself):
version 49, clean; inventory 1 now owned, with its 308 items, 27 categories and
its stored `LL.xlsx` intact; the other three untouched; nothing deleted. And on a
fresh database: version 49, **zero** inventories.

Regression tests: a first login provisions nothing and a freshly migrated database
holds no inventory row at all (`TestLoginProvisionsNoInventory`); the owner of an
event bound to an ownerless catalog adopts it even though they already own one,
while a stranger claims nothing (`TestClaimInventoriesForOwnedEvents`); and both
migrations run on seeded pre-fix data (`TestMigration048AdoptsOrphanedCatalog`,
`TestMigration049DropsEmptyBootstrapInventory`, via the `execMigrationFile`
harness).


### D2 — The flow inspector's delete is a browser dialog ✅ fixed 2026-07-30

**Found:** 2026-07-29, during Slice 36. `InputFlowInspector` and `OutputFlowInspector`
both confirm a delete with `window.confirm`, at every width.

Slice 32 removed the application's only `window.prompt` on the argument that a browser
primitive is not this language; the same argument applies here and applies harder on a
phone, where the sheet it interrupts is the surface the user is reading. It was left
alone in 6d deliberately: it is a **desktop-visible change to a destructive path**, and
6d was a phone phase, so mixing it in would have made a regression unattributable — the
rule every wave in the convergence has followed.

**What a fix has to cover.** The replacement is `ui/Dialog` — *"an overlay that is a
sentence and two buttons is a `Dialog`"* (`patterns.md` §7d), which is what this is at
both widths. Both inspectors, together, for the reason everything in these two files is
done together. The sentence should keep naming the consequence, which the current one
already does: *any cable connected to it is removed with it.*

**Fixed** by `ui/ConfirmDialog` — a `Dialog` at `max-w-md` holding one sentence, a
`ghost` **Cancel** and a `destructive` confirm, which is the one place that variant is
for ([components.md](design/components.md) §4). Two callers, converted in one commit, so
it is not an abstraction ahead of its second (Principle V).

Three decisions worth keeping:

1. **The dialog is a sibling of `InspectorFrame`, not a child.** In a hand the frame is
   a bottom sheet with an internal scroll and, uniquely, no scrim — nesting a centred
   `fixed` overlay inside that makes the stacking and the `pointer-events-none` root
   into questions that have to be re-answered every time either component moves.
2. **The open state is the id being confirmed, not a boolean.** Both rails already know
   their subject can vanish underneath them — `OutputFlowInspector`'s `orphaned` effect
   exists for exactly that — and a confirm that silently re-aims at a different row is
   the one outcome a confirm exists to prevent.
3. **Cancel is present**, though §7d removes it from the phone sheet's footer. Those do
   not conflict: a sheet's close target abandons an edit you can re-open, while here the
   two buttons *are* the question.

The other sixteen `window.confirm` call sites are untouched and this is deliberate — a
sweep across sixteen surfaces in one commit is a regression nobody can attribute, which
is the rule every wave in the convergence has followed. Each takes `ConfirmDialog` when
its own surface is next opened.

### D3 — The stage plot's remembered view is shared across every device ✅ fixed 2026-07-30

**Found:** 2026-07-30, while deciding where Slice 37's view should live. `stage_plots`
holds `zoom`, `pan_x_cm` and `pan_y_cm`, and `StagePlotTab` writes them on an 800 ms
debounce for anyone who is not read-only. They are **not user-scoped**.

So a collaborator panning their phone decides where your desk opens next, and two of your
own devices overwrite each other. It is milder than it sounds — a local override wins for
the session, so the foreign view is adopted on next *load* rather than mid-work — but it
is the same defect Slice 37 declined to introduce, and for the same reason: a view is one
person's view of one screen.

**What a fix has to cover.** Move it to `localStorage` keyed by plot, following
`useFlowView`; leave `active_view` (Top/Front/Side) where it is, because that one is a
shared plot setting and `StagePlotTab:126` already argues correctly that the phone's
*local* view choice must not change what the next person opens on a desk. Dropping the
three columns is a migration whose `down` cannot restore them, so it may be worth leaving
them unread rather than removing them.

**Fixed** by `hooks/usePlotView.ts`, which is to `StagePlotTab` what `useFlowView` is to
the two flow canvases: the view keyed by plot in `localStorage`, the debounced server
write gone. `active_view` stays on the plot, as the fix was asked to leave it.

Five decisions worth keeping:

1. **The columns stay.** `zoom`, `pan_x_cm` and `pan_y_cm` are still selected and still
   patchable; nothing reads them and nothing writes them. The migration that removed them
   could not put them back, and the reward for running it is three unread floats. The
   `StagePlot` type marks them `@deprecated` so the next reader does not re-wire them.
2. **The role gate is gone with the server write.** It existed because the value went to
   everybody; a view in `localStorage` belongs to the person holding the device, and
   withholding it from a viewer would take something from them and give it to nobody —
   `usePlaneView` had already written that sentence about the flow canvases.
3. **The parse is `parseFlowView` plus a ceiling.** The shape is identical, so the
   validation is reused rather than copied; the one difference is that this canvas has a
   maximum scale, and a stored zoom outside `[0.05, 20]` is **clamped rather than
   rejected** — a plot opened at 400× is a place you can recognise once you zoom out.
   `MIN_PLOT_ZOOM` / `MAX_PLOT_ZOOM` / `clampPlotZoom` moved to `lib/stagePlot.ts`, which
   is where the wheel handler, the toolbar's `±` and the parse can all reach them; the
   toolbar had been carrying its own copy of the two numbers since Slice 13.
4. **A pending write survives a plot switch.** One timer serves every plot, so the first
   frame of a pan on the plot just opened would have cancelled the settling write of the
   one just left. It is flushed instead, keyed by the plot it came from — as are unmount
   and `pagehide`, both of which the server version simply lost. A deleted plot goes the
   other way: `forget` drops the key *and* the write still settling for it, so a pan in
   the last 800 ms of a plot's life cannot resurrect its view.
5. **A new plot now opens at (−50, −50) cm rather than (0, 0).** The columns default to
   zero, so a plot nobody had panned used to open with the stage origin hard against the
   canvas corner. The default view insets it, which is what the old *unloaded* fallback
   already did. Besides everyone's remembered views resetting once, this is the only
   visible change.

### D4 — The event's read-only catalog browse is the last pre-redesign surface ✅ fixed 2026-07-30

**Found:** 2026-07-30, while confirming that D1's fix had not made the *Browse* path
dead code. It has not — `OverviewTab:97` branches on `ownsInventory`, so a contributor
or viewer on someone else's event still gets a read-only browse, and an ownerless
catalog was only ever a second, accidental way into it. But the surface behind that
button never went through the convergence.

`EventInventoryBrowser` is **the only remaining consumer of `ui/Table` in the
application** — every other tabular surface (eleven files) is on
`SheetTable`/`SheetHeadCell`. It renders the same content as `InventorySheet` (items,
quantity, price) one tier too high: a catalog of equipment is a work surface, which is
what the Inventories page already concluded about the identical data.

Four things, all in `components/event/EventInventoryBrowser.tsx`:

1. **The tier.** Navigation-tier `ui/Table` + `TableHead` + `Badge` on a work surface
   → `SheetTable`/`SheetHead`/`SheetHeadCell`, and `Badge` → `Pill`
   ([components.md](design/components.md) §1, and A9 in the audit for the chip).
2. **The category rail copies `Tab`'s classes** — `border-amber-500 bg-amber-500/10
   text-amber-300` hand-written on a `<button>`. `components.md` §3 states the rule
   this breaks: *a selector that means what you are looking at uses this component
   rather than copying its classes — that is the whole reason `active` exists.*
3. **It has no phone treatment.** One component serves both branches
   (`OverviewTab:160` and `:272`), so a four-column table renders inside the phone's
   bottom sheet with an `overflow-x-auto` of its own. [patterns.md](design/patterns.md)
   §7c is the answer — columns become a ranked title and subtitle in a
   `CondensedListRow` — and §7g names *inventory items* explicitly among the things
   that have a phone form.
4. **`max-h-[70vh]` is the unit tokens.md rejects by name** ([tokens.md](design/tokens.md)
   §7: `vh` is the *largest* viewport, so content can start below the fold with the
   address bar showing), and it nests a second scroll container inside the sheet's own
   `max-h-[85svh]`.

**One decision the fix has to make first:** whether this stays an overlay at all.
`components.md` §4 settled *"an overlay with fields is a `Sheet`; an overlay that is a
sentence and two buttons is a `Dialog`"* — a read-only work surface is neither, and
`Drawer`'s stated reason (*it opens over the sheet the user is cross-referencing*) fits
what someone browsing a catalog mid-event is actually doing. A read-only route under
`/inventories/{id}` is the third option and the largest.

**A note for whoever picks this up:** [audit.md](design/audit.md)'s Wave 4 table reads
*"Navigation-tier `ui/Table`s · 4 → 0"*. That count was taken across the four event
tabs; this file is an overlay opened *from* one of them, and Slice 28 extracted it out
of `EventInventoryCard` during that same wave. The zero is true of the tabs and false
of the application — which is the whole reason this went unseen for nine slices.

**Fixed.** The decision came first and it is **`ui/Drawer`**: an overlay that opens over
the surface you are cross-referencing, which is the drawer's stated reason for existing
and is exactly what consulting someone else's catalog mid-event is. The read-only route
was the alternative and it is a backend change — a non-owner cannot read an inventory by
id, which is why the event-scoped endpoints exist at all — so it buys a back button at
the price of a new authorization path. `components.md` §4 now records the drawer as the
third answer to the *`Sheet` or `Dialog`* rule, since the rule had two and this is
neither.

The four things, and one that came with them:

1. `SheetTable`/`SheetHead`/`SheetHeadCell`/`SheetRow`/`NumCell`. That left **`ui/Table`
   with no caller anywhere**, and after the user verified the surface at both reaches on
   2026-07-30 the component was **deleted** — so the audit's Wave 4 count is now true of
   the application rather than only of the four tabs, and it cannot go back up.
   `SheetTable` is the application's one table at either tier: a navigation-tier one is
   this component with the navigation tier's padding, which `SheetHeadCell` was already
   imported for. The pair in components.md §1 is a pair no longer, because the answer it
   was offering — *a table of records might be a navigation surface* — is the one five
   waves of conversions kept finding wrong.
2. The hand-written `Tab` classes are `ui/PanelRail` — the same rail the *owner's* view
   of these same rows filters with, one page over, plus its `All items` row. Not a `Tab`:
   the tier pairs were never the whole of the mistake, and a category filter is a filter
   rail (patterns.md §4), not a selector of what you are looking at.
3. The phone is the columns ranked into `CondensedListRow`s with the rail as a
   `MobilePicker` — and it arrives *through the drawer*, which is a bottom sheet below
   768 px. That is the second reason the overlay decision came first: as a `Dialog` this
   surface had no phone form available to it at all.
4. `max-h-[70vh]` is gone with nothing in its place. The drawer's body owns the only
   scroll at both reaches; the horizontal one is gone from the phone branch entirely,
   because a four-column table is not what the phone renders any more.
5. **`useEscapeToClose` closes the topmost overlay, and only it.** Every open caller
   listened on `window` independently, so one `Escape` closed all of them — which costs
   nothing while overlays never nest and is wrong the moment one does, and this fix
   nests a picker's sheet inside the drawer's. `stopPropagation` cannot arbitrate it
   (both listeners are on the same target); a stack can, and the last entry is by
   construction the overlay on top. Reachable on a desk, too — `useIsMobile` is a width,
   so a narrow browser window gets the phone branch and a real `Escape` key.

`ui/Drawer` gained `flush`, the prop `ui/Sheet` already had, forwarded. A body that is
one construction rather than a stack of `DrawerSection`s wants neither the 20 px inset
nor the 20 px gap: the rail has to be bordered on the edge it shares with the sheet, and
the phone's rows have to be full-bleed with a hairline between them.

Review found three more, all of them the same kind — a thing the code did that no
document said:

- **A drawer renders nothing until it is open**, so both queries are cold at the moment
  this mounts, and *Nothing in this catalog yet* was the first thing anyone browsing a
  full catalog was told, for a round trip, at both reaches. The old table had no empty
  state at all, so this was new. It is guarded now, as the same sentence on the
  Inventories page already was.
- **The phone subtitle is this sheet's own columns ranked**, which is why it says
  *description* where the owner's phone list of the same rows says *category*: that
  sheet has a Category column and this one has none, because the rail beside it is the
  category. One rule, two answers — and a missing description drops out rather than
  falling back to a column this sheet does not show.
- **`MobilePicker` acquired a third placement** and it is written down
  ([components.md](design/components.md) §5): a picker at the head of a `flush` sheet,
  where the header names the *thing* and the picker names *which part of it you are
  looking at*. Both existing cases were deciding that question all along; neither said
  so, which is why this looked like a new one.


### D5 — A drawer's info note is remembered under its title ✅ 2026-07-31

**Found:** 2026-07-30, while moving `InventoryDrawer`'s two `footer` paragraphs to
`info` — the components.md §4 rule that Slice 31 had already been told once. The
move is done and committed separately; this is what the move walked into.

**The cause.** `ui/Drawer.tsx:62` keys the note by the drawer's own title:

```ts
const note = useInfoNote({ id: `drawer:${title}` })
```

`useInfoNote` turns that into the `localStorage` key `pp-info:drawer:<title>`, so
**the title is the note's identity**. That was safe when it was written: every
drawer's title was a constant — *Rig*, *Buses*, *Universes*, *Categories*,
*Import*, *Event details*. Two things have since made it untrue, and they are
different faults sharing one line.

**1. Two drawers are both called *Pricing*, and share one remembered choice.**
`event/PricingDrawer.tsx:119` (what a hire costs) and the `CatalogPricingDrawer`
at `inventory/InventoryDrawers.tsx:402` (what a supplier charges for a longer
hire) both pass `title="Pricing"` and both pass `info` — two different
explanations under one key. Reproduction: open an event's Pricing drawer, open
the `i`, close the drawer; go to Inventories → a catalog's Pricing drawer; its
`i` is already open, showing the other sentence. It reads as the interface
volunteering an explanation you never asked for, and dismissing either one
dismisses both. This is live today.

**2. A title that is data gives every row its own note.** `InventoryDrawer.tsx:111`
is `title={inventory ? inventory.name : 'New catalog'}`, and `OverviewTab.tsx:114`
is `title={inventoryQuery.data?.name ?? 'Inventory'}` — the first drawers whose
title is a record rather than a word. Each catalog therefore carries a private
copy of one shared sentence: opening the `i` on *Backline* leaves it closed on
*PA*, renaming a catalog silently orphans its key and resets the note, and the
key space grows one entry per catalog name ever opened, forever. Milder than the
collision — the note defaults closed, so nothing nags — but it is the same line,
and it is why the collision is not a coincidence that can be renamed away.
(`EventFormDrawer.tsx:130` also takes its title as a prop and now passes `info`,
but all three of its call sites pass the constant *Create event*, so it is a
latent case rather than a live one — worth not mistaking for a third fault.)

**What a fix has to cover.** Both halves, from the one line — a per-drawer note
identity that is neither the title nor the record in it. `Drawer` currently takes
no such prop, so this is an API addition, not a rewiring: the eight call sites
that pass `info` name their note, and `title` goes back to being a label.

**The decision it has to make first:** whether the identity is an explicit
`noteId` prop (required when `info` is passed, so a new drawer cannot forget it
and silently collide) or derived from something structural the call site already
has. Explicit is the obvious answer and the one that catches the *Pricing* case
at the type level; it is written here because it is the choice, not because it is
made. Second, and smaller: the `pp-info:drawer:*` keys already in this
developer's browser become orphans under any new scheme. Leaving them is a note
that quietly re-opens once, at whatever it was last set to; there is no user data
in them and no migration path from a `localStorage` key, so *leave them* is
probably right and should be said out loud rather than discovered.

**This is a slice, not a `dN-` branch.** The fix documents a new `Drawer` prop, and
`design/components.md` §4 is where `Drawer`'s props are stated — so it edits
`design/`, which is the standing trigger for the full spec → plan → tasks and for
design approval (see the note at the head of this section, and *Defects* in
`CLAUDE.md`).

**The mockup is waived** (2026-07-30 user decision, asked and answered before the
work starts, which is the only place it can be). Nothing on screen moves: no
value, tier, spacing or component changes, and the `i` and its panel are drawn
exactly as `ui/InfoNote` already draws them. What §4 gains is a prop in a table —
a sentence about identity, not about appearance — so there is no visual claim for
a mockup to put in front of anyone. The waiver is this narrow: the spec → plan →
tasks still runs, because the trigger for *those* is the `design/` edit itself and
that edit is still happening. D4 remains the precedent for what skipping the whole
apparatus costs, and this is not that — the design step is being *answered* here,
not stepped around.

**Fixed** by `noteId`, a `Drawer` prop the call site gives its note, in
`specs/d5-drawer-note-identity/`. Both halves come off the one line: the title is
no longer read for identity anywhere in the component, so *Pricing* and *Pricing*
are `event-pricing` and `catalog-pricing`, and a catalog's manage drawer is
`catalog-manage` whatever the catalog is called or is renamed to.

The decisions worth keeping:

1. **Explicit, and required by the type.** `DrawerProps` is now the base props
   intersected with `{ info, noteId } | { info?: undefined, noteId?: undefined }`,
   so `info` without a name does not compile and a name with nothing to put away
   does not either. The alternatives — a component name, a route, `useId()` —
   were rejected on one shared ground: they are stable only until a file is
   renamed or moved, and none of them is *visible at the call site*, which is the
   property the fault actually turned on. The *Pricing* collision was unreadable
   in both files; under a derived scheme it would have stayed unreadable. Making
   it a type is what turns a convention into a gate, since `tsc -b` is one.
2. **The old keys are left where they are.** `pp-info:drawer:<Title>` entries in
   browsers now match nothing. Each holds the string `open` or `closed`; there is
   no user data and no migration path from a `localStorage` key that the server
   cannot enumerate. The whole cost of skipping it: a note someone had left
   **open** is closed again, once, and has to be opened by hand. **The brief above
   had this backwards** — it said the note "quietly re-opens once, at whatever it
   was last set to", but `Drawer` passes no `defaultOpen`, so `useInfoNote`
   defaults to `false` and a missing key reads as *closed*, never as open. Nothing
   re-opens; a preference to *see* the sentence is what is lost. Still cheaper
   than the table of old titles that avoiding it would ship to every client, and
   the decision does not change — but the cost is the opposite one.
3. **The `drawer:` prefix stays inside the component**, so the key is
   `pp-info:drawer:<noteId>` and drawer notes remain one namespace beside the
   panel notes that name themselves (`flow-desk-job`, `plot-desk-job`). No new
   name collides with an orphan a *constant* title left — those are capitalised
   and the new names are kebab-case. Orphans left by a **catalog's name** carry no
   such guarantee, because that name is free text: a catalog someone called
   `buses` wrote the exact key `BusesDrawer` now uses. The cost is one stale
   open-or-closed in one browser, which is the same cost as any other orphan, so
   this is a footnote to the decision rather than a hole in it.

`design/components.md` §4 states the rule where `Drawer`'s props are stated, after
the footer/`info` rule — a note is remembered under `noteId`, never under the
title, because a title is a label: chosen for the header, repeated freely, and
since Slice 32 sometimes a record. `EventFormDrawer`'s latent case is closed with
the rest (`event-form`); the three drawers that pass no `info` — Rig, Event
details, `OverviewTab`'s read-only browse — pass no `noteId` and were not touched.

Two `@ts-expect-error` cases in `ui/Drawer.test.tsx` pin both directions of the
rule at compile time, and a third case pins the rendered result: one `i`, and a
panel that is closed, which is what an unremembered note is. That is the whole
suite, because these tests render with no `window` — the remembering itself is
unreachable from them. **The two acceptance walks were left
for a browser** — the fix is a literal string per call site, and `tsc` plus a grep
for `noteId=` prove the eight are present and distinct, but nothing here observed
`localStorage` doing it.

**A follow-on, reported from use the same day: `EventDetailsDrawer`'s footer was
an `info` too** (`noteId="event-details"`) — *"Renaming an event never changes its
patch, its rig or its rental order"*, a reassurance read once. It survived this
slice, and the review, because **§4's rule led with the wrong test**: it opened
*"`footer` is a line; anything longer is `info`"* while its own body said the test
is whether it is worth re-reading. One line and read-once are not the same
property, and the headline is what gets read. §4 now leads with re-readability and
names this case; `audit.md` M-drawer records the old wording as superseded.
**Rig's footer stays a footer** (user decision, 2026-07-31): it states what the
contents are and carries a count that changes while you work, which is the thing
a footer is for. It is the application's last prose footer.

### D6 — Fifteen deletes were still the browser's own dialog ✅ fixed 2026-08-05

**Found:** 2026-07-31, while writing Slice 39, and **approved for recording the same
day.** D2 converted the two flow inspectors and deliberately left the rest, with a
policy: *"Each takes `ConfirmDialog` when its own surface is next opened."* The policy
does not converge. Nothing schedules these eight surfaces — the two open slices in
**What remains** open none of them — so *next opened* means *not scheduled*, and the
browser's dialog stays the confirm most of the application actually uses.

**The count in this table was wrong, and was corrected on 2026-08-05 to fifteen** — on
the user's call, since amending a defect's brief is theirs to make. Slice 39 found the
undercount while delivering and deliberately left it (see that slice's section). The
eight below are the ones this brief originally named; the seven it omitted are listed
after the table. Verified live calls only (`InventoryDrawer.tsx:21` and
`ConfirmDialog.tsx:19` name it in prose and are not calls):

| File | Line | What it confirms |
|---|---|---|
| `event/StagePlotInspector.tsx` | 181 | delete a layer *and every element on it* |
| `event/ConsoleSection.tsx` | 228 | delete a console; patched local jacks are cleared |
| `event/StageboxSection.tsx` | 197 | delete a stagebox; every cable patched to it goes |
| `event/OutputSheet.tsx` | 223 | delete an output; the cable leaving it goes |
| `event/ProcessingDeviceSection.tsx` | 71 | delete a device; connected cables go |
| `inventory/InventorySheet.tsx` | 151 | delete an item from a catalog |
| `inventory/InventoryDrawers.tsx` | 174 | delete a category |
| `OwnedGearManager.tsx` | 161 | delete owned gear, *naming how many events plan it* |

**The seven this table omitted**, all deletes except the last, which is a bulk move:
`StagePlotTab.tsx:610` (a whole plot and everything on it), `LightingSheet.tsx:344`,
`InputSheet.tsx:229`, `InputDeviceSection.tsx:60`, `TrueOutputDeviceSection.tsx:70`,
`StageMultiSection.tsx:191` and `LightingTab.tsx:96`.

D2's own count of *"the other sixteen"* was overstated; no commit since has removed one
(`git log -S` finds only `a41bf38`, D2's own). Sixteen remained in total — these fifteen
plus the truss delete, which Slice 39 owned because it was rebuilding that surface anyway.

**What a fix has to cover.** `ui/ConfirmDialog` at each site, keeping the sentence:
every one of them already names the subject and then the consequence, which is the
component's stated contract, and `OwnedGearManager` computes its sentence from a count
(*"is planned on 3 events"*) — that must survive, so the pending state carries the row,
not a flag. This is a substitution, not a redesign: no `design/` file changes, no rule
is added, and `ConfirmDialog` needs no new props.

**Three decisions, and the first surface converted settles all three.**

1. **Per-site `useState`, or a shared hook.** Two callers today, ten after. Principle V
   forbids abstraction ahead of need, not at ten. But a promise-returning `useConfirm`
   re-creates `window.confirm`'s own shape, and it would have to preserve D2's decision
   2 — *the open state is the id being confirmed, not a boolean*, because a confirm that
   silently re-aims at another row is the one outcome a confirm prevents. Six of these
   eight fire from inside a `.map()`. Prefer the per-site state that decision implies,
   and reach for the hook only if six copies of it turn out identical.
2. **Where it mounts.** D2 decision 1 made the dialog a *sibling* of `InspectorFrame`,
   not a child. That matters more here: `Dialog`, `Drawer` and `Sheet` are all `z-50`
   (`Dialog.tsx:33`, `Drawer.tsx:112`, `Sheet.tsx:75`), so among siblings **DOM order
   decides**, and several of these confirms are raised from inside a drawer, a sheet or
   an open `RowEditor`. A confirm that renders under the surface that raised it is the
   failure mode to check for at each site, on a phone especially.
3. **One commit per surface, on one branch.** D2's reason for deferring was that a
   sweep in one commit is a regression nobody can attribute; that reason is still good,
   and scheduling the work does not repeal it.

**It touches eight files, which brushes the rule that makes a defect a slice** — it
edits no `design/` and needs no migration, so it stays a defect on that test, and the
substitution is mechanical. If the first two surfaces show it is not mechanical — if
the state shape genuinely differs per site rather than differing in the row it carries
— stop and convert it to a slice rather than improvising across the remaining six.

**Fixed** on branch `d6-confirm-dialogs`, one commit per surface, planned under OpenSpec
as change `d6-confirm-dialogs` — the first piece of work either workflow has carried
since both were installed. `grep -rn "window.confirm" frontend/src` now returns four
matches and **zero live calls**; all four are prose. `design/` is untouched, as predicted,
and `ConfirmDialog` gained no props.

The three decisions, as settled:

1. **Per-site `useState` holding the record, and no hook.** Constitution Principle V
   names this case directly — *dialog open/close state MUST use React's built-in state* —
   and a promise-returning `useConfirm` would re-create `window.confirm`'s own call
   shape, which is the thing being removed. **The trip-wire fired once and the answer was
   still not a hook.** `InputDeviceSection`, `ProcessingDeviceSection` and
   `TrueOutputDeviceSection` passed one byte-identical sentence each into the same shared
   `DeviceSection`, extracted by Slice 24. The confirm went *there*, once, and `onDelete`
   became the callback fired after confirmation. So the rule is sharper than "per site":
   **the confirm belongs to whatever component owns the list.** Fifteen call sites,
   thirteen files.
2. **Mount after the surface — and outside any ancestor that redefines `fixed`.** The
   second half was not in the brief and is the thing worth keeping. `Dialog` does **not**
   portal (`Dialog.tsx:32-49`); it renders `fixed inset-0 z-50` where it is written, so
   DOM order really is the mechanism. But `position: fixed` resolves against the viewport
   only while no ancestor creates a containing block, and `transform`, `filter`,
   `perspective`, `will-change` and **`backdrop-filter`** all create one. One site tripped
   it: in the fullscreen plot editor `StagePlotLayersPanel` renders inside a
   `backdrop-blur-sm` box (`StagePlotTab.tsx:873`), so a confirm written correctly *after*
   the panel was still positioned and clipped against that box. It moved up to
   `StagePlotTab`, outside the fullscreen shell, and the panel now raises the delete
   rather than confirming it. Audited across the codebase: the only other `backdrop-filter`
   users are `Layout.tsx`'s two headers, and the only `filter` is on the `.pp-pulse-dot`
   SVG leaf. No other site is affected.
3. **One commit per surface.** Kept. Eight commits, each bisectable to its own surface.

**Two things found on the way, both worth more than the substitution.**

- **A confirm that does not block can re-aim, and one did.** `deletePlotMutation` read
  `activePlotId` inside its own `mutationFn` — safe only because `window.confirm` froze
  the thread, so nothing could change the active plot under it. A dialog does not freeze
  anything and the plot tabs are one click away, so confirming could have deleted a plot
  other than the one the sentence named. The mutation now takes the doomed id and the
  confirm carries it. **Every conversion of a blocking primitive to a non-blocking one
  should be read for this**; it is not specific to plots.
- **The counted sentences recompute rather than capture.** `StageboxSection`,
  `StageMultiSection` and `OwnedGearManager` hold the row, not the number, so the count
  is derived while the confirm is open. A number captured at click time can be read after
  the truth has moved.

**`LightingTab` needed a fourth argument, not an escalation.** Its record is
`{ plan, verb, confirmLabel }` — larger than a row, but still the subject the sentence is
about, so the escape hatch was not taken. Holding the *plan* matters: the fixture list can
change while the confirm is open, and a plan re-derived on confirm would move a different
set than the sentence counted. `run` gained a `confirmLabel` because `ConfirmDialog` needs
a button word and `window.confirm` only ever had *OK*; the sentence verb *"Close the gaps
around"* does not stand up as one.

**The browser walk was run by hand and passed.** The z-order and re-aim checks are the
two verifications that cannot show in tests — `renderToStaticMarkup` has no DOM and paints
nothing — so they were walked manually across the fullscreen plot editor, the four
`RowEditor`-in-a-`<tr>` sites and the drawer-nested sections, on a phone too. Every confirm
renders above the surface that raised it. Worth noting which way round it went: the one
fault the walk existed to catch was found by *reading the CSS* first, and the walk
confirmed nothing else had been missed.

**The two `window.alert` calls** in `LightingTab.tsx:90,100` were out of scope here — an
alert is a notification, not a question, and replacing one needed a decision this defect
had no mandate for. Reported rather than recorded, and then **handled directly on the
user's instruction the same day**, which is why no defect was ever opened for them. The
application now has zero live `window.alert`, `window.confirm` and `window.prompt` calls.

Neither needed the notification pattern `design/` lacks. *"There are no gaps to close"*
became the button stating its own applicability in `UniversesDrawer` — asked before the
press instead of apologised for after it, and not a P7 case, since P7 is about a
restricted *role* losing a control outright while this is reversible state that `busy`
already disables the same two buttons for. *"Done. Universe 2 was left untouched"* was
deleted: the confirm states the skipped universes **before** the act, in the sentence the
user agrees to, and what is still true afterwards is the rig's state, which
`LightingStatusRail` reports. **The open question, if it is ever wanted, is a way to say
what just happened** — `Dialog` is defined as an interruption you answer, so a one-button
dialog contradicts it, and that would need a design decision and an approved mockup.

## Dependency graph

```
Slices 0–21 ✅ done
Slice 18 (deployment) ──→ Slice 19 (CI/CD deploy to VPS)
Slice 16 (inventory ownership) ──→ Slice 22 (generic inventory formats & PDF order)
Slice 10 (output chains) ──→ Slice 11 (output signal graph, replaces it) ✅
Slice 11 (output signal graph) ──→ Slice 12 (input signal graph, same pattern reversed) ✅
Slice 11 + Slice 12 ──→ Slice 23 (audio patch shell & the console) ──→ Slice 24 (field-test fixes) ──→ Slice 25 (the mockup's visual language) ──→ Slice 26 (an inspector for the outputs flow graph)
Slice 7 (lighting rig) + Slice 12 ──→ Slice 13 (stage plots; supersedes Slice 0's truss sections) ✅
Slice 7 (lighting rig) + Slice 25 (visual language) ──→ Slice 27 (Lighting becomes a sheet; design wave 3) ──→ Slice 28 (the remaining event tabs; design wave 4) ──→ Slice 29 (pages and residue; design wave 5 — convergence complete) ──→ Slice 30 (the Events timeline, and events that have length) ──→ Slice 31 (rental pricing by duration)

Slice 16 (inventory ownership) + Slice 29 (pages and residue) + Slice 30 (the spine) ──→ Slice 32 (the inventory list — the last card list)
Slice 21 (mobile redesign) + Slice 29 (the language it converges onto) ──→ Slice 33 (the phone's bottom sheet; design wave 6a) ──→ Slice 34 (the phone's panel; design wave 6b) ──→ Slice 35 (the nine surfaces; design wave 6c) ──→ Slice 36 (the canvases; design wave 6d — convergence complete) ✅ ──→ Slice 37 (the flow canvas as a plane; found by using 6d)
Slice 14 (auth) ──→ Slice 15 (event ownership & sharing) ──→ Slice 16 (inventory ownership) ──→ Slice 17 (event settings) ──→ Slice 18 (deployment) ✅
Slice 15 (sharing, the model it exposes) + Slice 33 (ui/Sheet, and Drawer's phone branch) ──→ Slice 38 (who can see this event)
Slice 13 (stage plots, the trusses) + Slice 33 (ui/Drawer) + Slice 36 (the plot is read-only on a phone) ──→ Slice 39 (the Trusses overlay) — shares components.md's Dialog/Sheet rule with Slice 38
Slice 22 (the Go PDF writer) + Slice 11 + Slice 12 (the graphs) + Slice 37 (positions that mean something) ──→ Slice 40 (the audio exports become documents)
Slice 13 (plots, layers, trusses) + Slice 22 (the Go PDF writer) ──→ Slice 41 (the plot on paper) — shares patterns.md §8, the renderer and the font decision with Slice 40; cheaper second
```
