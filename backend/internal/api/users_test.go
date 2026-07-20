package api

import (
	"net/http"
	"testing"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

func TestListUsers(t *testing.T) {
	server, database := newTestServer(t)
	if _, err := db.UpsertUserByGoogleSub(database, "other-sub", "other@example.com", "Other Person", "https://example.com/pic.jpg"); err != nil {
		t.Fatalf("seed second user: %v", err)
	}

	status, raw := doJSON(t, http.MethodGet, server.URL+"/users", nil)
	if status != http.StatusOK {
		t.Fatalf("list users: status %d", status)
	}
	users := decodeJSON[[]domain.User](t, raw)
	if len(users) != 2 {
		t.Fatalf("users = %d, want 2 (the seeded test owner + the second user)", len(users))
	}

	var found bool
	for _, u := range users {
		if u.Email == "other@example.com" {
			found = true
			if u.Name != "Other Person" || u.PictureURL != "https://example.com/pic.jpg" {
				t.Errorf("user shape: %+v", u)
			}
		}
	}
	if !found {
		t.Error("second user missing from the list")
	}
}
