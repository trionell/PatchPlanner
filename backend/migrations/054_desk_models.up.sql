-- Slice 47: a console has a desk model. Every existing console becomes
-- Generic, which is exactly today's typed-count desk, so no number, count or
-- capacity verdict changes until someone picks a model.
ALTER TABLE event_consoles ADD COLUMN desk_model TEXT NOT NULL DEFAULT 'generic';
-- LV1 80's groups/monitors split; '' for every other model.
ALTER TABLE event_consoles ADD COLUMN bus_mode TEXT NOT NULL DEFAULT '';

-- Which of an X32 · M32 desk's two strip pools a channel sits on.
ALTER TABLE input_channels ADD COLUMN strip_pool TEXT NOT NULL DEFAULT 'channel';

-- A channel or output always belongs to a desk now. On an event with exactly
-- one desk the answer is not a question, so rows left without one (by a
-- deleted desk, or by a two-desk + Channel before this slice) go onto it.
UPDATE input_channels SET console_id = (
  SELECT MIN(c.id) FROM event_consoles c WHERE c.event_id = input_channels.event_id
)
WHERE console_id IS NULL
  AND (SELECT COUNT(*) FROM event_consoles c WHERE c.event_id = input_channels.event_id) = 1;

UPDATE audio_patch_outputs SET console_id = (
  SELECT MIN(c.id) FROM event_consoles c WHERE c.event_id = audio_patch_outputs.event_id
)
WHERE console_id IS NULL
  AND (SELECT COUNT(*) FROM event_consoles c WHERE c.event_id = audio_patch_outputs.event_id) = 1;
