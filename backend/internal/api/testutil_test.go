package api

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/trionell/patchplanner/internal/api/middleware"
	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/service"
)

// httpClient is used by doJSON for every request. newTestServer points it
// at a client whose cookie jar is preloaded with an authenticated test
// session, so every existing test transparently becomes authenticated with
// no per-file changes; no test in this package uses t.Parallel today, so a
// single package-level variable reset per newTestServer call is safe.
var httpClient = http.DefaultClient

// stubIdentityProvider satisfies service.IdentityProvider for tests that
// don't exercise the OAuth flow itself; auth_test.go uses its own
// configurable fake for that.
type stubIdentityProvider struct{}

func (stubIdentityProvider) AuthCodeURL(state string) string {
	return "https://accounts.google.test/auth?state=" + state
}

func (stubIdentityProvider) Exchange(context.Context, string) (service.Profile, error) {
	return service.Profile{}, errors.New("stub identity provider: Exchange not implemented")
}

func testAuthConfig() AuthConfig {
	return AuthConfig{
		Provider:      stubIdentityProvider{},
		AllowedEmails: []string{"test@example.com"},
		FrontendURL:   "http://localhost:5173",
		SessionTTL:    time.Hour,
	}
}

// openMigratedTestDB opens a fresh, fully-migrated SQLite database in a
// temp dir — the shared setup behind newTestServer, also used directly by
// auth_test.go to build its own router with a per-test AuthConfig.
func openMigratedTestDB(t *testing.T) *sql.DB {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot resolve caller path")
	}
	migrations := filepath.Join(filepath.Dir(thisFile), "..", "..", "migrations")
	database, err := db.Open(filepath.Join(t.TempDir(), "test.db"), migrations, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	return database
}

// newTestServer boots the real router on a fresh migrated database,
// authenticated by default as a seeded test user.
func newTestServer(t *testing.T) (*httptest.Server, *sql.DB) {
	t.Helper()
	database := openMigratedTestDB(t)
	server := httptest.NewServer(NewRouter(database, testAuthConfig()))
	t.Cleanup(server.Close)

	token := seedSession(t, database)
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("create cookie jar: %v", err)
	}
	serverURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse server url: %v", err)
	}
	jar.SetCookies(serverURL, []*http.Cookie{{Name: middleware.SessionCookieName, Value: token}})
	httpClient = &http.Client{Jar: jar}

	return server, database
}

// seedSession creates a signed-in test user and returns a valid session
// token for it.
func seedSession(t *testing.T, database *sql.DB) string {
	t.Helper()
	user, err := db.UpsertUserByGoogleSub(database, "test-google-sub", "test@example.com", "Test User", "")
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}
	token, err := db.CreateSession(database, user.ID, time.Hour)
	if err != nil {
		t.Fatalf("seed session: %v", err)
	}
	return token
}

// doJSON sends a request with a JSON body (or none) and returns the status
// code and raw response body.
func doJSON(t *testing.T, method, url string, payload any) (int, []byte) {
	t.Helper()
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal payload: %v", err)
		}
		body = bytes.NewReader(encoded)
	}
	request, err := http.NewRequest(method, url, body)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := httpClient.Do(request)
	if err != nil {
		t.Fatalf("%s %s: %v", method, url, err)
	}
	defer func() { _ = response.Body.Close() }()
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read response body: %v", err)
	}
	return response.StatusCode, raw
}

// jsonBody marshals payload for use directly with an http.Client call
// (e.g. client.Post(url, "application/json", jsonBody(t, payload))) —
// for requests made with a client other than the package-level
// httpClient, where doJSON isn't usable.
func jsonBody(t *testing.T, payload any) io.Reader {
	t.Helper()
	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	return bytes.NewReader(encoded)
}

// decodeBody reads and JSON-decodes an *http.Response directly, for
// responses obtained via a client other than the package-level httpClient.
func decodeBody(t *testing.T, response *http.Response, target any) error {
	t.Helper()
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read response body: %v", err)
	}
	return json.Unmarshal(raw, target)
}

func decodeJSON[T any](t *testing.T, raw []byte) T {
	t.Helper()
	var value T
	if err := json.Unmarshal(raw, &value); err != nil {
		t.Fatalf("decode response %s: %v", raw, err)
	}
	return value
}

func seedItem(t *testing.T, database *sql.DB, name string, quantity int, price float64) int64 {
	t.Helper()
	result, err := database.Exec(`INSERT INTO inventory_categories (name, category_type) VALUES (?, 'audio')`, name+" kategori")
	if err != nil {
		t.Fatalf("insert category: %v", err)
	}
	categoryID, _ := result.LastInsertId()
	result, err = database.Exec(`INSERT INTO inventory_items (category_id, name, quantity_available, price_ex_vat) VALUES (?, ?, ?, ?)`, categoryID, name, quantity, price)
	if err != nil {
		t.Fatalf("insert item: %v", err)
	}
	id, _ := result.LastInsertId()
	return id
}

// seedRoleItem inserts an item under a category carrying a picker_role
// ('cable' or 'stand'), reusing the category on repeated calls.
func seedRoleItem(t *testing.T, database *sql.DB, role, name, description string, quantity int, price float64) int64 {
	t.Helper()
	categoryName := role + " kategori"
	var categoryID int64
	err := database.QueryRow(`SELECT id FROM inventory_categories WHERE name = ?`, categoryName).Scan(&categoryID)
	if err == sql.ErrNoRows {
		result, insertErr := database.Exec(`INSERT INTO inventory_categories (name, category_type, picker_role) VALUES (?, 'audio', ?)`, categoryName, role)
		if insertErr != nil {
			t.Fatalf("insert role category: %v", insertErr)
		}
		categoryID, _ = result.LastInsertId()
	} else if err != nil {
		t.Fatalf("find role category: %v", err)
	}
	result, err := database.Exec(`INSERT INTO inventory_items (category_id, name, description, quantity_available, price_ex_vat) VALUES (?, ?, ?, ?, ?)`, categoryID, name, description, quantity, price)
	if err != nil {
		t.Fatalf("insert role item: %v", err)
	}
	id, _ := result.LastInsertId()
	return id
}

func seedEvent(t *testing.T, serverURL string) int64 {
	t.Helper()
	status, raw := doJSON(t, http.MethodPost, serverURL+"/events", map[string]string{"name": "API Test Event"})
	if status != http.StatusCreated {
		t.Fatalf("create event: status %d body %s", status, raw)
	}
	return decodeJSON[struct {
		ID int64 `json:"id"`
	}](t, raw).ID
}
