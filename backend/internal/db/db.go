package db

import (
	"database/sql"
	"fmt"
	"path/filepath"

	"github.com/golang-migrate/migrate/v4"
	migratesqlite "github.com/golang-migrate/migrate/v4/database/sqlite"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	_ "modernc.org/sqlite"
)

func Open(databasePath string, migrationsPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", databasePath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}

	if _, err := db.Exec(`PRAGMA foreign_keys = ON;`); err != nil {
		return nil, fmt.Errorf("enable foreign keys: %w", err)
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
