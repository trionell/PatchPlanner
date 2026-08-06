package api

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

// The stage plot document hangs off the plot, inside the event router, so
// RequireEventAccess already covers it. These cases are about who gets the
// document, and about the plot id not being a way to reach across events.

func createPlot(t *testing.T, serverURL string, eventID int64, name string) int64 {
	t.Helper()
	status, body := doJSON(t, http.MethodPost,
		fmt.Sprintf("%s/events/%d/stage-plots", serverURL, eventID),
		map[string]any{"name": name})
	if status != http.StatusCreated {
		t.Fatalf("create plot: status %d, body %s", status, body)
	}
	return decodeJSON[domain.StagePlot](t, body).ID
}

func plotExportURL(serverURL string, eventID, plotID int64) string {
	return fmt.Sprintf("%s/events/%d/stage-plots/%d/export/pdf", serverURL, eventID, plotID)
}

func TestStagePlotExportPDF(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	plotID := createPlot(t, server.URL, eventID, "Kyrkan")

	response, err := httpClient.Get(plotExportURL(server.URL, eventID, plotID))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = response.Body.Close() }()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("status = %d, body = %s", response.StatusCode, body)
	}
	if got := response.Header.Get("Content-Type"); !strings.Contains(got, "pdf") {
		t.Errorf("content type = %q, want a PDF", got)
	}
	disposition := response.Header.Get("Content-Disposition")
	if !strings.Contains(disposition, "attachment") {
		t.Errorf("content disposition = %q, want an attachment", disposition)
	}
	// The filename names the plot, because an event has several of them and a
	// download folder with four files called "Stage plot" helps nobody.
	if !strings.Contains(disposition, "Kyrkan") {
		t.Errorf("content disposition = %q, does not name the plot", disposition)
	}

	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if !bytes.HasPrefix(body, []byte("%PDF-")) {
		t.Fatalf("body is not a PDF: % x", body[:8])
	}
}

// A plot with nothing on it still produces its four sheets, each saying in
// words that the plot is empty.
func TestStagePlotExportPDFEmptyPlot(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	plotID := createPlot(t, server.URL, eventID, "Empty")

	response, err := httpClient.Get(plotExportURL(server.URL, eventID, plotID))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = response.Body.Close() }()

	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200 for a plot with nothing on it", response.StatusCode)
	}
	body, _ := io.ReadAll(response.Body)
	if !bytes.HasPrefix(body, []byte("%PDF-")) {
		t.Error("no document for a plot with nothing on it")
	}
}

// An export reads, and a viewer may read.
func TestStagePlotExportPDFViewerAndContributor(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	plotID := createPlot(t, server.URL, eventID, "Kyrkan")

	owner, err := db.UpsertUserByGoogleSub(database, "test-google-sub", "test@example.com", "Test User", "")
	if err != nil {
		t.Fatalf("look up seeded owner: %v", err)
	}

	for _, role := range []string{"viewer", "contributor"} {
		t.Run(role, func(t *testing.T) {
			user, err := db.UpsertUserByGoogleSub(database,
				"plot-"+role+"-sub", "plot-"+role+"@example.com", "Plot "+role, "")
			if err != nil {
				t.Fatalf("seed %s: %v", role, err)
			}
			if err := db.UpsertEventMembership(database, eventID, user.ID, role, owner.ID); err != nil {
				t.Fatalf("add %s: %v", role, err)
			}
			token, err := db.CreateSession(database, user.ID, time.Hour)
			if err != nil {
				t.Fatalf("session: %v", err)
			}

			response, err := clientForSession(t, server.URL, token).
				Get(plotExportURL(server.URL, eventID, plotID))
			if err != nil {
				t.Fatalf("request: %v", err)
			}
			defer func() { _ = response.Body.Close() }()

			if response.StatusCode != http.StatusOK {
				t.Errorf("status = %d, a %s could not read the plot", response.StatusCode, role)
			}
			body, _ := io.ReadAll(response.Body)
			if !bytes.HasPrefix(body, []byte("%PDF-")) {
				t.Errorf("a %s received no document", role)
			}
		})
	}
}

func TestStagePlotExportPDFStranger(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	plotID := createPlot(t, server.URL, eventID, "Kyrkan")

	stranger, err := db.UpsertUserByGoogleSub(database, "plot-stranger-sub", "plot-stranger@example.com", "Stranger", "")
	if err != nil {
		t.Fatalf("seed stranger: %v", err)
	}
	token, err := db.CreateSession(database, stranger.ID, time.Hour)
	if err != nil {
		t.Fatalf("create stranger session: %v", err)
	}

	response, err := clientForSession(t, server.URL, token).
		Get(plotExportURL(server.URL, eventID, plotID))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = response.Body.Close() }()

	if response.StatusCode == http.StatusOK {
		t.Errorf("status = %d, a non-member was given the document", response.StatusCode)
	}
	body, _ := io.ReadAll(response.Body)
	if bytes.HasPrefix(body, []byte("%PDF-")) {
		t.Error("a non-member received part of the document")
	}
}

// A plot id belonging to a different event is not a way in, even for someone
// who is a member of the event named in the path.
func TestStagePlotExportPDFPlotFromAnotherEvent(t *testing.T) {
	server, _ := newTestServer(t)
	mine := seedEvent(t, server.URL)
	theirs := seedEvent(t, server.URL)
	theirPlot := createPlot(t, server.URL, theirs, "Theirs")

	response, err := httpClient.Get(plotExportURL(server.URL, mine, theirPlot))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = response.Body.Close() }()

	if response.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404 for a plot belonging to another event", response.StatusCode)
	}
}

func TestStagePlotExportPDFUnknownPlot(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)

	response, err := httpClient.Get(plotExportURL(server.URL, eventID, 99999))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = response.Body.Close() }()

	if response.StatusCode == http.StatusOK {
		t.Error("an unknown plot returned a document")
	}
}

// Two plots on one event are two documents, each holding only its own plot.
func TestStagePlotExportPDFIsPerPlot(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	first := createPlot(t, server.URL, eventID, "Kyrkan")
	second := createPlot(t, server.URL, eventID, "Festlokal")

	get := func(plotID int64) (string, []byte) {
		response, err := httpClient.Get(plotExportURL(server.URL, eventID, plotID))
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer func() { _ = response.Body.Close() }()
		if response.StatusCode != http.StatusOK {
			t.Fatalf("status = %d", response.StatusCode)
		}
		body, _ := io.ReadAll(response.Body)
		return response.Header.Get("Content-Disposition"), body
	}

	firstDisposition, firstBody := get(first)
	secondDisposition, secondBody := get(second)

	if !strings.Contains(firstDisposition, "Kyrkan") || !strings.Contains(secondDisposition, "Festlokal") {
		t.Errorf("the two documents are not named for their plots: %q and %q", firstDisposition, secondDisposition)
	}
	if bytes.Equal(firstBody, secondBody) {
		t.Error("two plots returned the same document")
	}
}
