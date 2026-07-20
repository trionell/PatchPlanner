package middleware

import (
	"database/sql"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"runtime"
	"strconv"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

func openEventTestDB(t *testing.T) *sql.DB {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot resolve caller path")
	}
	migrations := filepath.Join(filepath.Dir(thisFile), "..", "..", "..", "migrations")
	database, err := db.Open(filepath.Join(t.TempDir(), "test.db"), migrations, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	return database
}

// newEventTestServer wires RequireAuth (so a user lands in context, as it
// always will in production) followed by RequireEventAccess in front of a
// trivial 200 handler at /events/{eventID}/ping.
func newEventTestServer(t *testing.T, database *sql.DB) *httptest.Server {
	t.Helper()
	r := chi.NewRouter()
	r.Route("/events/{eventID}", func(er chi.Router) {
		er.Use(RequireAuth(database))
		er.Use(RequireEventAccess(database))
		er.Get("/ping", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
		er.Post("/ping", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	})
	server := httptest.NewServer(r)
	t.Cleanup(server.Close)
	return server
}

func doWithCookie(t *testing.T, method, url, token string) int {
	t.Helper()
	req, err := http.NewRequest(method, url, nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	req.AddCookie(&http.Cookie{Name: SessionCookieName, Value: token})
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	return resp.StatusCode
}

func TestRequireEventAccess(t *testing.T) {
	database := openEventTestDB(t)
	owner, _ := db.UpsertUserByGoogleSub(database, "owner-sub", "owner@example.com", "Owner", "")
	contributor, _ := db.UpsertUserByGoogleSub(database, "contributor-sub", "contributor@example.com", "Contributor", "")
	viewer, _ := db.UpsertUserByGoogleSub(database, "viewer-sub", "viewer@example.com", "Viewer", "")
	stranger, _ := db.UpsertUserByGoogleSub(database, "stranger-sub", "stranger@example.com", "Stranger", "")

	event, err := db.CreateEvent(database, domain.Event{Name: "Gig"}, owner.ID)
	if err != nil {
		t.Fatalf("create event: %v", err)
	}
	if err := db.UpsertEventMembership(database, event.ID, contributor.ID, "contributor", owner.ID); err != nil {
		t.Fatalf("invite contributor: %v", err)
	}
	if err := db.UpsertEventMembership(database, event.ID, viewer.ID, "viewer", owner.ID); err != nil {
		t.Fatalf("invite viewer: %v", err)
	}

	sessionFor := func(userID int64) string {
		token, err := db.CreateSession(database, userID, time.Hour)
		if err != nil {
			t.Fatalf("create session: %v", err)
		}
		return token
	}
	ownerToken := sessionFor(owner.ID)
	contributorToken := sessionFor(contributor.ID)
	viewerToken := sessionFor(viewer.ID)
	strangerToken := sessionFor(stranger.ID)

	server := newEventTestServer(t, database)
	base := server.URL + "/events/" + strconv.FormatInt(event.ID, 10) + "/ping"
	missingEventBase := server.URL + "/events/999999/ping"

	cases := []struct {
		name       string
		method     string
		url        string
		token      string
		wantStatus int
	}{
		{"owner GET", http.MethodGet, base, ownerToken, http.StatusOK},
		{"owner POST", http.MethodPost, base, ownerToken, http.StatusOK},
		{"contributor GET", http.MethodGet, base, contributorToken, http.StatusOK},
		{"contributor POST", http.MethodPost, base, contributorToken, http.StatusOK},
		{"viewer GET", http.MethodGet, base, viewerToken, http.StatusOK},
		{"viewer POST forbidden", http.MethodPost, base, viewerToken, http.StatusForbidden},
		{"stranger GET not found", http.MethodGet, base, strangerToken, http.StatusNotFound},
		{"nonexistent event 404", http.MethodGet, missingEventBase, ownerToken, http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := doWithCookie(t, tc.method, tc.url, tc.token); got != tc.wantStatus {
				t.Errorf("status = %d, want %d", got, tc.wantStatus)
			}
		})
	}
}
