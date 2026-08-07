-- Slice 42. A stage plot is drawn to scale and states no distance, so "how far
-- downstage is the delay stack" is counted off grid squares or judged by eye.
-- This table is where a plot says it.
--
-- Purely additive: one new table, no column touched on any existing one. An
-- existing plot has no measurements and is correct with none, so there is no
-- backfill and no entry in db.go's staged-Migrate(N) sequencing.

CREATE TABLE stage_plot_measurements (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  plot_id  INTEGER NOT NULL REFERENCES stage_plots(id) ON DELETE CASCADE,
  layer_id INTEGER NOT NULL REFERENCES stage_plot_layers(id) ON DELETE CASCADE,

  -- A measurement belongs to the view it was drawn in. Its anchors are
  -- features of a 3D box and are view-independent, but the distance it states
  -- is a distance in one projection: a perpendicular in plan is not a
  -- perpendicular in elevation, and an offset held clear of the geometry in
  -- one view points into the screen in another.
  view TEXT NOT NULL CHECK(view IN ('top','front','side')),

  -- aligned states the true point-to-point distance; horizontal and vertical
  -- state the separation along one of the view's axes alone.
  type TEXT NOT NULL CHECK(type IN ('aligned','horizontal','vertical')),

  -- Each end is EITHER an element feature OR a free point, never both and
  -- never neither. That exclusivity is enforced in internal/api, where the
  -- message naming the offending end already lives — the same division 032
  -- drew when it put the enums in CHECK and left "exactly one of shape_kind /
  -- icon / truss_id / fixture_id" to Go.
  --
  -- An element end stores the REFERENCE and never the resolved point, which is
  -- the whole reason a measurement stays true when its element is moved,
  -- resized, rotated or raked. feature is a compact encoding of a feature of
  -- the element's own box — 'centre', 'corner:+-+' (signs on its local x/y/z
  -- axes), or 'face:+x' — parsed in Go. A box has six faces and eight corners
  -- as a fact of being a box; that is not configurable data, so it needs no
  -- table of its own.
  --
  -- slide distinguishes a face's two modes: 0 pins the anchor to the face's
  -- projected centre (the midpoint of that drawn side), 1 lets it slide
  -- anywhere along the face's line and states the perpendicular distance. They
  -- are one feature in two modes because they sit in the same place.
  from_element_id INTEGER REFERENCES stage_plot_elements(id) ON DELETE CASCADE,
  from_feature    TEXT,
  from_slide      INTEGER NOT NULL DEFAULT 0,
  from_u_cm       REAL,
  from_v_cm       REAL,

  to_element_id INTEGER REFERENCES stage_plot_elements(id) ON DELETE CASCADE,
  to_feature    TEXT,
  to_slide      INTEGER NOT NULL DEFAULT 0,
  to_u_cm       REAL,
  to_v_cm       REAL,

  -- How far the dimension line is held clear of what it measures,
  -- perpendicular to the measured direction. Signed: negative holds it on the
  -- other side. Never changes the stated value.
  offset_cm REAL NOT NULL DEFAULT 0,

  note       TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ON DELETE CASCADE on both element references is why "no dangling measurement
-- survives" is a property of the schema rather than of remembering to clean up
-- on every path that deletes an element. Both are nullable, so a free end is
-- untouched by any element delete.
CREATE INDEX idx_stage_plot_measurements_plot ON stage_plot_measurements(plot_id);
CREATE INDEX idx_stage_plot_measurements_from ON stage_plot_measurements(from_element_id);
CREATE INDEX idx_stage_plot_measurements_to ON stage_plot_measurements(to_element_id);
