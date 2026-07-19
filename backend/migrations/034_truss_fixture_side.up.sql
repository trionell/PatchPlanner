-- Which lane of the truss a fixture hangs on, as seen in the top view:
-- the upstage chord ('top'), the centre line ('middle') or the
-- downstage chord ('bottom'). Existing attachments keep the centre.
ALTER TABLE stage_plot_truss_fixtures ADD COLUMN side TEXT NOT NULL DEFAULT 'middle' CHECK(side IN ('top','middle','bottom'));
