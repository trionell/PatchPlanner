-- Inventory ownership & duplication (Slice 16): every user gets their own
-- inventory (catalog of equipment, prices, stock) instead of one single
-- global catalog shared by everyone. Purely additive plus a deterministic
-- backfill of the one pre-existing catalog — no per-user judgment is
-- needed here (there is only ever one legacy inventory to backfill onto),
-- so this stays pure SQL; only *claiming* it for a specific user depends
-- on login order and belongs in Go (research.md R4/R5).

CREATE TABLE inventories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  source_xlsx BLOB,
  source_filename TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The one pre-existing catalog becomes a real, ownerless inventory,
-- claimed by whoever logs in first after this ships (research.md R4).
INSERT INTO inventories (name) VALUES ('Imported catalog');

ALTER TABLE inventory_categories ADD COLUMN inventory_id INTEGER REFERENCES inventories(id);
UPDATE inventory_categories SET inventory_id = (SELECT id FROM inventories LIMIT 1);

ALTER TABLE inventory_items ADD COLUMN inventory_id INTEGER REFERENCES inventories(id);
UPDATE inventory_items SET inventory_id = (SELECT id FROM inventories LIMIT 1);

ALTER TABLE events ADD COLUMN inventory_id INTEGER REFERENCES inventories(id);
UPDATE events SET inventory_id = (SELECT id FROM inventories LIMIT 1) WHERE inventory_id IS NULL;
