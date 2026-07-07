package db

import (
	"database/sql"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// openTestDB opens a fresh SQLite database in a temp dir and applies the real
// migrations, so tests exercise the exact schema production runs on.
func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	database, err := Open(filepath.Join(t.TempDir(), "test.db"), migrationsDir(t))
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	return database
}

func migrationsDir(t *testing.T) string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot resolve caller path")
	}
	return filepath.Join(filepath.Dir(thisFile), "..", "..", "migrations")
}

// execMigrationFile re-runs a single migration statement against the given
// database, used to test migration semantics (e.g. the 009 backfill) on
// seeded data.
func execMigrationFile(t *testing.T, database *sql.DB, filename string) {
	t.Helper()
	contents, err := os.ReadFile(filepath.Join(migrationsDir(t), filename))
	if err != nil {
		t.Fatalf("read migration %s: %v", filename, err)
	}
	if _, err := database.Exec(string(contents)); err != nil {
		t.Fatalf("exec migration %s: %v", filename, err)
	}
}

// catalog holds the ids of the seeded inventory fixture.
type catalog struct {
	AudioCategoryID    int64
	LightingCategoryID int64
	Mic                int64 // "Shure SM58", stock 4, 150 kr
	DI                 int64 // "BSS AR-133", stock 2, 100 kr
	Amp                int64 // "Lab.Gruppen FP2400", stock 1, 400 kr
	Speaker            int64 // "JBL SRX835P", stock 4, 500 kr
	Stagebox           int64 // "Behringer S32", stock 1, 700 kr
	Multi              int64 // "Multikabel 24/4", stock 1, 300 kr
	Fixture            int64 // "Robe LEDWash 600", stock 6, 250 kr
}

func seedCatalog(t *testing.T, database *sql.DB) catalog {
	t.Helper()
	c := catalog{
		AudioCategoryID:    insertCategory(t, database, "Mikrofoner", "audio"),
		LightingCategoryID: insertCategory(t, database, "Ljusarmaturer", "lighting"),
	}
	c.Mic = insertItem(t, database, c.AudioCategoryID, "Shure SM58", 4, 150, 10)
	c.DI = insertItem(t, database, c.AudioCategoryID, "BSS AR-133", 2, 100, 11)
	c.Amp = insertItem(t, database, c.AudioCategoryID, "Lab.Gruppen FP2400", 1, 400, 12)
	c.Speaker = insertItem(t, database, c.AudioCategoryID, "JBL SRX835P", 4, 500, 13)
	c.Stagebox = insertItem(t, database, c.AudioCategoryID, "Behringer S32", 1, 700, 14)
	c.Multi = insertItem(t, database, c.AudioCategoryID, "Multikabel 24/4", 1, 300, 15)
	c.Fixture = insertItem(t, database, c.LightingCategoryID, "Robe LEDWash 600", 6, 250, 20)
	return c
}

func insertCategory(t *testing.T, database *sql.DB, name, categoryType string) int64 {
	t.Helper()
	result, err := database.Exec(`INSERT INTO inventory_categories (name, category_type) VALUES (?, ?)`, name, categoryType)
	if err != nil {
		t.Fatalf("insert category %s: %v", name, err)
	}
	id, _ := result.LastInsertId()
	return id
}

func insertItem(t *testing.T, database *sql.DB, categoryID int64, name string, quantity int, price float64, xlsxRow int) int64 {
	t.Helper()
	result, err := database.Exec(`INSERT INTO inventory_items (category_id, name, quantity_available, price_ex_vat, xlsx_row) VALUES (?, ?, ?, ?, ?)`,
		categoryID, name, quantity, price, xlsxRow)
	if err != nil {
		t.Fatalf("insert item %s: %v", name, err)
	}
	id, _ := result.LastInsertId()
	return id
}

func createTestEvent(t *testing.T, database *sql.DB) int64 {
	t.Helper()
	event, err := CreateEvent(database, domain.Event{Name: "Test Gig"})
	if err != nil {
		t.Fatalf("create event: %v", err)
	}
	return event.ID
}

func createMicInput(t *testing.T, database *sql.DB, eventID int64, channel int, micItemID *int64) domain.AudioPatchInput {
	t.Helper()
	input, err := CreateAudioPatchInput(database, domain.AudioPatchInput{
		EventID:       eventID,
		ChannelNumber: channel,
		SignalType:    "mic",
		MicItemID:     micItemID,
	})
	if err != nil {
		t.Fatalf("create input ch %d: %v", channel, err)
	}
	return input
}

func summaryByItem(summary domain.RentalSummary) map[int64]domain.EventRental {
	byItem := make(map[int64]domain.EventRental, len(summary.Items))
	for _, line := range summary.Items {
		byItem[line.InventoryItemID] = line
	}
	return byItem
}
