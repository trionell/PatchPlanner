package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

// Profile is the subset of a Google account's profile this app needs.
type Profile struct {
	Sub        string
	Email      string
	Name       string
	PictureURL string
}

// IdentityProvider abstracts the OAuth code-exchange dance so handler
// tests can substitute a fake implementation that never dials Google.
type IdentityProvider interface {
	AuthCodeURL(state string) string
	Exchange(ctx context.Context, code string) (Profile, error)
}

const defaultGoogleUserInfoURL = "https://www.googleapis.com/oauth2/v2/userinfo"

// GoogleIdentityProvider exchanges an OAuth 2.0 authorization code for a
// Google profile via the standard authorization-code flow. It does not
// verify an ID token's signature: the code exchange itself is an
// authenticated, TLS-protected, client-secret-backed server-to-server
// call, so Google already vouches for the profile it returns over that
// channel (research.md R1).
type GoogleIdentityProvider struct {
	config      *oauth2.Config
	userInfoURL string
}

func NewGoogleIdentityProvider(clientID, clientSecret, redirectURL string) *GoogleIdentityProvider {
	return &GoogleIdentityProvider{
		config: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURL,
			Scopes:       []string{"openid", "email", "profile"},
			Endpoint:     google.Endpoint,
		},
		userInfoURL: defaultGoogleUserInfoURL,
	}
}

func (p *GoogleIdentityProvider) AuthCodeURL(state string) string {
	return p.config.AuthCodeURL(state)
}

func (p *GoogleIdentityProvider) Exchange(ctx context.Context, code string) (Profile, error) {
	token, err := p.config.Exchange(ctx, code)
	if err != nil {
		return Profile{}, fmt.Errorf("exchange code: %w", err)
	}

	client := p.config.Client(ctx, token)
	resp, err := client.Get(p.userInfoURL)
	if err != nil {
		return Profile{}, fmt.Errorf("fetch userinfo: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return Profile{}, fmt.Errorf("fetch userinfo: unexpected status %d", resp.StatusCode)
	}

	var body struct {
		ID      string `json:"id"`
		Email   string `json:"email"`
		Name    string `json:"name"`
		Picture string `json:"picture"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return Profile{}, fmt.Errorf("decode userinfo: %w", err)
	}

	return Profile{
		Sub:        body.ID,
		Email:      body.Email,
		Name:       body.Name,
		PictureURL: body.Picture,
	}, nil
}
