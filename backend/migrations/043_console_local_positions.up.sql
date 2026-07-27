-- Slice 24: a desk's local jacks become their own node on each graph.
--
-- Slice 23 drew them as one-sided ports on the desk's own box, which made them
-- a dead end: on the output graph a bus had nothing to land on, and on the input
-- graph a cabled-in source could never reach a channel. They are now a
-- pass-through box shaped exactly like a stagebox, freely placed in the
-- processing lane, so local jacks and a stagebox are interchangeable
-- destinations.
--
-- That box needs its own placement per graph, separate from the desk's own node
-- (which stays pinned to its lane and still uses position_y / input_position_y).
-- Naming follows migration 031's convention: unprefixed = the output canvas,
-- input_ = the input canvas.
--
-- 260 / 320 starts the box inside the processing lane, left of and below where a
-- new stagebox lands (420 / 60), so a migrated event opens with nothing stacked.
-- No backfill statement: the defaults apply to existing rows as the column is
-- added, and they are what a new desk wants too.

ALTER TABLE event_consoles ADD COLUMN local_position_x REAL NOT NULL DEFAULT 260;
ALTER TABLE event_consoles ADD COLUMN local_position_y REAL NOT NULL DEFAULT 320;
ALTER TABLE event_consoles ADD COLUMN local_input_position_x REAL NOT NULL DEFAULT 260;
ALTER TABLE event_consoles ADD COLUMN local_input_position_y REAL NOT NULL DEFAULT 320;
