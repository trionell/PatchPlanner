CREATE TABLE IF NOT EXISTS event_rentals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  quantity_audio INTEGER DEFAULT 0,
  quantity_lighting INTEGER DEFAULT 0,
  notes TEXT,
  UNIQUE(event_id, inventory_item_id)
);
