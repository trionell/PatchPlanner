-- Reversing this loses every measurement drawn on every plot. Nothing else
-- goes with it: no existing table gained a column, and nothing outside this
-- table references a measurement, so the plots themselves revert to stating no
-- distances, which is what they did before Slice 42.
DROP TABLE stage_plot_measurements;
