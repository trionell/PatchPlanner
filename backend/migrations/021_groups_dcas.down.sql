DELETE FROM reference_values WHERE vocabulary = 'channel_colors';
ALTER TABLE audio_patch_outputs DROP COLUMN color;
ALTER TABLE audio_patch_inputs DROP COLUMN color;
ALTER TABLE audio_patch_inputs ADD COLUMN dca_groups TEXT;
DROP TABLE IF EXISTS audio_input_dcas;
DROP TABLE IF EXISTS audio_input_groups;
DROP TABLE IF EXISTS mixer_dcas;
DROP TABLE IF EXISTS mixer_groups;
