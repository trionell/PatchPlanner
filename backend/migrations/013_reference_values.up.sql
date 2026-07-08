CREATE TABLE IF NOT EXISTS reference_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vocabulary TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  UNIQUE(vocabulary, value)
)
