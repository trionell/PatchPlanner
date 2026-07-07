CREATE TABLE IF NOT EXISTS owned_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  category_type TEXT NOT NULL DEFAULT 'misc' CHECK(category_type IN ('audio','lighting','rigging','video','misc')),
  quantity_owned INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
