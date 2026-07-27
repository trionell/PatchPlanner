-- Restores the schema, not the data — there has never been any. Every row in
-- every rig held NULL here, so an empty nullable column is a faithful reversal.
ALTER TABLE lighting_fixtures ADD COLUMN dmx_chain_parent_id INTEGER REFERENCES lighting_fixtures(id);
