UPDATE inventory_categories SET picker_role = NULL WHERE picker_role = 'truss';

DROP TABLE stage_plot_element_links;
DROP TABLE stage_plot_elements;
DROP TABLE stage_plot_truss_fixtures;
DROP TABLE stage_plot_truss_pieces;
DROP TABLE stage_plot_trusses;
DROP TABLE stage_plot_layers;
DROP TABLE stage_plots;
