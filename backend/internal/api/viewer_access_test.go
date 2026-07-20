package api

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/trionell/patchplanner/internal/db"
)

// TestViewerBlockedAcrossHandlerFamilies verifies research.md R2/R4's claim
// that RequireEventAccess's 403 (unit-tested in isolation in
// api/middleware/event_access_test.go) actually holds when wired in front
// of real handlers of different kinds, not just the middleware's own
// synthetic test handler. GET must keep working throughout (FR-006 —
// viewing/printing/exporting is not blocked).
func TestViewerBlockedAcrossHandlerFamilies(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)

	owner, err := db.UpsertUserByGoogleSub(database, "test-google-sub", "test@example.com", "Test User", "")
	if err != nil {
		t.Fatalf("look up seeded owner: %v", err)
	}
	viewer, err := db.UpsertUserByGoogleSub(database, "viewer-sub", "viewer@example.com", "Viewer", "")
	if err != nil {
		t.Fatalf("seed viewer: %v", err)
	}
	if err := db.UpsertEventMembership(database, eventID, viewer.ID, "viewer", owner.ID); err != nil {
		t.Fatalf("invite viewer: %v", err)
	}
	viewerToken, err := db.CreateSession(database, viewer.ID, time.Hour)
	if err != nil {
		t.Fatalf("create viewer session: %v", err)
	}
	viewerClient := clientForSession(t, server.URL, viewerToken)

	mutations := []struct {
		name   string
		method string
		path   string
	}{
		{"audio_patch: create stagebox", http.MethodPost, fmt.Sprintf("/events/%d/stageboxes", eventID)},
		{"lighting: create fixture", http.MethodPost, fmt.Sprintf("/events/%d/lighting-rigs/1/fixtures", eventID)},
		{"rental: put manual line", http.MethodPut, fmt.Sprintf("/events/%d/rentals/manual/1", eventID)},
		{"stage_plots: create plot", http.MethodPost, fmt.Sprintf("/events/%d/stage-plots", eventID)},
	}
	for _, m := range mutations {
		t.Run(m.name, func(t *testing.T) {
			req, err := http.NewRequest(m.method, server.URL+m.path, nil)
			if err != nil {
				t.Fatalf("build request: %v", err)
			}
			resp, err := viewerClient.Do(req)
			if err != nil {
				t.Fatalf("do request: %v", err)
			}
			defer func() { _ = resp.Body.Close() }()
			if resp.StatusCode != http.StatusForbidden {
				t.Errorf("status = %d, want 403", resp.StatusCode)
			}
			var body struct {
				Error string `json:"error"`
			}
			if err := decodeBody(t, resp, &body); err != nil {
				t.Fatalf("decode error body: %v", err)
			}
			if body.Error == "" {
				t.Error("expected a clear error message in the 403 body")
			}
		})
	}

	// A representative GET (rental summary — a different handler family
	// than any of the blocked mutations above) still succeeds for the
	// same viewer throughout.
	getResp, err := viewerClient.Get(fmt.Sprintf("%s/events/%d/rentals", server.URL, eventID))
	if err != nil {
		t.Fatalf("viewer get rental summary: %v", err)
	}
	defer func() { _ = getResp.Body.Close() }()
	if getResp.StatusCode != http.StatusOK {
		t.Errorf("viewer GET rental summary status = %d, want 200", getResp.StatusCode)
	}
}
