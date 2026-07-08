-- Best-effort downgrade: restore the truss_type CHECK using the same
-- backup/drop/recreate/copy-back sequence as the up migration (see its
-- comment for why renames cannot be used here). Rows using user-added
-- truss types will fail the copy, as inherent to re-imposing the removed
-- constraint.
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
  truss_type TEXT DEFAULT 'box' CHECK(truss_type IN ('box','ladder','circle','straight','none'))
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
