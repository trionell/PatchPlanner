package db

import (
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
)

// convertLegacyInventoryTemplate reads whatever file currently sits at the
// configured inventory path into the one still-ownerless bootstrap
// inventory row's source_xlsx/source_filename (research.md R5), so the
// legacy catalog can still be re-imported/exported once claimed instead of
// needing an immediate re-upload. Unlike the destructive-migration-adjacent
// conversions (Slices 11–13), this needs no version-sequencing gate: it
// always runs during db.Open, before the HTTP server starts accepting any
// request, so there is no possible race with a real login — the guard
// (still ownerless AND no template set yet) is naturally a permanent no-op
// the moment either becomes true, which can only happen after this code
// has already run once. A missing file is a safe no-op: the inventory
// simply starts with no stored template, same as any inventory before its
// first import.
func convertLegacyInventoryTemplate(db *sql.DB, logger *slog.Logger) error {
	var bootstrapID sql.NullInt64
	err := db.QueryRow(`SELECT id FROM inventories WHERE owner_user_id IS NULL AND source_xlsx IS NULL LIMIT 1`).Scan(&bootstrapID)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return fmt.Errorf("find legacy bootstrap inventory: %w", err)
	}

	path := legacyInventoryPath()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			logger.Info("no legacy inventory file found; bootstrap inventory starts with no stored template", slog.String("path", path))
			return nil
		}
		return fmt.Errorf("read legacy inventory file: %w", err)
	}

	if _, err := db.Exec(`UPDATE inventories SET source_xlsx = ?, source_filename = ? WHERE id = ?`, data, filepath.Base(path), bootstrapID.Int64); err != nil {
		return fmt.Errorf("store legacy inventory template: %w", err)
	}
	logger.Info("stored legacy inventory template", slog.String("path", path), slog.Int64("inventory_id", bootstrapID.Int64))
	return nil
}

// legacyInventoryPath mirrors api/inventory.go's inventoryFilePath — the
// db package can't import api, so this small duplication is intentional.
func legacyInventoryPath() string {
	if path := os.Getenv("INVENTORY_PATH"); path != "" {
		return path
	}
	return "../LL.xlsx"
}
