package db

import (
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"path/filepath"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	migratesqlite "github.com/golang-migrate/migrate/v4/database/sqlite"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	_ "modernc.org/sqlite"
)

func Open(databasePath string, migrationsPath string, logger *slog.Logger) (*sql.DB, error) {
	// Foreign keys must be enabled via the DSN: database/sql pools
	// connections, and a plain `PRAGMA foreign_keys = ON` would only apply
	// to whichever single connection happened to execute it.
	dsn := databasePath
	if !strings.HasPrefix(dsn, "file:") {
		dsn = "file:" + dsn
	}
	if strings.Contains(dsn, "?") {
		dsn += "&"
	} else {
		dsn += "?"
	}
	dsn += "_pragma=foreign_keys(1)"

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}

	if err := runMigrations(db, migrationsPath, logger); err != nil {
		return nil, err
	}

	return db, nil
}

// runMigrations applies schema migrations, sequencing the Slice 11
// output-graph conversion (research.md R5) precisely around the drop of
// output_chain_hops in migration 026. golang-migrate's Migrate(version)
// runs DOWN scripts if the target is behind the database's current
// version, so calling Migrate(25) against a database already past 25
// would run 026's down script and resurrect output_chain_hops — the
// version check below is load-bearing, not a style choice: it only ever
// calls Migrate(25) on a fresh database or one still behind 25, runs the
// one-time conversion immediately after landing on 25, and only then
// continues on to Up() to reach 026+.
func runMigrations(db *sql.DB, migrationsPath string, logger *slog.Logger) error {
	driver, err := migratesqlite.WithInstance(db, &migratesqlite.Config{})
	if err != nil {
		return fmt.Errorf("create migration driver: %w", err)
	}

	path, err := filepath.Abs(migrationsPath)
	if err != nil {
		return fmt.Errorf("resolve migrations path: %w", err)
	}

	m, err := migrate.NewWithDatabaseInstance("file://"+path, "sqlite", driver)
	if err != nil {
		return fmt.Errorf("create migration instance: %w", err)
	}

	version, _, versionErr := m.Version()
	if errors.Is(versionErr, migrate.ErrNilVersion) || (versionErr == nil && version < 25) {
		if err := m.Migrate(25); err != nil && err != migrate.ErrNoChange {
			return fmt.Errorf("run migrations to version 25: %w", err)
		}
		if err := convertOutputChainHopsToGraph(db, logger); err != nil {
			return fmt.Errorf("convert output chain hops to graph: %w", err)
		}
	} else if versionErr != nil {
		return fmt.Errorf("read migration version: %w", versionErr)
	}

	// Same sequencing discipline for the Slice 12 input-graph conversion
	// (research.md R7), around the drop of input_channels' legacy columns
	// in migration 030: only ever calls Migrate(29) on a database still
	// behind 29, runs the one-time conversion immediately after landing on
	// 29, and only then continues on to Up() to reach 030+. Re-reads the
	// version (rather than reusing the check above) since the branch above
	// may have just advanced it via m.Migrate(25).
	version, _, versionErr = m.Version()
	if errors.Is(versionErr, migrate.ErrNilVersion) || (versionErr == nil && version < 29) {
		if err := m.Migrate(29); err != nil && err != migrate.ErrNoChange {
			return fmt.Errorf("run migrations to version 29: %w", err)
		}
		if err := convertLegacyInputChannels(db, logger); err != nil {
			return fmt.Errorf("convert legacy input channels: %w", err)
		}
	} else if versionErr != nil {
		return fmt.Errorf("read migration version: %w", versionErr)
	}

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("run migrations: %w", err)
	}

	return nil
}
