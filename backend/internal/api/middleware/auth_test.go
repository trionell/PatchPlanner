package middleware

import (
	"database/sql"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/trionell/patchplanner/internal/db"
)

func openTestDB(t *testing.T) *sql.DB {
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

func TestRequireAuth(t *testing.T) {
	database := openTestDB(t)
	user, err := db.UpsertUserByGoogleSub(database, "sub-1", "person@example.com", "Person", "")
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}
	validToken, err := db.CreateSession(database, user.ID, time.Hour)
	if err != nil {
		t.Fatalf("seed session: %v", err)
	}
	expiredToken, err := db.CreateSession(database, user.ID, -time.Minute)
	if err != nil {
		t.Fatalf("seed expired session: %v", err)
	}

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := UserFromContext(r.Context())
		if !ok {
			http.Error(w, "no user in context", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(user.Email))
	})
	handler := RequireAuth(database)(inner)
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	cases := []struct {
		name       string
		cookie     *http.Cookie
		wantStatus int
	}{
		{"no cookie", nil, http.StatusUnauthorized},
		{"garbage cookie", &http.Cookie{Name: SessionCookieName, Value: "not-a-real-token"}, http.StatusUnauthorized},
		{"expired session", &http.Cookie{Name: SessionCookieName, Value: expiredToken}, http.StatusUnauthorized},
		{"valid session", &http.Cookie{Name: SessionCookieName, Value: validToken}, http.StatusOK},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequest(http.MethodGet, server.URL, nil)
			if err != nil {
				t.Fatalf("build request: %v", err)
			}
			if tc.cookie != nil {
				req.AddCookie(tc.cookie)
			}
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatalf("do request: %v", err)
			}
			defer func() { _ = resp.Body.Close() }()
			if resp.StatusCode != tc.wantStatus {
				t.Errorf("status = %d, want %d", resp.StatusCode, tc.wantStatus)
			}
		})
	}
}
