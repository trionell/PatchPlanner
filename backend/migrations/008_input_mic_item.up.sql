ALTER TABLE audio_patch_inputs ADD COLUMN mic_item_id INTEGER REFERENCES inventory_items(id)
