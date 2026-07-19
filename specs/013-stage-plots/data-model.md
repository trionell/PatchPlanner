# Data Model: Stage Plots (013)

All lengths/positions in **centimetres** (REAL). Booleans are INTEGER
0/1 (SQLite convention used project-wide). New tables created by
migration `032_stage_plots`; legacy `truss_sections` dropped by
`033_drop_truss_sections` after the one-time Go conversion (research.md
R5).

## stage_plots

One drawing per row; an event has many (FR-001).

| Column              | Type    | Notes                                          |
|---------------------|---------|------------------------------------------------|
| id                  | INTEGER | PK                                             |
| event_id            | INTEGER | NOT NULL, FK events(id) ON DELETE CASCADE      |
| name                | TEXT    | NOT NULL                                       |
| sort_order          | INTEGER | NOT NULL DEFAULT 0 (tab order)                 |
| grid_visible        | INTEGER | NOT NULL DEFAULT 1                             |
| grid_size_cm        | REAL    | NOT NULL DEFAULT 25, must be > 0               |
| snap_grid           | INTEGER | NOT NULL DEFAULT 1                             |
| snap_objects        | INTEGER | NOT NULL DEFAULT 1                             |
| show_fixture_name   | INTEGER | NOT NULL DEFAULT 1 (FR-029)                    |
| show_fixture_fid    | INTEGER | NOT NULL DEFAULT 0                             |
| show_fixture_dmx    | INTEGER | NOT NULL DEFAULT 0                             |
| active_view         | TEXT    | NOT NULL DEFAULT 'top' ∈ top/front/side        |
| zoom                | REAL    | NOT NULL DEFAULT 1 (last-used view state)      |
| pan_x_cm            | REAL    | NOT NULL DEFAULT 0                             |
| pan_y_cm            | REAL    | NOT NULL DEFAULT 0                             |

Creating a plot always creates one default layer ("Layer 1") in the same
transaction (FR-016's "at least one layer" invariant; deletion of the
last layer is rejected with 409).

## stage_plot_layers

| Column     | Type    | Notes                                             |
|------------|---------|---------------------------------------------------|
| id         | INTEGER | PK                                                |
| plot_id    | INTEGER | NOT NULL, FK stage_plots(id) ON DELETE CASCADE    |
| name       | TEXT    | NOT NULL                                          |
| sort_order | INTEGER | NOT NULL DEFAULT 0 (z-order, low = back)          |
| color      | TEXT    | nullable hex (tints elements; audio/light/neutral)|
| visible    | INTEGER | NOT NULL DEFAULT 1 (hidden ⇒ unselectable)        |
| locked     | INTEGER | NOT NULL DEFAULT 0 (locked ⇒ uneditable)          |

Deleting a layer deletes its elements (confirmed in UI, FR-016);
`ON DELETE CASCADE` from elements' layer FK handles it.

## stage_plot_elements

Everything placed on a plot. `kind` is a Go-validated enum
(`shape` / `resource` / `truss` / `fixture`) following the
`from_kind`/`hop_kind` precedent.

| Column       | Type    | Notes                                                       |
|--------------|---------|-------------------------------------------------------------|
| id           | INTEGER | PK                                                          |
| plot_id      | INTEGER | NOT NULL, FK stage_plots(id) ON DELETE CASCADE              |
| layer_id     | INTEGER | NOT NULL, FK stage_plot_layers(id) ON DELETE CASCADE        |
| kind         | TEXT    | NOT NULL CHECK IN ('shape','resource','truss','fixture')    |
| shape_kind   | TEXT    | kind='shape' only: CHECK IN ('rect','ellipse','line','text')|
| icon         | TEXT    | kind='resource' only: icon registry id (research.md R9)     |
| truss_id     | INTEGER | kind='truss' only: FK stage_plot_trusses(id) ON DELETE CASCADE |
| fixture_id   | INTEGER | kind='fixture' only (free-standing fixture): FK lighting_fixtures(id) ON DELETE CASCADE |
| name         | TEXT    | NOT NULL DEFAULT '' (display name on plot / text content of a text shape) |
| x_cm         | REAL    | NOT NULL — stage-left→right                                 |
| y_cm         | REAL    | NOT NULL — upstage→downstage (depth)                        |
| z_cm         | REAL    | NOT NULL DEFAULT 0 — height above floor (front/side views)  |
| width_cm     | REAL    | NOT NULL, > 0 (line: its length; text: box width)           |
| depth_cm     | REAL    | NOT NULL DEFAULT 0, ≥ 0                                     |
| height_cm    | REAL    | NOT NULL DEFAULT 0, ≥ 0 (front/side extent)                 |
| rotation_deg | REAL    | NOT NULL DEFAULT 0 (about vertical axis; plan view)         |
| notes        | TEXT    | nullable                                                    |

Validation (API layer): exactly the kind-matching optional column set;
`width_cm > 0`, others ≥ 0 with a sane minimum (edge case). A truss
element's drawn length is **derived** (sum of pieces) — `width_cm` is
ignored for kind='truss'; `depth_cm` holds the truss's physical depth
(default 30). Placing the same `truss_id` twice **on one plot** is
rejected (one placement per plot; multiple plots fine, R4).

## stage_plot_trusses (event-scoped — research.md R4)

| Column    | Type    | Notes                                        |
|-----------|---------|----------------------------------------------|
| id        | INTEGER | PK                                           |
| event_id  | INTEGER | NOT NULL, FK events(id) ON DELETE CASCADE    |
| name      | TEXT    | NOT NULL (e.g. "Front truss")                |
| height_cm | REAL    | NOT NULL DEFAULT 0 — hang height (FR-025)    |

Deleting a truss cascades its pieces, fixture attachments, and (via
`stage_plot_elements.truss_id` cascade) every placement; rig fixtures
themselves are untouched (US5-AC4).

## stage_plot_truss_pieces

| Column            | Type    | Notes                                                  |
|-------------------|---------|--------------------------------------------------------|
| id                | INTEGER | PK                                                     |
| truss_id          | INTEGER | NOT NULL, FK stage_plot_trusses(id) ON DELETE CASCADE  |
| inventory_item_id | INTEGER | nullable FK inventory_items(id) — NULL = legacy piece  |
| label             | TEXT    | NOT NULL DEFAULT '' (legacy display text, R5)          |
| length_cm         | REAL    | NOT NULL, > 0 (copy-on-pick from name parse, R3)       |
| sort_order        | INTEGER | NOT NULL DEFAULT 0                                     |

Truss length = `SUM(length_cm)` over its pieces (FR-023). The rental arm
counts rows with non-NULL `inventory_item_id` (research.md R10).

## stage_plot_truss_fixtures (event-scoped attachment — FR-024/FR-030)

| Column     | Type    | Notes                                                  |
|------------|---------|--------------------------------------------------------|
| id         | INTEGER | PK                                                     |
| truss_id   | INTEGER | NOT NULL, FK stage_plot_trusses(id) ON DELETE CASCADE  |
| fixture_id | INTEGER | NOT NULL UNIQUE, FK lighting_fixtures(id) ON DELETE CASCADE |
| offset_cm  | REAL    | nullable — position along truss from its left end; NULL = unpositioned (legacy conversion) |

UNIQUE(fixture_id): a fixture hangs on at most one truss. An
`offset_cm` beyond the truss's current length is clamped at render time
and flagged (edge case). The Lighting tab's read-only truss display is
the join `lighting_fixtures ← stage_plot_truss_fixtures →
stage_plot_trusses` (name + offset when non-NULL).

## stage_plot_element_links (assignments + stacks — research.md R6)

| Column      | Type    | Notes                                                    |
|-------------|---------|----------------------------------------------------------|
| id          | INTEGER | PK                                                       |
| element_id  | INTEGER | NOT NULL, FK stage_plot_elements(id) ON DELETE CASCADE   |
| role        | TEXT    | NOT NULL CHECK IN ('assignment','stack')                 |
| entity_kind | TEXT    | NOT NULL, Go-validated ∈ input_source, input_channel, output_device, input_device, stagebox, stage_multi, lighting_fixture |
| entity_id   | INTEGER | NOT NULL (no SQL FK — polymorphic; see cleanup below)    |
| sort_order  | INTEGER | NOT NULL DEFAULT 0 (stack ordering)                      |

UNIQUE(element_id, role, entity_kind, entity_id). **Cleanup contract**:
every referenced entity's delete path gains
`DELETE FROM stage_plot_element_links WHERE entity_kind = ? AND entity_id = ?`
(Slice 0 discipline), and the aggregate plot GET resolves links per kind
via JOIN, dropping (and opportunistically deleting) rows whose target is
gone — FR-014 / SC-007 hold even if a future delete path forgets.

## Changed tables

- **lighting_fixtures**: `truss_section_id` column removed (033 table
  rebuild — the 018-era rebuild recipe). API/UI stop accepting truss
  assignment; fixture responses gain read-only `truss_name` +
  `truss_offset_cm` from the join above.
- **truss_sections**: dropped by 033 after the Go conversion (R5).
- **inventory_categories**: migration 032 seeds
  `picker_role = 'truss'` on the truss category (name "Tross"), the
  Slice 6 pattern; editable per category on the Inventory page as today.

## Entity → spec mapping

| Spec entity        | Implementation                                        |
|--------------------|-------------------------------------------------------|
| Stage Plot         | `stage_plots`                                         |
| Layer              | `stage_plot_layers`                                   |
| Plot Element       | `stage_plot_elements` (shared spatial core)           |
| Shape              | elements with kind='shape' + `shape_kind`             |
| Resource           | elements with kind='resource' + `icon`                |
| Stack Entry        | `stage_plot_element_links` role='stack'               |
| Assignment         | `stage_plot_element_links` role='assignment'          |
| Truss              | `stage_plot_trusses` + placement elements kind='truss'|
| Truss Piece        | `stage_plot_truss_pieces`                             |
| Fixture Placement  | `stage_plot_truss_fixtures` (on truss) / elements kind='fixture' (free-standing) |
| Icon               | `lib/stagePlotIcons.tsx` registry (code, not data — R9) |
