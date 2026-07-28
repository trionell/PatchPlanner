-- An event has assumed itself one day long since migration 001. A festival
-- that rigs on Thursday and plays Friday to Sunday has been entered as Friday
-- and remembered in the notes field, where nothing derives from it.
--
-- Three nullable columns around start_date, and one rule that makes them safe:
-- NULL means "derives from its neighbour" — load_in from start, end from
-- start, load_out from end and then from start. So a row holding only a
-- start_date is a one-day event you arrive at and leave on the day, which is
-- exactly what every existing row already means. There is no data migration
-- because there is nothing to migrate: every row is correct the moment the
-- columns exist.
--
-- The ordering rule (load_in <= start <= end <= load_out) is enforced by the
-- API rather than by a CHECK constraint. Three of the four are nullable and
-- the resolution chain is what has to be ordered, not the stored values, so a
-- CHECK would have to restate the chain in SQL — a second implementation of a
-- rule that already lives in one place.
ALTER TABLE events ADD COLUMN load_in_date TEXT;
ALTER TABLE events ADD COLUMN end_date TEXT;
ALTER TABLE events ADD COLUMN load_out_date TEXT;
