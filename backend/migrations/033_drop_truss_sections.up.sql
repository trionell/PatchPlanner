-- Plot trusses (Slice 13) supersede the Lighting tab's truss sections:
-- fixtures are organised onto trusses on the stage plot, and the
-- Lighting tab shows the attachment read-only (FR-030). Every existing
-- section row has been carried over into stage_plot_trusses by the
-- one-time Go conversion sequenced before this migration in db.go.
-- Dropping the fixture column first removes its FK on truss_sections so
-- the parent table can be dropped cleanly.
ALTER TABLE lighting_fixtures DROP COLUMN truss_section_id;
DROP TABLE truss_sections;
