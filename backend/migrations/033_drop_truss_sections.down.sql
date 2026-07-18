CREATE TABLE truss_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rig_id INTEGER NOT NULL REFERENCES lighting_rigs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  length_m REAL,
  truss_type TEXT DEFAULT 'box'
);
ALTER TABLE lighting_fixtures ADD COLUMN truss_section_id INTEGER REFERENCES truss_sections(id);
