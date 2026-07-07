CREATE TABLE IF NOT EXISTS event_owned_equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  owned_item_id INTEGER NOT NULL REFERENCES owned_items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  UNIQUE(event_id, owned_item_id)
)
