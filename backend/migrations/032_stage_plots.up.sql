-- Stage plots (Slice 13): to-scale, layered per-event drawings. All
-- lengths/positions are centimetres. Trusses are event-scoped (counted
-- once per event on the rental order regardless of how many plots show
-- them — the shared-output-devices pattern); plots hold placements via
-- stage_plot_elements rows of kind 'truss'. truss_sections is left
-- untouched here: the one-time Go conversion runs after this migration,
-- and 033 drops the legacy table (the 029/030 sandwich pattern).

CREATE TABLE stage_plots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  grid_visible INTEGER NOT NULL DEFAULT 1,
  grid_size_cm REAL NOT NULL DEFAULT 25 CHECK(grid_size_cm > 0),
  snap_grid INTEGER NOT NULL DEFAULT 1,
  snap_objects INTEGER NOT NULL DEFAULT 1,
  show_fixture_name INTEGER NOT NULL DEFAULT 1,
  show_fixture_fid INTEGER NOT NULL DEFAULT 0,
  show_fixture_dmx INTEGER NOT NULL DEFAULT 0,
  active_view TEXT NOT NULL DEFAULT 'top' CHECK(active_view IN ('top','front','side')),
  zoom REAL NOT NULL DEFAULT 1,
  pan_x_cm REAL NOT NULL DEFAULT 0,
  pan_y_cm REAL NOT NULL DEFAULT 0
);

CREATE TABLE stage_plot_layers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plot_id INTEGER NOT NULL REFERENCES stage_plots(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  visible INTEGER NOT NULL DEFAULT 1,
  locked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE stage_plot_trusses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  height_cm REAL NOT NULL DEFAULT 0
);

CREATE TABLE stage_plot_truss_pieces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  truss_id INTEGER NOT NULL REFERENCES stage_plot_trusses(id) ON DELETE CASCADE,
  inventory_item_id INTEGER REFERENCES inventory_items(id),
  label TEXT NOT NULL DEFAULT '',
  length_cm REAL NOT NULL CHECK(length_cm > 0),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE stage_plot_truss_fixtures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  truss_id INTEGER NOT NULL REFERENCES stage_plot_trusses(id) ON DELETE CASCADE,
  fixture_id INTEGER NOT NULL UNIQUE REFERENCES lighting_fixtures(id) ON DELETE CASCADE,
  offset_cm REAL
);

CREATE TABLE stage_plot_elements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plot_id INTEGER NOT NULL REFERENCES stage_plots(id) ON DELETE CASCADE,
  layer_id INTEGER NOT NULL REFERENCES stage_plot_layers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('shape','resource','truss','fixture')),
  shape_kind TEXT CHECK(shape_kind IN ('rect','ellipse','line','text')),
  icon TEXT,
  truss_id INTEGER REFERENCES stage_plot_trusses(id) ON DELETE CASCADE,
  fixture_id INTEGER REFERENCES lighting_fixtures(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  x_cm REAL NOT NULL DEFAULT 0,
  y_cm REAL NOT NULL DEFAULT 0,
  z_cm REAL NOT NULL DEFAULT 0,
  width_cm REAL NOT NULL DEFAULT 0,
  depth_cm REAL NOT NULL DEFAULT 0,
  height_cm REAL NOT NULL DEFAULT 0,
  rotation_deg REAL NOT NULL DEFAULT 0,
  notes TEXT
);

-- One placement per truss per plot (a truss may appear on many plots,
-- once each); partial index so non-truss elements are unconstrained.
CREATE UNIQUE INDEX idx_stage_plot_elements_truss_once_per_plot
  ON stage_plot_elements(plot_id, truss_id) WHERE truss_id IS NOT NULL;

CREATE TABLE stage_plot_element_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  element_id INTEGER NOT NULL REFERENCES stage_plot_elements(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('assignment','stack')),
  entity_kind TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(element_id, role, entity_kind, entity_id)
);

-- Truss pieces are catalog picks; the truss category gets the picker
-- role so the frontend picker can filter (the Slice 6 cable/stand
-- pattern). Import-safe: picker_role lives on categories, which the
-- LL.xlsx import preserves.
UPDATE inventory_categories SET picker_role = 'truss'
WHERE name = 'Tross' AND picker_role IS NULL;
