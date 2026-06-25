CREATE TABLE IF NOT EXISTS stageboxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  model TEXT,
  input_count INTEGER DEFAULT 0,
  output_count INTEGER DEFAULT 0,
  connection_type TEXT DEFAULT 'analog'
);

CREATE TABLE IF NOT EXISTS stage_multis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  length_m REAL,
  channels INTEGER DEFAULT 24,
  connector_type TEXT DEFAULT 'xlr'
);

CREATE TABLE IF NOT EXISTS audio_patch_inputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  channel_number INTEGER NOT NULL,
  channel_name TEXT,
  signal_type TEXT DEFAULT 'mic' CHECK(signal_type IN ('mic','line','di','return','aux')),
  preamp_connector TEXT DEFAULT 'xlr',
  stagebox_id INTEGER REFERENCES stageboxes(id),
  stagebox_channel INTEGER,
  stage_multi_id INTEGER REFERENCES stage_multis(id),
  stage_multi_channel INTEGER,
  mic_model TEXT,
  cable_type TEXT DEFAULT 'xlr',
  cable_length_m REAL,
  mic_stand TEXT CHECK(mic_stand IN ('straight','boom','low','desk','clip','none','')),
  phantom_power INTEGER DEFAULT 0,
  dca_groups TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS audio_patch_outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  output_number INTEGER NOT NULL,
  output_name TEXT,
  output_type TEXT DEFAULT 'foh' CHECK(output_type IN ('foh','monitor','sub','aux','matrix','stereo','iem')),
  destination_type TEXT DEFAULT 'local' CHECK(destination_type IN ('local','stagebox','stage_multi')),
  stagebox_id INTEGER REFERENCES stageboxes(id),
  stagebox_channel INTEGER,
  stage_multi_id INTEGER REFERENCES stage_multis(id),
  stage_multi_channel INTEGER,
  amplifier_item_id INTEGER REFERENCES inventory_items(id),
  speaker_item_id INTEGER REFERENCES inventory_items(id),
  cable_type TEXT DEFAULT 'xlr',
  cable_length_m REAL,
  notes TEXT
);
