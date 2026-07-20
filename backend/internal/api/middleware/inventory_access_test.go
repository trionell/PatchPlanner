package middleware

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/trionell/patchplanner/internal/db"
)

func TestRequireInventoryOwner(t *testing.T) {
	database := openEventTestDB(t)
	owner, _ := db.UpsertUserByGoogleSub(database, "owner-sub", "owner@example.com", "Owner", "")
	stranger, _ := db.UpsertUserByGoogleSub(database, "stranger-sub", "stranger@example.com", "Stranger", "")

	inventory, err := db.CreateInventory(database, owner.ID, "My Inventory")
	if err != nil {
		t.Fatalf("create inventory: %v", err)
	}

	sessionFor := func(userID int64) string {
		token, err := db.CreateSession(database, userID, time.Hour)
		if err != nil {
			t.Fatalf("create session: %v", err)
		}
		return token
	}
	ownerToken := sessionFor(owner.ID)
	strangerToken := sessionFor(stranger.ID)

	r := chi.NewRouter()
	r.Route("/inventories/{inventoryID}", func(ir chi.Router) {
		ir.Use(RequireAuth(database))
		ir.Use(RequireInventoryOwner(database))
		ir.Get("/ping", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
		ir.Post("/ping", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	})
	server := httptest.NewServer(r)
	t.Cleanup(server.Close)

	base := server.URL + "/inventories/" + strconv.FormatInt(inventory.ID, 10) + "/ping"
	missingBase := server.URL + "/inventories/999999/ping"

	cases := []struct {
		name       string
		method     string
		url        string
		token      string
		wantStatus int
	}{
		{"owner GET", http.MethodGet, base, ownerToken, http.StatusOK},
		{"owner POST", http.MethodPost, base, ownerToken, http.StatusOK},
		{"stranger GET not found", http.MethodGet, base, strangerToken, http.StatusNotFound},
		{"stranger POST not found", http.MethodPost, base, strangerToken, http.StatusNotFound},
		{"nonexistent inventory 404", http.MethodGet, missingBase, ownerToken, http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := doWithCookie(t, tc.method, tc.url, tc.token); got != tc.wantStatus {
				t.Errorf("status = %d, want %d", got, tc.wantStatus)
			}
		})
	}
}
