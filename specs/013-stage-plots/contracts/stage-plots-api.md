# API Contract: Stage Plots (013)

All routes under `/api/v1`, JSON, following the existing per-event
scoping convention. New handler `api/stage_plots.go`
(`StagePlotsHandler{DB}.Register(r)` added to `router.go`). Standard
error shape and status codes match the existing handlers (400
validation, 404 unknown ids, 409 domain conflicts).

## Plots

| Method & path | Purpose |
|---|---|
| `GET /events/{eventID}/stage-plots` | List plots: `[{id, name, sort_order}]` |
| `POST /events/{eventID}/stage-plots` | Create `{name}` → plot + its default layer (one transaction) |
| `GET /events/{eventID}/stage-plots/{plotID}` | **Aggregate read** (below) |
| `PATCH /events/{eventID}/stage-plots/{plotID}` | Any subset of: `name`, `sort_order`, `grid_visible`, `grid_size_cm` (>0), `snap_grid`, `snap_objects`, `show_fixture_name`, `show_fixture_fid`, `show_fixture_dmx`, `active_view`, `zoom`, `pan_x_cm`, `pan_y_cm` |
| `DELETE /events/{eventID}/stage-plots/{plotID}` | Cascades layers/elements; trusses (event-scoped) survive |

### Aggregate read response

```jsonc
{
  "plot": { /* all stage_plots columns */ },
  "layers": [ { "id", "name", "sort_order", "color", "visible", "locked" } ],
  "elements": [ {
    "id", "layer_id", "kind", "shape_kind", "icon", "truss_id", "fixture_id",
    "name", "x_cm", "y_cm", "z_cm", "width_cm", "depth_cm", "height_cm",
    "rotation_deg", "notes",
    "links": [ { "id", "role", "entity_kind", "entity_id", "sort_order",
                 "display_name" } ]   // resolved; dangling targets dropped
  } ],
  "trusses": [ {                       // ALL event trusses (placed or not)
    "id", "name", "height_cm", "total_length_cm",
    "pieces": [ { "id", "inventory_item_id", "item_name", "label",
                  "length_cm", "sort_order" } ],
    "fixtures": [ { "id", "fixture_id", "offset_cm",
                    "fixture_number", "fixture_name",
                    "dmx_universe", "dmx_start_address" } ]
  } ]
}
```

`display_name` resolution per `entity_kind` uses each entity's existing
name/label fields; fixture links expose FID/DMX so the canvas can compose
labels (research.md R11) without extra requests.

## Layers

| Method & path | Purpose |
|---|---|
| `POST /events/{eventID}/stage-plots/{plotID}/layers` | Create `{name, color?}`; appended to sort order |
| `PATCH .../layers/{layerID}` | Any subset: `name`, `sort_order`, `color`, `visible`, `locked` |
| `DELETE .../layers/{layerID}` | Deletes layer **and its elements**; `409` if it is the plot's last layer |

## Elements

| Method & path | Purpose |
|---|---|
| `POST /events/{eventID}/stage-plots/{plotID}/elements` | Create; body carries `kind` + the kind-appropriate fields (validated: exactly one of `shape_kind` / `icon` / `truss_id` / `fixture_id` per kind; `width_cm > 0` except kind='truss' where length is derived; one placement per `truss_id` per plot → `409`) |
| `PATCH .../elements/{elementID}` | Any subset of spatial fields, `name`, `icon`, `layer_id`, `notes` — the drag-end / inspector write |
| `DELETE .../elements/{elementID}` | Removes the element (+links via cascade); never touches planned data |

## Element links (assignments & stack entries)

| Method & path | Purpose |
|---|---|
| `POST .../elements/{elementID}/links` | `{role, entity_kind, entity_id, sort_order?}` — validates kind enum + target existence (404), duplicate → `409` |
| `PATCH .../elements/{elementID}/links/{linkID}` | `{sort_order}` (stack reorder) |
| `DELETE .../elements/{elementID}/links/{linkID}` | Remove one link |

## Trusses (event-scoped)

| Method & path | Purpose |
|---|---|
| `GET /events/{eventID}/plot-trusses` | List with pieces + fixtures (same shape as aggregate's `trusses`) |
| `POST /events/{eventID}/plot-trusses` | Create `{name, height_cm?}` |
| `PATCH /events/{eventID}/plot-trusses/{trussID}` | `{name?, height_cm?}` |
| `DELETE /events/{eventID}/plot-trusses/{trussID}` | Cascades pieces, attachments, placements; rig fixtures untouched |
| `POST .../plot-trusses/{trussID}/pieces` | `{inventory_item_id?, label?, length_cm}` (`length_cm > 0`) |
| `PATCH .../pieces/{pieceID}` | `{inventory_item_id?, label?, length_cm?, sort_order?}` |
| `DELETE .../pieces/{pieceID}` | Remove piece (truss shortens; out-of-range fixture offsets clamp at render) |
| `PUT .../plot-trusses/{trussID}/fixtures/{fixtureID}` | Attach / move: `{offset_cm}`; re-attaching from another truss moves it (UNIQUE fixture_id upsert) |
| `DELETE .../plot-trusses/{trussID}/fixtures/{fixtureID}` | Detach (fixture stays in rig) |

## Changed existing surfaces

- **Lighting fixtures** (`GET` responses in `api/lighting.go`): replace
  the `truss_section_id`/section-name fields with read-only
  `truss_name` (string, empty when unattached) and `truss_offset_cm`
  (nullable) derived from `stage_plot_truss_fixtures`. Fixture
  create/update payloads no longer accept a truss assignment (FR-030).
- **Truss section endpoints removed** along with `truss_sections`
  (single-user tool; UI is the only consumer and migrates in-slice).
- **Rental summary / export**: unchanged contract; totals now include
  truss pieces (lighting column) via the new CTE arm (research.md R10).
- **Reference data / inventory**: no contract change; the truss
  category's `picker_role = 'truss'` is seeded by migration and already
  editable via the existing category endpoints.
