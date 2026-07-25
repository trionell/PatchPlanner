package api

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
	"github.com/xuri/excelize/v2"
)

// genericSheetBytes builds an in-memory generic-format workbook.
func genericSheetBytes(t *testing.T, rows [][]any) []byte {
	t.Helper()
	file := excelize.NewFile()
	defer func() { _ = file.Close() }()
	if err := file.SetSheetName(file.GetSheetName(0), "Inventory"); err != nil {
		t.Fatalf("name sheet: %v", err)
	}
	for i, row := range rows {
		cell, err := excelize.CoordinatesToCellName(1, i+1)
		if err != nil {
			t.Fatalf("cell name: %v", err)
		}
		if err := file.SetSheetRow("Inventory", cell, &row); err != nil {
			t.Fatalf("write row: %v", err)
		}
	}
	buf, err := file.WriteToBuffer()
	if err != nil {
		t.Fatalf("write workbook: %v", err)
	}
	return buf.Bytes()
}

var apiGenericHeader = []any{"Category", "Type", "Name", "Description", "Quantity", "Price (ex VAT)"}

// TestGenericImportEndpoint covers the happy path and the shape of the
// response the frontend renders.
func TestGenericImportEndpoint(t *testing.T) {
	server, _ := newTestServer(t)
	inventoryID := testOwnerInventoryID(t, server.URL)

	data := genericSheetBytes(t, [][]any{
		apiGenericHeader,
		{"Microphones", "audio", "Shure SM58", "Dynamic vocal mic", 12, 120},
		{"Moving heads", "lighting", "Robe Pointe", "20/24ch", 8, 900},
	})
	status, raw := uploadInventoryFile(t, server.URL, inventoryID, "import-xlsx", "my-gear.xlsx", data)
	if status != http.StatusOK {
		t.Fatalf("import status = %d, body %s", status, raw)
	}
	result := decodeJSON[domain.InventoryImportResult](t, raw)
	if result.CategoriesImported != 2 || result.ItemsImported != 2 {
		t.Errorf("result = %+v, want 2 categories and 2 items", result)
	}

	// The inventory now reports the generic format, which is what makes the
	// frontend hide the price-list export button.
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/inventories/%d", server.URL, inventoryID), nil)
	if status != http.StatusOK {
		t.Fatalf("get inventory status = %d, body %s", status, raw)
	}
	inventory := decodeJSON[domain.Inventory](t, raw)
	if inventory.SourceFormat != domain.SourceFormatGeneric {
		t.Errorf("sourceFormat = %q, want %q", inventory.SourceFormat, domain.SourceFormatGeneric)
	}
	if inventory.SourceFilename != "my-gear.xlsx" {
		t.Errorf("sourceFilename = %q, want my-gear.xlsx", inventory.SourceFilename)
	}

	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/inventories/%d/items", server.URL, inventoryID), nil)
	if status != http.StatusOK {
		t.Fatalf("list items status = %d, body %s", status, raw)
	}
	items := decodeJSON[[]domain.InventoryItem](t, raw)
	if len(items) != 2 {
		t.Fatalf("items = %d, want 2", len(items))
	}
	for _, item := range items {
		if item.IsManual {
			t.Errorf("imported item %q reported is_manual = true", item.Name)
		}
	}
}

// A bad file is the user's to fix, so it must come back as a 400 naming the
// offending rows — not a 500 — and must leave the catalog untouched
// (FR-005, SC-003).
func TestGenericImportValidationFailureIsA400AndChangesNothing(t *testing.T) {
	server, _ := newTestServer(t)
	inventoryID := testOwnerInventoryID(t, server.URL)

	good := genericSheetBytes(t, [][]any{
		apiGenericHeader,
		{"Microphones", "audio", "Shure SM58", "", 12, 120},
	})
	if status, raw := uploadInventoryFile(t, server.URL, inventoryID, "import-xlsx", "good.xlsx", good); status != http.StatusOK {
		t.Fatalf("seed import status = %d, body %s", status, raw)
	}

	bad := genericSheetBytes(t, [][]any{
		apiGenericHeader,
		{"Microphones", "audio", "Shure SM58", "", 12, 120},
		{"", "audio", "Orphan", "", 1, 10},
		{"Moving heads", "lights", "Robe Pointe", "", 8, 900},
	})
	status, raw := uploadInventoryFile(t, server.URL, inventoryID, "import-xlsx", "bad.xlsx", bad)
	if status != http.StatusBadRequest {
		t.Fatalf("bad import status = %d, want 400; body %s", status, raw)
	}
	message := string(raw)
	for _, want := range []string{"row 3", "row 4"} {
		if !strings.Contains(message, want) {
			t.Errorf("error %s does not name %s", message, want)
		}
	}

	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/inventories/%d/items", server.URL, inventoryID), nil)
	if status != http.StatusOK {
		t.Fatalf("list items status = %d", status)
	}
	items := decodeJSON[[]domain.InventoryItem](t, raw)
	if len(items) != 1 || items[0].Name != "Shure SM58" {
		t.Errorf("rejected import changed the catalog: %+v", items)
	}
}

func TestGenericImportRequiresFileField(t *testing.T) {
	server, _ := newTestServer(t)
	inventoryID := testOwnerInventoryID(t, server.URL)

	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/inventories/%d/import-xlsx", server.URL, inventoryID), nil)
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body %s", status, raw)
	}
}

// TestInventoryTemplateDownload checks the blank template is served as a
// real spreadsheet the browser will save, and that what comes down the wire
// is importable — the end-to-end half of the drift guard.
func TestInventoryTemplateDownload(t *testing.T) {
	server, _ := newTestServer(t)

	response, err := httpClient.Get(server.URL + "/inventory-template.xlsx")
	if err != nil {
		t.Fatalf("download template: %v", err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", response.StatusCode)
	}
	if got := response.Header.Get("Content-Type"); got != xlsxContentType {
		t.Errorf("Content-Type = %q, want %q", got, xlsxContentType)
	}
	disposition := response.Header.Get("Content-Disposition")
	if !strings.HasPrefix(disposition, "attachment;") || !strings.Contains(disposition, "template") {
		t.Errorf("Content-Disposition = %q, want an attachment named as a template", disposition)
	}

	file, err := excelize.OpenReader(response.Body)
	if err != nil {
		t.Fatalf("downloaded template is not a readable workbook: %v", err)
	}
	defer func() { _ = file.Close() }()
	sheets := file.GetSheetList()
	if len(sheets) != 2 || sheets[0] != "Inventory" {
		t.Errorf("sheets = %v, want [Inventory Example]", sheets)
	}
	rows, err := file.GetRows("Inventory")
	if err != nil || len(rows) == 0 {
		t.Fatalf("template Inventory sheet unreadable: rows=%d err=%v", len(rows), err)
	}
	header := strings.Join(rows[0], "|")
	for _, want := range []string{"Category", "Type", "Name", "Quantity"} {
		if !strings.Contains(header, want) {
			t.Errorf("template header %q missing %q", header, want)
		}
	}
}

// The template is behind auth like everything else; an anonymous client
// must not be able to pull it.
func TestInventoryTemplateRequiresAuth(t *testing.T) {
	server, _ := newTestServer(t)

	request, err := http.NewRequest(http.MethodGet, server.URL+"/inventory-template.xlsx", nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	response, err := (&http.Client{}).Do(request) // no session cookie jar
	if err != nil {
		t.Fatalf("request template: %v", err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusUnauthorized {
		t.Errorf("anonymous template download status = %d, want 401", response.StatusCode)
	}
}
