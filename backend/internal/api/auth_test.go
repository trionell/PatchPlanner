package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/trionell/patchplanner/internal/api/middleware"
	"github.com/trionell/patchplanner/internal/service"
)

// fakeIdentityProvider lets each test control exactly which profile (or
// error) the OAuth "exchange" step returns, without dialing Google.
type fakeIdentityProvider struct {
	profile service.Profile
	err     error
}

func (f fakeIdentityProvider) AuthCodeURL(state string) string {
	return "https://accounts.google.test/o/oauth2/auth?state=" + state
}

func (f fakeIdentityProvider) Exchange(context.Context, string) (service.Profile, error) {
	return f.profile, f.err
}

// newAuthTestServer boots the router with a configurable fake identity
// provider and allow-list, without the pre-authenticated session
// newTestServer seeds — these tests exercise the unauthenticated auth
// routes directly.
func newAuthTestServer(t *testing.T, provider service.IdentityProvider, allowedEmails []string) (*httptest.Server, *sql.DB) {
	t.Helper()
	database := openMigratedTestDB(t)
	config := AuthConfig{
		Provider:      provider,
		AllowedEmails: allowedEmails,
		FrontendURL:   "http://localhost:5173",
		SessionTTL:    time.Hour,
	}
	server := httptest.NewServer(NewRouter(database, config))
	t.Cleanup(server.Close)
	return server, database
}

// noRedirectClient never follows redirects, so tests can inspect the
// Location header and status code of the login/callback/logout responses
// directly; it still applies Set-Cookie headers to jar on every response,
// redirect or not, which is what lets the state and session cookies
// carry across the requests below.
func noRedirectClient(t *testing.T) *http.Client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("create cookie jar: %v", err)
	}
	return &http.Client{
		Jar: jar,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

func countUsersWithEmail(t *testing.T, database *sql.DB, email string) int {
	t.Helper()
	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM users WHERE email = ?`, email).Scan(&count); err != nil {
		t.Fatalf("count users: %v", err)
	}
	return count
}

func TestAuthLoginCallbackAllowedEmail(t *testing.T) {
	profile := service.Profile{Sub: "google-sub-1", Email: "person@example.com", Name: "Person", PictureURL: "https://example.com/pic.jpg"}
	server, database := newAuthTestServer(t, fakeIdentityProvider{profile: profile}, []string{"person@example.com"})
	client := noRedirectClient(t)

	// Step 1: GET /auth/google/login sets the CSRF state cookie and
	// redirects to the provider's consent screen.
	loginResp, err := client.Get(server.URL + "/auth/google/login")
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	defer func() { _ = loginResp.Body.Close() }()
	if loginResp.StatusCode != http.StatusFound {
		t.Fatalf("login status = %d, want 302", loginResp.StatusCode)
	}
	location, err := url.Parse(loginResp.Header.Get("Location"))
	if err != nil {
		t.Fatalf("parse location: %v", err)
	}
	state := location.Query().Get("state")
	if state == "" {
		t.Fatal("expected a non-empty state param")
	}

	// Step 2: GET /auth/google/callback with the matching state and a
	// fake code — the jar already carries the state cookie from step 1.
	callbackResp, err := client.Get(server.URL + "/auth/google/callback?code=fake-code&state=" + state)
	if err != nil {
		t.Fatalf("callback: %v", err)
	}
	defer func() { _ = callbackResp.Body.Close() }()
	if callbackResp.StatusCode != http.StatusFound {
		t.Fatalf("callback status = %d, want 302", callbackResp.StatusCode)
	}
	if got := callbackResp.Header.Get("Location"); got != "http://localhost:5173/" {
		t.Errorf("callback location = %q, want frontend root", got)
	}

	var sessionCookie *http.Cookie
	for _, c := range callbackResp.Cookies() {
		if c.Name == middleware.SessionCookieName {
			sessionCookie = c
		}
	}
	if sessionCookie == nil {
		t.Fatal("expected a session cookie to be set")
		return
	}
	if !sessionCookie.HttpOnly {
		t.Error("session cookie must be HttpOnly")
	}
	if sessionCookie.SameSite != http.SameSiteLaxMode {
		t.Errorf("session cookie SameSite = %v, want Lax", sessionCookie.SameSite)
	}
	if sessionCookie.Secure {
		t.Error("session cookie must not be Secure over plain HTTP")
	}

	if count := countUsersWithEmail(t, database, "person@example.com"); count != 1 {
		t.Errorf("expected exactly one user row, got %d", count)
	}

	// Step 3: GET /auth/me returns the signed-in user.
	meResp, err := client.Get(server.URL + "/auth/me")
	if err != nil {
		t.Fatalf("me: %v", err)
	}
	defer func() { _ = meResp.Body.Close() }()
	if meResp.StatusCode != http.StatusOK {
		t.Fatalf("me status = %d, want 200", meResp.StatusCode)
	}
	var body struct {
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := json.NewDecoder(meResp.Body).Decode(&body); err != nil {
		t.Fatalf("decode me response: %v", err)
	}
	if body.Email != "person@example.com" || body.Name != "Person" {
		t.Errorf("me response: %+v", body)
	}
}

func TestAuthCallbackStateMismatch(t *testing.T) {
	server, _ := newAuthTestServer(t, fakeIdentityProvider{}, []string{"person@example.com"})
	client := noRedirectClient(t)

	if _, err := client.Get(server.URL + "/auth/google/login"); err != nil {
		t.Fatalf("login: %v", err)
	}

	resp, err := client.Get(server.URL + "/auth/google/callback?code=fake-code&state=wrong-state")
	if err != nil {
		t.Fatalf("callback: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusFound {
		t.Fatalf("status = %d, want 302", resp.StatusCode)
	}
	if got := resp.Header.Get("Location"); !strings.Contains(got, "error=state_mismatch") {
		t.Errorf("location = %q, want a state_mismatch error", got)
	}
}

func TestAuthCallbackRejectsUnapprovedEmail(t *testing.T) {
	profile := service.Profile{Sub: "google-sub-2", Email: "stranger@example.com", Name: "Stranger"}
	server, database := newAuthTestServer(t, fakeIdentityProvider{profile: profile}, []string{"person@example.com"})
	client := noRedirectClient(t)

	loginResp, err := client.Get(server.URL + "/auth/google/login")
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	location, err := url.Parse(loginResp.Header.Get("Location"))
	if err != nil {
		t.Fatalf("parse location: %v", err)
	}
	state := location.Query().Get("state")

	resp, err := client.Get(server.URL + "/auth/google/callback?code=fake-code&state=" + state)
	if err != nil {
		t.Fatalf("callback: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusFound {
		t.Fatalf("status = %d, want 302", resp.StatusCode)
	}
	got := resp.Header.Get("Location")
	if !strings.Contains(got, "error=not_allowed") || !strings.Contains(got, url.QueryEscape("stranger@example.com")) {
		t.Errorf("location = %q, want a not_allowed error with the rejected email", got)
	}

	// FR-003: a rejected sign-in leaves no trace.
	if count := countUsersWithEmail(t, database, "stranger@example.com"); count != 0 {
		t.Errorf("expected no user row for a rejected email, got %d", count)
	}
	for _, c := range resp.Cookies() {
		if c.Name == middleware.SessionCookieName {
			t.Error("expected no session cookie to be set on rejection")
		}
	}
}

func TestAuthLogout(t *testing.T) {
	profile := service.Profile{Sub: "google-sub-3", Email: "person@example.com", Name: "Person"}
	server, _ := newAuthTestServer(t, fakeIdentityProvider{profile: profile}, []string{"person@example.com"})
	client := noRedirectClient(t)

	loginResp, err := client.Get(server.URL + "/auth/google/login")
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	location, err := url.Parse(loginResp.Header.Get("Location"))
	if err != nil {
		t.Fatalf("parse location: %v", err)
	}
	state := location.Query().Get("state")
	if _, err := client.Get(server.URL + "/auth/google/callback?code=fake-code&state=" + state); err != nil {
		t.Fatalf("callback: %v", err)
	}

	logoutResp, err := client.Post(server.URL+"/auth/logout", "", nil)
	if err != nil {
		t.Fatalf("logout: %v", err)
	}
	defer func() { _ = logoutResp.Body.Close() }()
	if logoutResp.StatusCode != http.StatusNoContent {
		t.Fatalf("logout status = %d, want 204", logoutResp.StatusCode)
	}

	meResp, err := client.Get(server.URL + "/auth/me")
	if err != nil {
		t.Fatalf("me after logout: %v", err)
	}
	defer func() { _ = meResp.Body.Close() }()
	if meResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("me after logout status = %d, want 401", meResp.StatusCode)
	}

	// Logging out again — or with no session at all — is not an error.
	repeatResp, err := client.Post(server.URL+"/auth/logout", "", nil)
	if err != nil {
		t.Fatalf("repeat logout: %v", err)
	}
	defer func() { _ = repeatResp.Body.Close() }()
	if repeatResp.StatusCode != http.StatusNoContent {
		t.Errorf("repeat logout status = %d, want 204", repeatResp.StatusCode)
	}

	freshClient := &http.Client{}
	noSessionResp, err := freshClient.Post(server.URL+"/auth/logout", "", nil)
	if err != nil {
		t.Fatalf("logout with no session: %v", err)
	}
	defer func() { _ = noSessionResp.Body.Close() }()
	if noSessionResp.StatusCode != http.StatusNoContent {
		t.Errorf("logout with no session status = %d, want 204", noSessionResp.StatusCode)
	}
}
