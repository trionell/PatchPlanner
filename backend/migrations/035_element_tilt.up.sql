-- Front-view rotation (rake) for stage plot elements: rotation_deg
-- rotates in the plan view, tilt_deg rotates in the front elevation
-- (about the depth axis), e.g. an angled truss.
ALTER TABLE stage_plot_elements ADD COLUMN tilt_deg REAL NOT NULL DEFAULT 0;
