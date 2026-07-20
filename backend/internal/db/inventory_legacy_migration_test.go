package db

import (
	"database/sql"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestConvertLegacyInventoryTemplate(t *testing.T) {
	database := openTestDB(t)

	dir := t.TempDir()
	path := filepath.Join(dir, "LL.xlsx")
	if err := os.WriteFile(path, []byte("fake xlsx bytes"), 0o644); err != nil {
		t.Fatalf("write fake xlsx: %v", err)
	}
	t.Setenv("INVENTORY_PATH", path)

	if err := convertLegacyInventoryTemplate(database, testLogger()); err != nil {
		t.Fatalf("convert legacy inventory template: %v", err)
	}

	var sourceXLSX []byte
	var sourceFilename string
	if err := database.QueryRow(`SELECT source_xlsx, source_filename FROM inventories WHERE owner_user_id IS NULL`).Scan(&sourceXLSX, &sourceFilename); err != nil {
		t.Fatalf("query bootstrap inventory: %v", err)
	}
	if string(sourceXLSX) != "fake xlsx bytes" {
		t.Errorf("source_xlsx = %q, want the fake file's bytes", sourceXLSX)
	}
	if sourceFilename != "LL.xlsx" {
		t.Errorf("source_filename = %q, want LL.xlsx", sourceFilename)
	}

	// Re-running is a safe no-op: the guard (still ownerless AND no
	// template yet) is already false, so a second call touches nothing.
	if err := os.WriteFile(path, []byte("different bytes"), 0o644); err != nil {
		t.Fatalf("rewrite fake xlsx: %v", err)
	}
	if err := convertLegacyInventoryTemplate(database, testLogger()); err != nil {
		t.Fatalf("second convert call: %v", err)
	}
	var sourceXLSXAfter []byte
	if err := database.QueryRow(`SELECT source_xlsx FROM inventories WHERE owner_user_id IS NULL`).Scan(&sourceXLSXAfter); err != nil {
		t.Fatalf("query bootstrap inventory again: %v", err)
	}
	if string(sourceXLSXAfter) != "fake xlsx bytes" {
		t.Errorf("source_xlsx changed on re-run: %q", sourceXLSXAfter)
	}
}

func TestConvertLegacyInventoryTemplateNoFile(t *testing.T) {
	database := openTestDB(t)
	t.Setenv("INVENTORY_PATH", filepath.Join(t.TempDir(), "does-not-exist.xlsx"))

	if err := convertLegacyInventoryTemplate(database, testLogger()); err != nil {
		t.Fatalf("expected no error when the file is missing, got: %v", err)
	}

	var sourceXLSX sql.NullString
	if err := database.QueryRow(`SELECT source_xlsx FROM inventories WHERE owner_user_id IS NULL`).Scan(&sourceXLSX); err != nil {
		t.Fatalf("query bootstrap inventory: %v", err)
	}
	if sourceXLSX.Valid {
		t.Errorf("expected source_xlsx to stay NULL, got %q", sourceXLSX.String)
	}
}
