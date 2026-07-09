-- Applied only after db.convertOutputChainHopsToGraph has converted and
-- cleared every row (see internal/db/db.go's runMigrations sequencing
-- and internal/db/output_graph_migration.go) — never against
-- unconverted data.
DROP TABLE output_chain_hops;
