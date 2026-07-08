# Research: Rental Completeness — Cables & Stands from Inventory

## R1: How pickers know which catalog items are cables / stands

**Decision**: Add a nullable `picker_role TEXT` column ('cable' | 'stand') to
`inventory_categories`. A migration seeds it by exact category-name match on the
current price list ("Signalkablage", "Signalkablage digital", "Högtalarkablage" →
`cable`; "Stativ & Lyftutrustning" → `stand`). The xlsx import never writes the
column (its category UPDATE sets only name + type, and ids are stable), so
re-imports preserve roles. A small role selector on the Inventory page's category
list (backed by `PATCH /api/v1/inventory/categories/{id}`) lets the user assign a
role if the price list ever renames or adds a cable/stand category.

**Rationale**: Principle II — which categories feed the pickers is data, not
code. Category-level granularity matches how the price list is organized (whole
categories of cables/stands), and the seed keeps the feature zero-config for the
actual catalog. The edit affordance is the escape hatch that stops a renamed
category from silently emptying the pickers.

**Alternatives considered**: Hard-coding category names in queries or the
frontend (violates Principle II; breaks on rename with no recourse). A
`reference_values` vocabulary holding category names (stringly-coupled to names,
breaks on rename, and Settings is the wrong home for catalog structure).
Per-item flags (hundreds of rows to tag, no benefit over category granularity).

## R2: Where cable/stand picks live on planning rows

**Decision**: Add nullable FK columns — `cable_item_id`, `stand_item_id` on
`audio_patch_inputs`; `cable_item_id` on `audio_patch_outputs` — each
`REFERENCES inventory_items(id)`. The existing `cable_type`, `cable_length_m`,
and `mic_stand` columns stay in place as **legacy display values**: shown
read-only when the row has no pick, cleared (set NULL) whenever a pick is made,
never written for new rows. This is exactly the shipped `mic_item_id` /
`mic_model` pattern (migrations 008/009, `UpdateAudioInput`'s CASE expression).

**Rationale**: Plain `ALTER TABLE ADD COLUMN` (no table rebuild, no CHECK/FK
subtleties from slice 4), zero data loss, and one already-proven legacy
mechanism instead of a second bespoke one. Principle I: the cable run becomes a
first-class reference to a catalog item instead of a free-text pair.

**Alternatives considered**: Rebuilding the tables to drop the old columns and
adding a composed `cable_label` text column (destroys structured legacy data
that the conservative backfill in R3 deliberately leaves in place; planners may
still want to read "xlr, 7 m" before re-picking). Reusing `cable_type` to hold
an item id (type confusion, breaks legacy display).

## R3: Migration backfill — what converts automatically

**Decision**: Conservative, exact-match-only backfill in one SQL migration:

- Input cables: rows with `cable_type = 'xlr'` and a length convert to the
  catalog item when **exactly one** non-discontinued item in a `cable`-role
  category has name `Mikrofonkabel` and a description that normalizes to the
  same length (`REPLACE(description, ',', '.')` = `printf('%gm', cable_length_m)`,
  case-insensitive). Matched rows set `cable_item_id` and clear the legacy pair.
- Everything else stays legacy: other input cable types, all output cables
  (the Speakon 2×2,5 vs 4×2,5 split makes `nl4` genuinely ambiguous), and all
  stands (four different boom-stand variants make every stand vocabulary value
  ambiguous). Legacy values remain visible on the row per R2; the planner
  re-picks at their own pace.

**Rationale**: Spec FR-008 demands conservatism — a wrong automatic match
produces a wrong rental order, which is worse than a legacy label. XLR + exact
length is the one case with a unique catalog answer, and it is also the
overwhelmingly common case on real inputs. The uniqueness guard (exactly one
candidate) keeps the migration safe even if the catalog changes before upgrade.

**Alternatives considered**: Fuzzy/nearest-length matching (silently wrong
orders). No backfill at all (throws away the safe common case and makes every
old event all-legacy). Doing the backfill in Go application code (migrations
are SQL by project convention; `printf('%g'…)` handles the REAL-to-"7,5m"
normalization fine in SQLite).

## R4: Rental order & Excel export integration

**Decision**: Extend the `rentalSummaryQuery` CTE in `backend/internal/db/rental.go`
with three new `UNION ALL` arms (inputs.cable_item_id, inputs.stand_item_id,
outputs.cable_item_id), each contributing quantity 1 to the audio column. No
other backend change: pricing, over-stock flagging, discontinued flagging,
manual-line merging, and the Excel writer all operate on the summary lines and
pick the new items up for free (cables/stands have `xlsx_row` like any item).

**Rationale**: The CTE was built for exactly this (its comment says every
planning surface contributes one arm). Principle IV holds with no writer
changes — SC-002's round-trip guarantee is untouched.

**Alternatives considered**: A separate cables/stands section on the rental
response (breaks the one-line-per-item contract and the export placement).

## R5: API and frontend picker shape

**Decision**: `GET /api/v1/inventory/items` gains a `role` query parameter
(joins on `c.picker_role`). The frontend adds two cached queries
(`['inventory-items', 'role', 'cable'|'stand']`) and renders pickers whose
option text is `name — description` (description is what distinguishes the
fifteen "Mikrofonkabel" rows; FR-004). The pickers replace the cable-type
select + length input and the stand select on input rows, and the cable
type/length fields on output rows. Legacy rows render their old values as
read-only text next to the (empty) picker until a pick is made — the existing
mic-cell pattern. Sheets, signal flow, and the rental table show
`name — description` via a shared `itemLabelById` map (name + description).

**Rationale**: One query param on an existing endpoint (no new endpoint —
Principle II's "new categories addable by data" spirit); the option-label rule
is forced by the catalog's duplicate names; reusing the mic-cell legacy UX
keeps the inputs table consistent.

**Alternatives considered**: Frontend fetching categories and filtering
client-side (leaks the role logic to every caller); a dedicated
`/cables` endpoint (YAGNI); parsing lengths out of descriptions for a fancier
picker (Principle V — display, don't interpret; the spec's assumption says the
same).

## R6: Testing approach

**Decision**: Go `httptest`: rental summary counts cables/stands (multiple
rows sharing an item, mixed with manual lines and over-stock), `?role=` filter,
category role PATCH (including rejection of unknown roles), and audio patch
CRUD round-tripping the new fields incl. the clear-legacy-on-pick behavior.
The backfill migration is exercised by the existing migration-on-fresh-DB test
path plus one focused test that seeds legacy-shaped rows through raw SQL in a
temp DB, re-runs the conversion statement, and asserts matched/unmatched
outcomes. Vitest: update `printSheets.test.tsx` and `signalFlow.test.ts` for
the new label rules (picked item vs legacy text). Manual quickstart pass for
the picker UX and a dev-DB-copy upgrade check (never the live dev DB).

**Rationale**: Matches the roadmap's pragmatic tier — httptest where logic
lives, Vitest for display rules, eyeballs for UX.
