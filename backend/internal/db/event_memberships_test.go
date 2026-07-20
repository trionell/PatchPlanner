package db

import (
	"database/sql"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// createTestEventForOwner is this file's local convenience wrapper —
// every test here needs a fresh event owned by a specific test user,
// which now also requires an inventory to bind to.
func createTestEventForOwner(t *testing.T, database *sql.DB, ownerID int64) domain.Event {
	t.Helper()
	inventory, err := CreateInventory(database, ownerID, "Test Inventory")
	if err != nil {
		t.Fatalf("create inventory: %v", err)
	}
	event, err := CreateEvent(database, testEvent("Gig"), ownerID, inventory.ID)
	if err != nil {
		t.Fatalf("create event: %v", err)
	}
	return event
}

func TestListEventMembersOwnerFirst(t *testing.T) {
	database := openTestDB(t)
	owner, _ := UpsertUserByGoogleSub(database, "owner-sub", "owner@example.com", "Owner", "")
	contributor, _ := UpsertUserByGoogleSub(database, "contributor-sub", "contributor@example.com", "Contributor", "")
	viewer, _ := UpsertUserByGoogleSub(database, "viewer-sub", "viewer@example.com", "Viewer", "")
	event := createTestEventForOwner(t, database, owner.ID)
	if err := UpsertEventMembership(database, event.ID, contributor.ID, "contributor", owner.ID); err != nil {
		t.Fatalf("invite contributor: %v", err)
	}
	if err := UpsertEventMembership(database, event.ID, viewer.ID, "viewer", owner.ID); err != nil {
		t.Fatalf("invite viewer: %v", err)
	}

	members, err := ListEventMembers(database, event.ID)
	if err != nil {
		t.Fatalf("list event members: %v", err)
	}
	if len(members) != 3 {
		t.Fatalf("members = %d, want 3 (owner + 2 collaborators)", len(members))
	}
	if members[0].UserID != owner.ID || members[0].Role != "owner" {
		t.Errorf("first member = %+v, want owner first", members[0])
	}
}

func TestUpsertEventMembershipIsIdempotent(t *testing.T) {
	database := openTestDB(t)
	owner, _ := UpsertUserByGoogleSub(database, "owner-sub", "owner@example.com", "Owner", "")
	person, _ := UpsertUserByGoogleSub(database, "person-sub", "person@example.com", "Person", "")
	event := createTestEventForOwner(t, database, owner.ID)

	if err := UpsertEventMembership(database, event.ID, person.ID, "viewer", owner.ID); err != nil {
		t.Fatalf("invite as viewer: %v", err)
	}
	// Re-inviting with a different role updates in place, not a duplicate row.
	if err := UpsertEventMembership(database, event.ID, person.ID, "contributor", owner.ID); err != nil {
		t.Fatalf("re-invite as contributor: %v", err)
	}

	members, err := ListEventMembers(database, event.ID)
	if err != nil {
		t.Fatalf("list event members: %v", err)
	}
	var found int
	for _, m := range members {
		if m.UserID == person.ID {
			found++
			if m.Role != "contributor" {
				t.Errorf("role = %q, want contributor after re-invite", m.Role)
			}
		}
	}
	if found != 1 {
		t.Fatalf("person appears %d times, want exactly 1 (upsert, not duplicate)", found)
	}
}

func TestRemoveEventMembership(t *testing.T) {
	database := openTestDB(t)
	owner, _ := UpsertUserByGoogleSub(database, "owner-sub", "owner@example.com", "Owner", "")
	person, _ := UpsertUserByGoogleSub(database, "person-sub", "person@example.com", "Person", "")
	event := createTestEventForOwner(t, database, owner.ID)
	if err := UpsertEventMembership(database, event.ID, person.ID, "viewer", owner.ID); err != nil {
		t.Fatalf("invite: %v", err)
	}

	if err := RemoveEventMembership(database, event.ID, person.ID); err != nil {
		t.Fatalf("remove membership: %v", err)
	}
	if _, found, err := GetEventRole(database, event.ID, person.ID); err != nil || found {
		t.Errorf("removed person: found=%v err=%v, want found=false", found, err)
	}

	// Removing again (or a non-member) is not an error — idempotent.
	if err := RemoveEventMembership(database, event.ID, person.ID); err != nil {
		t.Errorf("repeat remove: %v", err)
	}
}
