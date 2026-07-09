ALTER TABLE audio_patch_outputs DROP COLUMN stage_multi_channel_b;
ALTER TABLE audio_patch_outputs DROP COLUMN stage_multi_id_b;
ALTER TABLE audio_patch_outputs DROP COLUMN stagebox_channel_b;
ALTER TABLE audio_patch_outputs DROP COLUMN stagebox_id_b;
ALTER TABLE audio_patch_outputs DROP COLUMN width;

ALTER TABLE audio_patch_inputs DROP COLUMN source_cabling;
ALTER TABLE audio_patch_inputs DROP COLUMN source_cable_item_id;
ALTER TABLE audio_patch_inputs DROP COLUMN stage_multi_channel_b;
ALTER TABLE audio_patch_inputs DROP COLUMN stage_multi_id_b;
ALTER TABLE audio_patch_inputs DROP COLUMN stagebox_channel_b;
ALTER TABLE audio_patch_inputs DROP COLUMN stagebox_id_b;
ALTER TABLE audio_patch_inputs DROP COLUMN mixer_behavior;
ALTER TABLE audio_patch_inputs DROP COLUMN width;
