package api

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
	"github.com/xuri/excelize/v2"
)

// writeExportFixture creates a minimal price list in the renter's layout and
// returns its path. Rows: 1 header, 2 category, 3 item ("Shure SM58").
func writeExportFixture(t *testing.T) string {
	t.Helper()
	const sheet = "Prislista LL"
	file := excelize.NewFile()
	if _, err := file.NewSheet(sheet); err != nil {
		t.Fatalf("create sheet: %v", err)
	}
	rows := [][]any{
		{"Beskrivning", "Kommentar", "Tot. Antal", "Ex Moms", "Ink Moms", "Antal Ljud", "Antal Ljus"},
		{"Mikrofoner:"},
		{"Shure SM58", "Dynamisk", 4, 150},
	}
	for i, row := range rows {
		cellName, err := excelize.CoordinatesToCellName(1, i+1)
		if err != nil {
			t.Fatalf("cell name: %v", err)
		}
		if err := file.SetSheetRow(sheet, cellName, &row); err != nil {
			t.Fatalf("write row: %v", err)
		}
	}
	path := filepath.Join(t.TempDir(), "LL.xlsx")
	if err := file.SaveAs(path); err != nil {
		t.Fatalf("save fixture: %v", err)
	}
	return path
}

// TestRentalExportEndpoints covers the download and report contracts.
func TestRentalExportEndpoints(t *testing.T) {
	server, database := newTestServer(t)
	t.Setenv("INVENTORY_PATH", writeExportFixture(t))

	// Import the fixture through the API so xlsx_row positions are recorded.
	if status, raw := doJSON(t, http.MethodPost, server.URL+"/inventory/import-xlsx", nil); status != http.StatusOK {
		t.Fatalf("import: status %d body %s", status, raw)
	}
	eventID := seedEvent(t, server.URL)
	var micID int64
	if err := database.QueryRow(`SELECT id FROM inventory_items WHERE name = 'Shure SM58'`).Scan(&micID); err != nil {
		t.Fatalf("find mic: %v", err)
	}
	if status, raw := doJSON(t, http.MethodPut, fmt.Sprintf("%s/events/%d/rentals/manual/%d", server.URL, eventID, micID), domain.ManualRentalRequest{QuantityAudio: 2}); status != http.StatusOK {
		t.Fatalf("manual line: status %d body %s", status, raw)
	}

	// Report endpoint.
	status, raw := doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/rental-export/report", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("report: status %d body %s", status, raw)
	}
	report := decodeJSON[domain.RentalExportReport](t, raw)
	if report.PlacedLines != 1 || len(report.UnplacedLines) != 0 {
		t.Errorf("report: %+v, want 1 placed / none unplaced", report)
	}
	if !strings.HasPrefix(report.Filename, "Hyrorder - ") || !strings.HasSuffix(report.Filename, ".xlsx") {
		t.Errorf("filename: %q", report.Filename)
	}

	// Download endpoint: headers + a readable workbook with the quantity.
	response, err := httpClient.Get(fmt.Sprintf("%s/events/%d/rental-export", server.URL, eventID))
	if err != nil {
		t.Fatalf("download: %v", err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("download: status %d", response.StatusCode)
	}
	if got := response.Header.Get("Content-Type"); got != xlsxContentType {
		t.Errorf("content type: %q", got)
	}
	if got := response.Header.Get("Content-Disposition"); !strings.Contains(got, "attachment") || !strings.Contains(got, "Hyrorder") {
		t.Errorf("content disposition: %q", got)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	workbook, err := excelize.OpenReader(bytes.NewReader(body))
	if err != nil {
		t.Fatalf("exported body is not a workbook: %v", err)
	}
	defer func() { _ = workbook.Close() }()
	quantity, err := workbook.GetCellValue("Prislista LL", "F3", excelize.Options{RawCellValue: true})
	if err != nil {
		t.Fatalf("read quantity cell: %v", err)
	}
	if quantity != "2" {
		t.Errorf("exported Antal Ljud = %q, want 2", quantity)
	}

	// Unplaced lines appear in the report (discontinue the mic).
	if _, err := database.Exec(`UPDATE inventory_items SET discontinued = 1 WHERE id = ?`, micID); err != nil {
		t.Fatalf("flag discontinued: %v", err)
	}
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/rental-export/report", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("report after discontinue: status %d body %s", status, raw)
	}
	report = decodeJSON[domain.RentalExportReport](t, raw)
	if len(report.UnplacedLines) != 1 || report.UnplacedLines[0].Reason != domain.UnplacedDiscontinued {
		t.Errorf("unplaced report: %+v", report.UnplacedLines)
	}

	// Error contract.
	if status, _ := doJSON(t, http.MethodGet, server.URL+"/events/99999/rental-export", nil); status != http.StatusNotFound {
		t.Errorf("unknown event: status %d, want 404", status)
	}
	t.Setenv("INVENTORY_PATH", filepath.Join(t.TempDir(), "missing.xlsx"))
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/rental-export", server.URL, eventID), nil)
	if status != http.StatusInternalServerError {
		t.Errorf("missing source: status %d body %s, want 500 JSON error", status, raw)
	}
	if !strings.Contains(string(raw), "error") {
		t.Errorf("missing source: body %s, want JSON error", raw)
	}
}
