ALTER TABLE events DROP COLUMN inventory_id;
ALTER TABLE inventory_items DROP COLUMN inventory_id;
ALTER TABLE inventory_categories DROP COLUMN inventory_id;
DROP TABLE inventories;
