package api

import (
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"testing"
	"time"

	"github.com/trionell/patchplanner/internal/api/middleware"
	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

// clientForSession builds an http.Client authenticated as the given
// session token, independent of the package-level httpClient (which is
// always the seeded test owner) — needed here to verify what a specific
// invited person sees.
func clientForSession(t *testing.T, serverURL, token string) *http.Client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("create cookie jar: %v", err)
	}
	parsed, err := url.Parse(serverURL)
	if err != nil {
		t.Fatalf("parse server url: %v", err)
	}
	jar.SetCookies(parsed, []*http.Cookie{{Name: middleware.SessionCookieName, Value: token}})
	return &http.Client{Jar: jar}
}

func TestEventMembersInviteListUpdateRemove(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)

	invitee, err := db.UpsertUserByGoogleSub(database, "invitee-sub", "invitee@example.com", "Invitee", "")
	if err != nil {
		t.Fatalf("seed invitee: %v", err)
	}
	inviteeToken, err := db.CreateSession(database, invitee.ID, time.Hour)
	if err != nil {
		t.Fatalf("create invitee session: %v", err)
	}
	inviteeClient := clientForSession(t, server.URL, inviteeToken)

	// Inviting an unknown user fails, and inviting the owner is rejected —
	// neither should leave any trace.
	status, _ := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/members", server.URL, eventID), map[string]any{"userId": 999999, "role": "contributor"})
	if status != http.StatusBadRequest {
		t.Errorf("invite unknown user: status %d, want 400", status)
	}
	owner, err := db.UpsertUserByGoogleSub(database, "test-google-sub", "test@example.com", "Test User", "")
	if err != nil {
		t.Fatalf("look up seeded owner: %v", err)
	}
	status, _ = doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/members", server.URL, eventID), map[string]any{"userId": owner.ID, "role": "contributor"})
	if status != http.StatusBadRequest {
		t.Errorf("invite owner: status %d, want 400", status)
	}

	// Invite as contributor.
	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/members", server.URL, eventID), map[string]any{"userId": invitee.ID, "role": "contributor"})
	if status != http.StatusCreated {
		t.Fatalf("invite: status %d body %s", status, raw)
	}
	member := decodeJSON[domain.EventMembership](t, raw)
	if member.Role != "contributor" || member.Email != "invitee@example.com" {
		t.Errorf("invited member: %+v", member)
	}

	// Members list includes owner (first) and the invitee.
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/members", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("list members: status %d", status)
	}
	members := decodeJSON[[]domain.EventMembership](t, raw)
	if len(members) != 2 || members[0].Role != "owner" {
		t.Fatalf("members = %+v, want owner first + 1 collaborator", members)
	}

	// The invitee can now see and edit the event.
	getResp, err := inviteeClient.Get(fmt.Sprintf("%s/events/%d", server.URL, eventID))
	if err != nil {
		t.Fatalf("invitee get event: %v", err)
	}
	defer func() { _ = getResp.Body.Close() }()
	if getResp.StatusCode != http.StatusOK {
		t.Errorf("invitee get event status = %d, want 200", getResp.StatusCode)
	}

	listResp, err := inviteeClient.Get(server.URL + "/events")
	if err != nil {
		t.Fatalf("invitee list events: %v", err)
	}
	defer func() { _ = listResp.Body.Close() }()
	var events []domain.Event
	if err := decodeBody(t, listResp, &events); err != nil {
		t.Fatalf("decode events: %v", err)
	}
	found := false
	for _, e := range events {
		if e.ID == eventID {
			found = true
			if e.YourRole != "contributor" {
				t.Errorf("invitee's role = %q, want contributor", e.YourRole)
			}
		}
	}
	if !found {
		t.Error("invited event missing from invitee's own event list")
	}

	// Change role to viewer.
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/events/%d/members/%d", server.URL, eventID, invitee.ID), map[string]string{"role": "viewer"})
	if status != http.StatusOK {
		t.Fatalf("update role: status %d body %s", status, raw)
	}
	updated := decodeJSON[domain.EventMembership](t, raw)
	if updated.Role != "viewer" {
		t.Errorf("updated role = %q, want viewer", updated.Role)
	}

	// PATCH/DELETE targeting the owner is rejected.
	status, _ = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/events/%d/members/%d", server.URL, eventID, owner.ID), map[string]string{"role": "viewer"})
	if status != http.StatusBadRequest {
		t.Errorf("patch owner: status %d, want 400", status)
	}
	status, _ = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/events/%d/members/%d", server.URL, eventID, owner.ID), nil)
	if status != http.StatusBadRequest {
		t.Errorf("delete owner: status %d, want 400", status)
	}

	// Remove the invitee; their next request against the event 404s
	// (FR-008/FR-010 — access ends immediately, event becomes invisible).
	status, _ = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/events/%d/members/%d", server.URL, eventID, invitee.ID), nil)
	if status != http.StatusNoContent {
		t.Fatalf("remove member: status %d, want 204", status)
	}
	afterRemoveResp, err := inviteeClient.Get(fmt.Sprintf("%s/events/%d", server.URL, eventID))
	if err != nil {
		t.Fatalf("invitee get event after removal: %v", err)
	}
	defer func() { _ = afterRemoveResp.Body.Close() }()
	if afterRemoveResp.StatusCode != http.StatusNotFound {
		t.Errorf("removed invitee's status = %d, want 404", afterRemoveResp.StatusCode)
	}

	// Removing again is idempotent.
	status, _ = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/events/%d/members/%d", server.URL, eventID, invitee.ID), nil)
	if status != http.StatusNoContent {
		t.Errorf("repeat remove: status %d, want 204", status)
	}
}

func TestEventMembersContributorCanInviteAndManage(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)

	owner, err := db.UpsertUserByGoogleSub(database, "test-google-sub", "test@example.com", "Test User", "")
	if err != nil {
		t.Fatalf("look up seeded owner: %v", err)
	}
	contributor, err := db.UpsertUserByGoogleSub(database, "contributor-sub", "contributor@example.com", "Contributor", "")
	if err != nil {
		t.Fatalf("seed contributor: %v", err)
	}
	if err := db.UpsertEventMembership(database, eventID, contributor.ID, "contributor", owner.ID); err != nil {
		t.Fatalf("make contributor a member: %v", err)
	}
	contributorToken, err := db.CreateSession(database, contributor.ID, time.Hour)
	if err != nil {
		t.Fatalf("create contributor session: %v", err)
	}
	contributorClient := clientForSession(t, server.URL, contributorToken)

	newPerson, err := db.UpsertUserByGoogleSub(database, "new-person-sub", "newperson@example.com", "New Person", "")
	if err != nil {
		t.Fatalf("seed new person: %v", err)
	}

	// A contributor, not just the owner, can invite (FR-005).
	inviteResp, err := contributorClient.Post(
		fmt.Sprintf("%s/events/%d/members", server.URL, eventID),
		"application/json",
		jsonBody(t, map[string]any{"userId": newPerson.ID, "role": "viewer"}),
	)
	if err != nil {
		t.Fatalf("contributor invite: %v", err)
	}
	defer func() { _ = inviteResp.Body.Close() }()
	if inviteResp.StatusCode != http.StatusCreated {
		t.Fatalf("contributor invite status = %d, want 201", inviteResp.StatusCode)
	}

	// A contributor can also change roles and remove collaborators.
	patchReq, err := http.NewRequest(http.MethodPatch, fmt.Sprintf("%s/events/%d/members/%d", server.URL, eventID, newPerson.ID), jsonBody(t, map[string]string{"role": "contributor"}))
	if err != nil {
		t.Fatalf("build patch request: %v", err)
	}
	patchReq.Header.Set("Content-Type", "application/json")
	patchResp, err := contributorClient.Do(patchReq)
	if err != nil {
		t.Fatalf("contributor patch role: %v", err)
	}
	defer func() { _ = patchResp.Body.Close() }()
	if patchResp.StatusCode != http.StatusOK {
		t.Errorf("contributor patch role status = %d, want 200", patchResp.StatusCode)
	}

	deleteReq, err := http.NewRequest(http.MethodDelete, fmt.Sprintf("%s/events/%d/members/%d", server.URL, eventID, newPerson.ID), nil)
	if err != nil {
		t.Fatalf("build delete request: %v", err)
	}
	deleteResp, err := contributorClient.Do(deleteReq)
	if err != nil {
		t.Fatalf("contributor delete member: %v", err)
	}
	defer func() { _ = deleteResp.Body.Close() }()
	if deleteResp.StatusCode != http.StatusNoContent {
		t.Errorf("contributor delete member status = %d, want 204", deleteResp.StatusCode)
	}
}
