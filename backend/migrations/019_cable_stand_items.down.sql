-- Drops the pick columns and the category role. Legacy cable_type /
-- cable_length_m values cleared by the up backfill are not restored
-- (same one-way convention as the 009 mic backfill).
ALTER TABLE audio_patch_inputs DROP COLUMN cable_item_id;

ALTER TABLE audio_patch_inputs DROP COLUMN stand_item_id;

ALTER TABLE audio_patch_outputs DROP COLUMN cable_item_id;

ALTER TABLE inventory_categories DROP COLUMN picker_role;
