CREATE TABLE IF NOT EXISTS inventory_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_type TEXT NOT NULL CHECK(category_type IN ('audio','lighting','misc','video','rigging'))
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES inventory_categories(id),
  name TEXT NOT NULL,
  description TEXT,
  quantity_available INTEGER DEFAULT 0,
  price_ex_vat REAL DEFAULT 0,
  xlsx_row INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
