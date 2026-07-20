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

## Dependency graph

```
Slices 0–18 ✅ done
Slice 10 (output chains) ──→ Slice 11 (output signal graph, replaces it) ✅
Slice 11 (output signal graph) ──→ Slice 12 (input signal graph, same pattern reversed) ✅
Slice 7 (lighting rig) + Slice 12 ──→ Slice 13 (stage plots; supersedes Slice 0's truss sections) ✅
Slice 14 (auth) ──→ Slice 15 (event ownership & sharing) ──→ Slice 16 (inventory ownership) ──→ Slice 17 (event settings) ──→ Slice 18 (deployment) ✅
```
