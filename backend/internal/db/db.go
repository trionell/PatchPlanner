package db

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	migratesqlite "github.com/golang-migrate/migrate/v4/database/sqlite"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	_ "modernc.org/sqlite"
)

func Open(databasePath string, migrationsPath string) (*sql.DB, error) {
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

	if err := runMigrations(db, migrationsPath); err != nil {
		return nil, err
	}

	return db, nil
}

func runMigrations(db *sql.DB, migrationsPath string) error {
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

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("run migrations: %w", err)
	}

	return nil
}
