package api

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
)

// The audio export sits on the event router, behind the same
// RequireEventAccess middleware as every other event read. These cases are
// about that: who gets the document, and what happens when there is nothing to
// document.

func TestAudioExportPDF(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)

	response, err := httpClient.Get(fmt.Sprintf("%s/events/%d/audio-export/pdf", server.URL, eventID))
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
	if !strings.Contains(disposition, "audio") {
		t.Errorf("content disposition = %q, does not name the document", disposition)
	}

	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if !bytes.HasPrefix(body, []byte("%PDF-")) {
		t.Fatalf("body is not a PDF: % x", body[:8])
	}
}

// An event with nothing planned still produces a document — its sections say
// they hold nothing rather than being absent.
func TestAudioExportPDFEmptyEvent(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)

	response, err := httpClient.Get(fmt.Sprintf("%s/events/%d/audio-export/pdf", server.URL, eventID))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = response.Body.Close() }()

	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200 for an event with nothing planned", response.StatusCode)
	}
	body, _ := io.ReadAll(response.Body)
	if !bytes.HasPrefix(body, []byte("%PDF-")) {
		t.Error("no document for an event with nothing planned")
	}
}

func TestAudioExportPDFUnknownEvent(t *testing.T) {
	server, _ := newTestServer(t)

	response, err := httpClient.Get(server.URL + "/events/99999/audio-export/pdf")
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = response.Body.Close() }()

	if response.StatusCode == http.StatusOK {
		t.Error("an unknown event returned a document")
	}
}
