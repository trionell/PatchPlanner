ALTER TABLE stage_multis ADD COLUMN inventory_item_id INTEGER REFERENCES inventory_items(id)
