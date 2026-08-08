-- A stage multi is normally an input-only device; connector adapters let it
-- also carry outputs, which is why it has always appeared unconditionally in
-- both the input and output flow graphs. That reverse use is secondary, so
-- output-graph appearance becomes opt-in. The column is phrased as "show"
-- rather than "hide" so that a stage multi created without this column set
-- (Go's bool zero value) lands on the same default as one row inserted with
-- no explicit value at all: not shown, unless the multi is actually cabled
-- for output (checked at render time, not stored here).
ALTER TABLE stage_multis ADD COLUMN show_in_output_graph BOOLEAN NOT NULL DEFAULT 0;
