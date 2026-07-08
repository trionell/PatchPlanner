CREATE TABLE IF NOT EXISTS fixture_modes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel_count INTEGER NOT NULL,
  UNIQUE(inventory_item_id, name)
)
