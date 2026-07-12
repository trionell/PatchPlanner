DROP INDEX IF EXISTS ux_input_cables_from_port;
DROP TABLE IF EXISTS input_cables;
DROP TABLE IF EXISTS input_devices;
DROP TABLE IF EXISTS input_sources;

DELETE FROM reference_values WHERE vocabulary = 'preamp_connectors' AND value = 'mini_jack_3_5mm';

ALTER TABLE input_channels RENAME TO audio_patch_inputs;
