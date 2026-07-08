-- Rebuild truss_sections without the CHECK on truss_type (now an editable
-- vocabulary). lighting_fixtures.truss_section_id references this table,
-- which rules out both rename-based rebuild idioms inside the transaction
-- golang-migrate wraps around this file: dropping a referenced parent
-- permanently increments the deferred FK violation counter (renaming a
-- replacement into place never unwinds it), and legacy_alter_table is
-- ineffective here, so a rename of the old table drags the fixtures' FK
-- clause along with it. Instead: stash both tables' rows in plain backup
-- tables (CREATE ... AS SELECT carries no FK clauses), drop child then
-- parent (no FK reference survives to be violated), recreate both under
-- their final names, and copy the rows back.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE truss_sections_backup AS SELECT * FROM truss_sections;

CREATE TABLE lighting_fixtures_backup AS SELECT * FROM lighting_fixtures;

DROP TABLE lighting_fixtures;

DROP TABLE truss_sections;

CREATE TABLE truss_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rig_id INTEGER NOT NULL REFERENCES lighting_rigs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  length_m REAL,
  truss_type TEXT DEFAULT 'box'
);

CREATE TABLE lighting_fixtures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rig_id INTEGER NOT NULL REFERENCES lighting_rigs(id) ON DELETE CASCADE,
  truss_section_id INTEGER REFERENCES truss_sections(id),
  inventory_item_id INTEGER REFERENCES inventory_items(id),
  custom_name TEXT,
  position_index INTEGER DEFAULT 0,
  power_connection TEXT DEFAULT 'grid' CHECK(power_connection IN ('grid','chain')),
  power_chain_parent_id INTEGER REFERENCES lighting_fixtures(id),
  power_connector_in TEXT DEFAULT 'schuko',
  power_connector_out TEXT,
  dmx_universe INTEGER DEFAULT 1,
  dmx_start_address INTEGER,
  dmx_channel_mode TEXT,
  dmx_channel_count INTEGER,
  dmx_chain_parent_id INTEGER REFERENCES lighting_fixtures(id),
  notes TEXT
);

INSERT INTO truss_sections (id, rig_id, name, length_m, truss_type)
SELECT id, rig_id, name, length_m, truss_type FROM truss_sections_backup;

INSERT INTO lighting_fixtures (
  id, rig_id, truss_section_id, inventory_item_id, custom_name,
  position_index, power_connection, power_chain_parent_id,
  power_connector_in, power_connector_out, dmx_universe, dmx_start_address,
  dmx_channel_mode, dmx_channel_count, dmx_chain_parent_id, notes
)
SELECT
  id, rig_id, truss_section_id, inventory_item_id, custom_name,
  position_index, power_connection, power_chain_parent_id,
  power_connector_in, power_connector_out, dmx_universe, dmx_start_address,
  dmx_channel_mode, dmx_channel_count, dmx_chain_parent_id, notes
FROM lighting_fixtures_backup;

DROP TABLE lighting_fixtures_backup;

DROP TABLE truss_sections_backup;
