CREATE TABLE IF NOT EXISTS lighting_rigs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS truss_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rig_id INTEGER NOT NULL REFERENCES lighting_rigs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  length_m REAL,
  truss_type TEXT DEFAULT 'box' CHECK(truss_type IN ('box','ladder','circle','straight','none'))
);

CREATE TABLE IF NOT EXISTS lighting_fixtures (
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
