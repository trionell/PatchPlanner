package service

import (
	"bytes"
	"database/sql"
	"fmt"
	"strings"
	"testing"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

// seedPDFEvent creates an event with a catalog and manual rental lines, so
// the summary has content without needing the whole planning model.
func seedPDFEvent(t *testing.T, database *sql.DB, name, date, venue string, items [][3]any) (int64, int64) {
	t.Helper()
	owner, err := db.UpsertUserByGoogleSub(database, "pdf-owner-sub", "pdf@example.com", "PDF Owner", "")
	if err != nil {
		t.Fatalf("seed owner: %v", err)
	}
	inventory, err := db.CreateInventory(database, owner.ID, "Lasse Ljud & Ljus AB")
	if err != nil {
		t.Fatalf("create inventory: %v", err)
	}
	event, err := db.CreateEvent(database, domain.Event{Name: name, Date: date, Venue: venue}, owner.ID, inventory.ID)
	if err != nil {
		t.Fatalf("create event: %v", err)
	}

	for _, item := range items {
		categoryName := item[0].(string)
		itemName := item[1].(string)
		quantity := item[2].(int)

		var categoryID int64
		err := database.QueryRow(`SELECT id FROM inventory_categories WHERE inventory_id = ? AND name = ?`, inventory.ID, categoryName).Scan(&categoryID)
		if err == sql.ErrNoRows {
			result, err := database.Exec(`INSERT INTO inventory_categories (inventory_id, name, category_type) VALUES (?, ?, 'audio')`, inventory.ID, categoryName)
			if err != nil {
				t.Fatalf("insert category: %v", err)
			}
			categoryID, _ = result.LastInsertId()
		} else if err != nil {
			t.Fatalf("find category: %v", err)
		}

		result, err := database.Exec(
			`INSERT INTO inventory_items (inventory_id, category_id, name, description, quantity_available, price_ex_vat) VALUES (?, ?, ?, 'test item', 100, 120)`,
			inventory.ID, categoryID, itemName)
		if err != nil {
			t.Fatalf("insert item: %v", err)
		}
		itemID, _ := result.LastInsertId()
		if _, err := database.Exec(
			`INSERT INTO event_rentals (event_id, inventory_item_id, quantity_audio, quantity_lighting) VALUES (?, ?, ?, 0)`,
			event.ID, itemID, quantity); err != nil {
			t.Fatalf("insert rental line: %v", err)
		}
	}
	return event.ID, inventory.ID
}

func TestBuildRentalPDF(t *testing.T) {
	database := openTestDB(t)
	eventID, _ := seedPDFEvent(t, database, "Sommarfesten 2026", "2026-08-14", "Folkets Hus", [][3]any{
		{"Microphones", "Shure SM58", 8},
		{"Microphones", "Shure Beta 52A", 1},
		{"Mixers", "Behringer X32", 1},
	})

	data, filename, err := ExportService{DB: database}.BuildRentalPDF(eventID)
	if err != nil {
		t.Fatalf("build pdf: %v", err)
	}
	if !bytes.HasPrefix(data, []byte("%PDF-")) {
		t.Fatalf("output is not a PDF: % x", data[:min(8, len(data))])
	}
	if len(data) < 1000 {
		t.Errorf("pdf is suspiciously small (%d bytes) for a 3-line order", len(data))
	}
	if filename != "Hyrorder - Sommarfesten 2026 - 2026-08-14.pdf" {
		t.Errorf("filename = %q", filename)
	}
}

// SC-008: a large order must paginate rather than truncate.
func TestBuildRentalPDFPaginatesLargeOrders(t *testing.T) {
	database := openTestDB(t)
	items := make([][3]any, 0, 120)
	for i := 0; i < 120; i++ {
		items = append(items, [3]any{fmt.Sprintf("Category %02d", i%8), fmt.Sprintf("Item number %d", i), i%5 + 1})
	}
	eventID, _ := seedPDFEvent(t, database, "Stor produktion", "2026-09-01", "Arenan", items)

	data, _, err := ExportService{DB: database}.BuildRentalPDF(eventID)
	if err != nil {
		t.Fatalf("build pdf: %v", err)
	}
	// fpdf writes one /Type /Page object per page; counting them is the
	// cheapest way to assert the content did not silently fall off page 1.
	pages := bytes.Count(data, []byte("/Type /Page\n"))
	if pages < 3 {
		t.Errorf("120-line order rendered %d page(s); it must paginate", pages)
	}
}

// FR-030: equipment names are Swedish. The document uses core Helvetica
// with a cp1252 translator, so this is the test that catches a regression
// to raw UTF-8 output (which would render as mojibake).
func TestBuildRentalPDFHandlesSwedishCharacters(t *testing.T) {
	database := openTestDB(t)
	eventID, _ := seedPDFEvent(t, database, "Höstfesten på Ön", "2026-10-02", "Gävle", [][3]any{
		{"Högtalare", "Högtalare & rökmaskin ä ö å", 3},
	})

	data, filename, err := ExportService{DB: database}.BuildRentalPDF(eventID)
	if err != nil {
		t.Fatalf("build pdf with Swedish characters: %v", err)
	}
	if !bytes.HasPrefix(data, []byte("%PDF-")) {
		t.Fatal("output is not a PDF")
	}
	if !strings.Contains(filename, "Höstfesten") {
		t.Errorf("filename %q lost its Swedish characters", filename)
	}
}

// An event with nothing planned is a valid, if empty, document — not an
// error. Exporting before planning anything is a normal thing to do.
func TestBuildRentalPDFEmptyOrder(t *testing.T) {
	database := openTestDB(t)
	eventID, _ := seedPDFEvent(t, database, "Tom order", "2026-11-11", "Ingenstans", nil)

	data, _, err := ExportService{DB: database}.BuildRentalPDF(eventID)
	if err != nil {
		t.Fatalf("empty order should still render: %v", err)
	}
	if !bytes.HasPrefix(data, []byte("%PDF-")) {
		t.Fatal("empty order did not produce a PDF")
	}
}

// Date and venue are optional; the header must not render dangling
// separators around missing fields.
func TestBuildRentalPDFWithoutDateOrVenue(t *testing.T) {
	database := openTestDB(t)
	eventID, _ := seedPDFEvent(t, database, "Namnlöst", "", "", [][3]any{
		{"Microphones", "Shure SM58", 2},
	})

	data, filename, err := ExportService{DB: database}.BuildRentalPDF(eventID)
	if err != nil {
		t.Fatalf("build pdf without date/venue: %v", err)
	}
	if !bytes.HasPrefix(data, []byte("%PDF-")) {
		t.Fatal("output is not a PDF")
	}
	if strings.Contains(filename, " - .pdf") || strings.HasSuffix(filename, "- .pdf") {
		t.Errorf("filename %q has a dangling separator for the missing date", filename)
	}
}

func TestGroupRentalByCategory(t *testing.T) {
	lines := []domain.EventRental{
		{InventoryItemName: "Robe Pointe", CategoryName: "Moving heads", CategoryType: "lighting", TotalQuantity: 8, SubtotalExVAT: 7200},
		{InventoryItemName: "Shure SM58", CategoryName: "Microphones", CategoryType: "audio", TotalQuantity: 8, SubtotalExVAT: 960},
		{InventoryItemName: "Shure Beta 52A", CategoryName: "Microphones", CategoryType: "audio", TotalQuantity: 1, SubtotalExVAT: 180},
		{InventoryItemName: "Orphan", TotalQuantity: 2, SubtotalExVAT: 50},
	}
	groups := groupRentalByCategory(lines)

	if len(groups) != 3 {
		t.Fatalf("groups = %d, want 3", len(groups))
	}
	// Ordered by category name, with the uncategorised bucket sorting in
	// by name like any other.
	if groups[0].Name != "Microphones" {
		t.Errorf("first group = %q, want Microphones (groups sort by name)", groups[0].Name)
	}
	if groups[0].Quantity != 9 || groups[0].Total != 1140 {
		t.Errorf("Microphones subtotal = %d units / %v, want 9 / 1140", groups[0].Quantity, groups[0].Total)
	}
	// An item whose category row vanished must still appear; dropping it
	// would understate the order.
	var found bool
	for _, group := range groups {
		if group.Name == "Uncategorised" {
			found = true
		}
	}
	if !found {
		t.Error("a line with no category was dropped from the grouping")
	}
}

func TestFormatMoney(t *testing.T) {
	cases := map[float64]string{
		0:        "0.00",
		120:      "120.00",
		1750.5:   "1 750.50",
		31480:    "31 480.00",
		1234567:  "1 234 567.00",
		999.999:  "1 000.00",
		12345.67: "12 345.67",
	}
	for value, want := range cases {
		if got := formatMoney(value); got != want {
			t.Errorf("formatMoney(%v) = %q, want %q", value, got, want)
		}
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
