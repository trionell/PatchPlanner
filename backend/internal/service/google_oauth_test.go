package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"golang.org/x/oauth2"
)

// fakeGoogle stands in for Google's token and userinfo endpoints so tests
// never dial the real network; the oauth2.Config's Endpoint field is just
// URLs, trivially overridable.
func fakeGoogle(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token": "fake-access-token",
			"token_type":   "Bearer",
			"expires_in":   3600,
		})
	})
	mux.HandleFunc("/userinfo", func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer fake-access-token" {
			http.Error(w, "missing bearer token", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"id":      "google-sub-123",
			"email":   "person@example.com",
			"name":    "Person Name",
			"picture": "https://example.com/pic.jpg",
		})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func newTestProvider(server *httptest.Server) *GoogleIdentityProvider {
	return &GoogleIdentityProvider{
		config: &oauth2.Config{
			ClientID:     "test-client",
			ClientSecret: "test-secret",
			RedirectURL:  "http://localhost/api/v1/auth/google/callback",
			Scopes:       []string{"openid", "email", "profile"},
			Endpoint: oauth2.Endpoint{
				AuthURL:  server.URL + "/auth",
				TokenURL: server.URL + "/token",
			},
		},
		userInfoURL: server.URL + "/userinfo",
	}
}

func TestGoogleIdentityProviderExchange(t *testing.T) {
	server := fakeGoogle(t)
	provider := newTestProvider(server)

	profile, err := provider.Exchange(context.Background(), "test-code")
	if err != nil {
		t.Fatalf("exchange: %v", err)
	}
	if profile.Sub != "google-sub-123" || profile.Email != "person@example.com" ||
		profile.Name != "Person Name" || profile.PictureURL != "https://example.com/pic.jpg" {
		t.Errorf("unexpected profile: %+v", profile)
	}
}

func TestGoogleIdentityProviderAuthCodeURL(t *testing.T) {
	server := fakeGoogle(t)
	provider := newTestProvider(server)

	url := provider.AuthCodeURL("test-state")
	if !strings.HasPrefix(url, server.URL+"/auth") {
		t.Errorf("expected AuthCodeURL to target the configured endpoint, got %q", url)
	}
	if !strings.Contains(url, "state=test-state") {
		t.Errorf("expected state param in %q", url)
	}
	if !strings.Contains(url, "client_id=test-client") {
		t.Errorf("expected client_id param in %q", url)
	}
}
