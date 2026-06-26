ALTER TABLE stageboxes ADD COLUMN inventory_item_id INTEGER REFERENCES inventory_items(id)
