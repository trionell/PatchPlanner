-- Positions for every node kind that's now draggable in its own zone
-- (previously only output_devices had position_x/position_y): stageboxes
-- and stage multis move freely in the Processing zone (same as devices,
-- now that a stagebox is a pass-through — see below), so they get full
-- position_x/position_y. The mixer is a single implicit node per event,
-- always pinned to the Sources/Channels rail — it only ever reorders
-- vertically, so it needs just a Y position, stored on events (there is
-- no per-event "mixer settings" row to attach it to otherwise).
ALTER TABLE stageboxes ADD COLUMN position_x REAL NOT NULL DEFAULT 0;
ALTER TABLE stageboxes ADD COLUMN position_y REAL NOT NULL DEFAULT 0;
ALTER TABLE stage_multis ADD COLUMN position_x REAL NOT NULL DEFAULT 0;
ALTER TABLE stage_multis ADD COLUMN position_y REAL NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN output_mixer_position_y REAL NOT NULL DEFAULT 0;

-- A stagebox becomes a full pass-through node in the graph, symmetric
-- with how a stage multi already works: its existing output_count sizes
-- BOTH an input side (a channel routes into a specific stagebox jack —
-- pure digital/console routing, never a physical cable, since the
-- mixer-to-stagebox network link itself is out of scope for this graph
-- and tracked separately as a Rented Extra) and its unchanged output
-- side (a real physical cable onward to a device). "stagebox" becomes a
-- legal to_kind alongside stage_multi/device.
--
-- output_cables.UNIQUE(from_kind, from_id, from_port) also needs to
-- relax for the mixer specifically: a channel can now fan out to more
-- than one physical destination at once (its own local-out AND one or
-- more stagebox jacks, a real one-to-many routing scenario) — every
-- other from_kind keeps the one-cable-per-port hardware-jack rule. A
-- table-level UNIQUE can't be made conditional, so this is expressed as
-- a partial unique index instead, which requires rebuilding the table.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE output_cables_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  from_kind TEXT NOT NULL,
  from_id INTEGER NOT NULL,
  from_port INTEGER NOT NULL,
  to_kind TEXT NOT NULL,
  to_id INTEGER NOT NULL,
  to_port INTEGER NOT NULL,
  cable_item_id INTEGER REFERENCES inventory_items(id),
  UNIQUE(to_kind, to_id, to_port)
);

INSERT INTO output_cables_new (id, event_id, from_kind, from_id, from_port, to_kind, to_id, to_port, cable_item_id)
SELECT id, event_id, from_kind, from_id, from_port, to_kind, to_id, to_port, cable_item_id FROM output_cables;

DROP TABLE output_cables;
ALTER TABLE output_cables_new RENAME TO output_cables;

CREATE UNIQUE INDEX ux_output_cables_from_port ON output_cables(from_kind, from_id, from_port) WHERE from_kind != 'mixer';
