-- Channel width (mono/stereo) and independently-patchable side-B routing on
-- both patch directions; input-only mixer console-strip behavior; input-only
-- DI source cabling. All columns default to values that reproduce today's
-- behavior exactly on every pre-existing row (see quickstart.md #1).
ALTER TABLE audio_patch_inputs ADD COLUMN width TEXT NOT NULL DEFAULT 'mono';
ALTER TABLE audio_patch_inputs ADD COLUMN mixer_behavior TEXT NOT NULL DEFAULT 'stereo_channel';
ALTER TABLE audio_patch_inputs ADD COLUMN stagebox_id_b INTEGER REFERENCES stageboxes(id);
ALTER TABLE audio_patch_inputs ADD COLUMN stagebox_channel_b INTEGER;
ALTER TABLE audio_patch_inputs ADD COLUMN stage_multi_id_b INTEGER REFERENCES stage_multis(id);
ALTER TABLE audio_patch_inputs ADD COLUMN stage_multi_channel_b INTEGER;
ALTER TABLE audio_patch_inputs ADD COLUMN source_cable_item_id INTEGER REFERENCES inventory_items(id);
ALTER TABLE audio_patch_inputs ADD COLUMN source_cabling TEXT NOT NULL DEFAULT 'two_cables';

ALTER TABLE audio_patch_outputs ADD COLUMN width TEXT NOT NULL DEFAULT 'mono';
ALTER TABLE audio_patch_outputs ADD COLUMN stagebox_id_b INTEGER REFERENCES stageboxes(id);
ALTER TABLE audio_patch_outputs ADD COLUMN stagebox_channel_b INTEGER;
ALTER TABLE audio_patch_outputs ADD COLUMN stage_multi_id_b INTEGER REFERENCES stage_multis(id);
ALTER TABLE audio_patch_outputs ADD COLUMN stage_multi_channel_b INTEGER;
