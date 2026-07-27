-- The mixing console becomes an entity (Slice 23). Until now the desk was
-- the one piece of gear in the plan with no row anywhere: the output graph
-- drew a node with id 0 and kind 'mixer' whose ports came from
-- audio_patch_outputs, and the only thing persisted about it was
-- events.output_mixer_position_y — where it sat on the canvas. As a result
-- the most expensive item in the truck never reached the rental order,
-- nothing validated a patch against the desk's channel count, and a mic
-- going straight into the desk's own preamp had to be faked through a
-- stagebox.
--
-- event_consoles is deliberately shaped like stageboxes/stage_multis: event
-- scoped, an optional catalog OR owned item, port counts typed per event
-- (research.md R5 — a desk's usable channel count depends on its card fit
-- and licence, not on its model name), and a canvas position per graph
-- following migration 031's naming (position_* = output graph,
-- input_position_* = input graph).
--
-- An event may hold more than one console (research.md R4): FOH plus
-- monitors is an ordinary rider, and the single-desk case is a list of one.

CREATE TABLE IF NOT EXISTS event_consoles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'foh',
  inventory_item_id INTEGER REFERENCES inventory_items(id),
  owned_item_id INTEGER REFERENCES owned_items(id),
  input_count INTEGER NOT NULL DEFAULT 0,
  output_count INTEGER NOT NULL DEFAULT 0,
  local_input_count INTEGER NOT NULL DEFAULT 0,
  local_output_count INTEGER NOT NULL DEFAULT 0,
  position_x REAL NOT NULL DEFAULT 0,
  position_y REAL NOT NULL DEFAULT 0,
  input_position_x REAL NOT NULL DEFAULT 0,
  input_position_y REAL NOT NULL DEFAULT 0
);

-- One console per existing event, carrying its canvas position across, with
-- no name, no item and no declared capacity. That combination is exactly the
-- silent state: an unpicked item adds no rental line (so
-- specs/013-stage-plots/rental-baseline.json still matches) and a count of 0
-- means "not declared", never "over capacity" (research.md R15).
INSERT INTO event_consoles (event_id, name, role, position_y)
SELECT id, '', 'foh', output_mixer_position_y FROM events;

-- Every channel and every output belongs to exactly one console. NULL is a
-- legal, non-warning state — it is what a row looks like after its only desk
-- is deleted, which is why ON DELETE SET NULL rather than a cascade: deleting
-- a desk must never delete the patch planned on it.
ALTER TABLE input_channels ADD COLUMN console_id INTEGER REFERENCES event_consoles(id) ON DELETE SET NULL;
ALTER TABLE audio_patch_outputs ADD COLUMN console_id INTEGER REFERENCES event_consoles(id) ON DELETE SET NULL;

-- Unambiguous: this runs before a second console can exist on any event.
UPDATE input_channels SET console_id =
  (SELECT c.id FROM event_consoles c WHERE c.event_id = input_channels.event_id);
UPDATE audio_patch_outputs SET console_id =
  (SELECT c.id FROM event_consoles c WHERE c.event_id = audio_patch_outputs.event_id);

-- Superseded by event_consoles.position_y. Two places storing where the desk
-- sits would drift immediately. No CHECK constraint on this column, so a
-- plain DROP COLUMN suffices (same as migration 030).
ALTER TABLE events DROP COLUMN output_mixer_position_y;
