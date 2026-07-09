package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/trionell/patchplanner/internal/db"
)

// newTestServer boots the real router on a fresh migrated database.
func newTestServer(t *testing.T) (*httptest.Server, *sql.DB) {
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
	server := httptest.NewServer(NewRouter(database))
	t.Cleanup(func() {
		server.Close()
		_ = database.Close()
	})
	return server, database
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
	response, err := http.DefaultClient.Do(request)
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
