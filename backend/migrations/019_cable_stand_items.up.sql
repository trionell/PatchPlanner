-- Cables and stands become catalog picks. Categories gain a picker_role so
-- which categories feed the cable/stand pickers is data, not code; patch rows
-- gain item FKs. The old cable_type/cable_length_m/mic_stand columns are
-- demoted to read-only legacy display values (the mic_model pattern).
ALTER TABLE inventory_categories ADD COLUMN picker_role TEXT;

UPDATE inventory_categories SET picker_role = 'cable'
WHERE name IN ('Signalkablage', 'Signalkablage digital', 'Högtalarkablage');

UPDATE inventory_categories SET picker_role = 'stand'
WHERE name = 'Stativ & Lyftutrustning';

ALTER TABLE audio_patch_inputs ADD COLUMN cable_item_id INTEGER REFERENCES inventory_items(id);

ALTER TABLE audio_patch_inputs ADD COLUMN stand_item_id INTEGER REFERENCES inventory_items(id);

ALTER TABLE audio_patch_outputs ADD COLUMN cable_item_id INTEGER REFERENCES inventory_items(id);

-- Conservative backfill: only the unambiguous case converts — an XLR input
-- cable whose length matches exactly one live "Mikrofonkabel" catalog item
-- (descriptions like "7,5m" are normalized against printf('%gm', length)).
-- Everything else (other cable types, all output cables, all stands) keeps
-- its legacy values on display until the planner re-picks.
UPDATE audio_patch_inputs
SET cable_item_id = (
  SELECT MIN(i.id) FROM inventory_items i
  JOIN inventory_categories c ON c.id = i.category_id
  WHERE c.picker_role = 'cable'
    AND i.discontinued = 0
    AND LOWER(i.name) = 'mikrofonkabel'
    AND LOWER(REPLACE(COALESCE(i.description, ''), ',', '.')) = printf('%gm', audio_patch_inputs.cable_length_m)
  HAVING COUNT(*) = 1
)
WHERE cable_item_id IS NULL
  AND LOWER(COALESCE(cable_type, '')) = 'xlr'
  AND cable_length_m IS NOT NULL
  AND cable_length_m > 0;

UPDATE audio_patch_inputs
SET cable_type = NULL, cable_length_m = NULL
WHERE cable_item_id IS NOT NULL;
