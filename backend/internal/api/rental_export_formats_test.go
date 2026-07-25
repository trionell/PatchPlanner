package api

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trionell/patchplanner/internal/db"
)

// getRaw fetches url with the authenticated test client and returns the
// status, body and headers — export routes serve files, not JSON, so
// doJSON is not usable.
func getRaw(t *testing.T, url string) (int, []byte, http.Header) {
	t.Helper()
	response, err := httpClient.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer func() { _ = response.Body.Close() }()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read %s: %v", url, err)
	}
	return response.StatusCode, body, response.Header
}

// TestExportGatingByInventoryFormat is the core of FR-022: the price-list
// export is offered only where it was earned, while the PDF and generic
// spreadsheet are available to every inventory.
func TestExportGatingByInventoryFormat(t *testing.T) {
	server, _ := newTestServer(t)
	inventoryID := testOwnerInventoryID(t, server.URL)
	eventID := seedEvent(t, server.URL)

	exportURL := fmt.Sprintf("%s/events/%d/rental-export", server.URL, eventID)

	// 1. A brand-new inventory has never been imported at all.
	status, body, _ := getRaw(t, exportURL)
	if status != http.StatusBadRequest {
		t.Errorf("LL export on a never-imported inventory: status %d, want 400; body %s", status, body)
	}
	if !strings.Contains(string(body), "not imported from an LL price list") {
		t.Errorf("error %s should explain why, and point at the other formats", body)
	}

	// The format-neutral exports work regardless.
	for _, route := range []string{"/rental-export/pdf", "/rental-export/xlsx"} {
		status, body, _ := getRaw(t, fmt.Sprintf("%s/events/%d%s", server.URL, eventID, route))
		if status != http.StatusOK {
			t.Errorf("%s on a never-imported inventory: status %d, want 200; body %s", route, status, body)
		}
	}

	// 2. Importing the generic format must not unlock the LL export.
	data := genericSheetBytes(t, [][]any{
		apiGenericHeader,
		{"Microphones", "audio", "Shure SM58", "", 12, 120},
	})
	if status, raw := uploadInventoryFile(t, server.URL, inventoryID, "import-xlsx", "gear.xlsx", data); status != http.StatusOK {
		t.Fatalf("generic import: status %d body %s", status, raw)
	}
	status, body, _ = getRaw(t, exportURL)
	if status != http.StatusBadRequest {
		t.Errorf("LL export after a generic import: status %d, want 400; body %s", status, body)
	}

	// 3. Importing an actual price list does unlock it.
	if status, raw := uploadInventoryXLSX(t, server.URL, inventoryID, writeExportFixture(t)); status != http.StatusOK {
		t.Fatalf("price-list import: status %d body %s", status, raw)
	}
	status, body, headers := getRaw(t, exportURL)
	if status != http.StatusOK {
		t.Fatalf("LL export after a price-list import: status %d, want 200; body %s", status, body)
	}
	if got := headers.Get("Content-Type"); got != xlsxContentType {
		t.Errorf("LL export Content-Type = %q, want %q", got, xlsxContentType)
	}
}

// TestRentalExportPDFRoute covers the download contract of the PDF export.
func TestRentalExportPDFRoute(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)

	status, body, headers := getRaw(t, fmt.Sprintf("%s/events/%d/rental-export/pdf", server.URL, eventID))
	if status != http.StatusOK {
		t.Fatalf("status %d, want 200; body %s", status, body)
	}
	if got := headers.Get("Content-Type"); got != pdfContentType {
		t.Errorf("Content-Type = %q, want %q", got, pdfContentType)
	}
	if !strings.HasPrefix(string(body), "%PDF-") {
		t.Errorf("body is not a PDF: %.20s", body)
	}
	disposition := headers.Get("Content-Disposition")
	if !strings.HasPrefix(disposition, "attachment;") || !strings.Contains(disposition, ".pdf") {
		t.Errorf("Content-Disposition = %q, want a .pdf attachment", disposition)
	}
	// RFC 5987 form is present so non-ASCII event names survive.
	if !strings.Contains(disposition, "filename*=UTF-8''") {
		t.Errorf("Content-Disposition = %q, missing the UTF-8 filename form", disposition)
	}
}

func TestRentalExportGenericXLSXRoute(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)

	status, body, headers := getRaw(t, fmt.Sprintf("%s/events/%d/rental-export/xlsx", server.URL, eventID))
	if status != http.StatusOK {
		t.Fatalf("status %d, want 200; body %s", status, body)
	}
	if got := headers.Get("Content-Type"); got != xlsxContentType {
		t.Errorf("Content-Type = %q, want %q", got, xlsxContentType)
	}
	disposition := headers.Get("Content-Disposition")
	// The " (lista)" suffix is what keeps this from overwriting the
	// price-list export in a downloads folder.
	if !strings.Contains(disposition, "lista") {
		t.Errorf("Content-Disposition = %q, want the (lista) disambiguator", disposition)
	}
}

// FR-033: viewers keep every export, including the two new ones.
func TestViewersCanUseTheNewExports(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)

	owner, err := db.UpsertUserByGoogleSub(database, "test-google-sub", "test@example.com", "Test User", "")
	if err != nil {
		t.Fatalf("look up seeded owner: %v", err)
	}
	viewer, err := db.UpsertUserByGoogleSub(database, "export-viewer-sub", "export-viewer@example.com", "Viewer", "")
	if err != nil {
		t.Fatalf("seed viewer: %v", err)
	}
	if err := db.UpsertEventMembership(database, eventID, viewer.ID, "viewer", owner.ID); err != nil {
		t.Fatalf("add viewer: %v", err)
	}
	token, err := db.CreateSession(database, viewer.ID, time.Hour)
	if err != nil {
		t.Fatalf("create viewer session: %v", err)
	}
	viewerClient := clientForSession(t, server.URL, token)

	for _, route := range []string{"/rental-export/pdf", "/rental-export/xlsx"} {
		response, err := viewerClient.Get(fmt.Sprintf("%s/events/%d%s", server.URL, eventID, route))
		if err != nil {
			t.Fatalf("viewer GET %s: %v", route, err)
		}
		_ = response.Body.Close()
		if response.StatusCode != http.StatusOK {
			t.Errorf("viewer %s: status %d, want 200 (export stays available to viewers)", route, response.StatusCode)
		}
	}
}

// A non-member must not learn that the event exists, on any export route.
func TestNonMemberCannotReachTheNewExports(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)

	stranger, err := db.UpsertUserByGoogleSub(database, "export-stranger-sub", "export-stranger@example.com", "Stranger", "")
	if err != nil {
		t.Fatalf("seed stranger: %v", err)
	}
	token, err := db.CreateSession(database, stranger.ID, time.Hour)
	if err != nil {
		t.Fatalf("create stranger session: %v", err)
	}
	strangerClient := clientForSession(t, server.URL, token)

	for _, route := range []string{"/rental-export/pdf", "/rental-export/xlsx", "/rental-export"} {
		response, err := strangerClient.Get(fmt.Sprintf("%s/events/%d%s", server.URL, eventID, route))
		if err != nil {
			t.Fatalf("stranger GET %s: %v", route, err)
		}
		_ = response.Body.Close()
		if response.StatusCode != http.StatusNotFound {
			t.Errorf("non-member %s: status %d, want 404", route, response.StatusCode)
		}
	}
}
