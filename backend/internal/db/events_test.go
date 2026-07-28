package db

import (
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

func TestCreateEventSetsOwner(t *testing.T) {
	database := openTestDB(t)
	owner, err := UpsertUserByGoogleSub(database, "owner-sub", "owner@example.com", "Owner", "")
	if err != nil {
		t.Fatalf("seed owner: %v", err)
	}
	inventory, err := CreateInventory(database, owner.ID, "Test Inventory")
	if err != nil {
		t.Fatalf("create inventory: %v", err)
	}

	created, err := CreateEvent(database, testEvent("Gig"), owner.ID, inventory.ID)
	if err != nil {
		t.Fatalf("create event: %v", err)
	}

	role, found, err := GetEventRole(database, created.ID, owner.ID)
	if err != nil {
		t.Fatalf("get event role: %v", err)
	}
	if !found || role != "owner" {
		t.Errorf("owner role = %q, found = %v, want owner/true", role, found)
	}
}

func TestListEventsForUserScoping(t *testing.T) {
	database := openTestDB(t)
	owner, err := UpsertUserByGoogleSub(database, "owner-sub", "owner@example.com", "Owner", "")
	if err != nil {
		t.Fatalf("seed owner: %v", err)
	}
	contributor, err := UpsertUserByGoogleSub(database, "contributor-sub", "contributor@example.com", "Contributor", "")
	if err != nil {
		t.Fatalf("seed contributor: %v", err)
	}
	stranger, err := UpsertUserByGoogleSub(database, "stranger-sub", "stranger@example.com", "Stranger", "")
	if err != nil {
		t.Fatalf("seed stranger: %v", err)
	}
	inventory, err := CreateInventory(database, owner.ID, "Test Inventory")
	if err != nil {
		t.Fatalf("create inventory: %v", err)
	}

	if _, err := CreateEvent(database, testEvent("Owned Gig"), owner.ID, inventory.ID); err != nil {
		t.Fatalf("create owned event: %v", err)
	}
	shared, err := CreateEvent(database, testEvent("Shared Gig"), owner.ID, inventory.ID)
	if err != nil {
		t.Fatalf("create shared event: %v", err)
	}
	if err := UpsertEventMembership(database, shared.ID, contributor.ID, "contributor", owner.ID); err != nil {
		t.Fatalf("invite contributor: %v", err)
	}

	ownerEvents, err := ListEventsForUser(database, owner.ID)
	if err != nil {
		t.Fatalf("list events for owner: %v", err)
	}
	if len(ownerEvents) != 2 {
		t.Fatalf("owner sees %d events, want 2", len(ownerEvents))
	}
	for _, e := range ownerEvents {
		if e.YourRole != "owner" {
			t.Errorf("owner's role on %q = %q, want owner", e.Name, e.YourRole)
		}
	}

	contributorEvents, err := ListEventsForUser(database, contributor.ID)
	if err != nil {
		t.Fatalf("list events for contributor: %v", err)
	}
	if len(contributorEvents) != 1 || contributorEvents[0].ID != shared.ID {
		t.Fatalf("contributor events = %+v, want only the shared event", contributorEvents)
	}
	if contributorEvents[0].YourRole != "contributor" {
		t.Errorf("contributor's role = %q, want contributor", contributorEvents[0].YourRole)
	}

	strangerEvents, err := ListEventsForUser(database, stranger.ID)
	if err != nil {
		t.Fatalf("list events for stranger: %v", err)
	}
	if len(strangerEvents) != 0 {
		t.Fatalf("stranger sees %d events, want 0 (FR-008)", len(strangerEvents))
	}
}

func TestGetEventRole(t *testing.T) {
	database := openTestDB(t)
	owner, _ := UpsertUserByGoogleSub(database, "owner-sub", "owner@example.com", "Owner", "")
	viewer, _ := UpsertUserByGoogleSub(database, "viewer-sub", "viewer@example.com", "Viewer", "")
	stranger, _ := UpsertUserByGoogleSub(database, "stranger-sub", "stranger@example.com", "Stranger", "")
	inventory, err := CreateInventory(database, owner.ID, "Test Inventory")
	if err != nil {
		t.Fatalf("create inventory: %v", err)
	}
	event, err := CreateEvent(database, testEvent("Gig"), owner.ID, inventory.ID)
	if err != nil {
		t.Fatalf("create event: %v", err)
	}
	if err := UpsertEventMembership(database, event.ID, viewer.ID, "viewer", owner.ID); err != nil {
		t.Fatalf("invite viewer: %v", err)
	}

	if role, found, err := GetEventRole(database, event.ID, owner.ID); err != nil || !found || role != "owner" {
		t.Errorf("owner: role=%q found=%v err=%v", role, found, err)
	}
	if role, found, err := GetEventRole(database, event.ID, viewer.ID); err != nil || !found || role != "viewer" {
		t.Errorf("viewer: role=%q found=%v err=%v", role, found, err)
	}
	if _, found, err := GetEventRole(database, event.ID, stranger.ID); err != nil || found {
		t.Errorf("stranger: found=%v err=%v, want found=false", found, err)
	}
	if _, found, err := GetEventRole(database, 999999, owner.ID); err != nil || found {
		t.Errorf("nonexistent event: found=%v err=%v, want found=false", found, err)
	}
}

func TestClaimOwnerlessEvents(t *testing.T) {
	database := openTestDB(t)
	// Simulate pre-Slice-15 events: insert directly with no owner.
	mustExec(t, database, `INSERT INTO events (name) VALUES ('Legacy Gig A'), ('Legacy Gig B')`)

	firstUser, _ := UpsertUserByGoogleSub(database, "first-sub", "first@example.com", "First", "")
	secondUser, _ := UpsertUserByGoogleSub(database, "second-sub", "second@example.com", "Second", "")

	claimed, err := ClaimOwnerlessEvents(database, firstUser.ID)
	if err != nil {
		t.Fatalf("claim ownerless events: %v", err)
	}
	if claimed != 2 {
		t.Fatalf("claimed = %d, want 2", claimed)
	}

	events, err := ListEventsForUser(database, firstUser.ID)
	if err != nil {
		t.Fatalf("list events: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("first user now owns %d events, want 2", len(events))
	}

	// A second login's claim is a no-op — every event already has an owner.
	claimedAgain, err := ClaimOwnerlessEvents(database, secondUser.ID)
	if err != nil {
		t.Fatalf("second claim: %v", err)
	}
	if claimedAgain != 0 {
		t.Errorf("second claim affected %d rows, want 0 (idempotent)", claimedAgain)
	}
}

// TestCreateEventCopiesTemplateAsOneTimeSnapshot covers Slice 17 US2: the
// event's vocabulary starts as a copy of the creator's template at that
// exact moment, and from then on neither side ever affects the other.
func TestCreateEventCopiesTemplateAsOneTimeSnapshot(t *testing.T) {
	database := openTestDB(t)
	owner, err := UpsertUserByGoogleSub(database, "owner-sub", "owner@example.com", "Owner", "")
	if err != nil {
		t.Fatalf("seed owner: %v", err)
	}
	inventory, err := CreateInventory(database, owner.ID, "Test Inventory")
	if err != nil {
		t.Fatalf("create inventory: %v", err)
	}
	if err := EnsureUserHasReferenceTemplate(database, owner.ID); err != nil {
		t.Fatalf("ensure owner reference template: %v", err)
	}
	templateBefore, err := ListReferenceTemplate(database, owner.ID)
	if err != nil {
		t.Fatalf("list template: %v", err)
	}
	templateValue := templateBefore["preamp_connectors"][0]

	event, err := CreateEvent(database, testEvent("Gig"), owner.ID, inventory.ID)
	if err != nil {
		t.Fatalf("create event: %v", err)
	}
	eventData, err := ListReferenceData(database, event.ID)
	if err != nil {
		t.Fatalf("list event data: %v", err)
	}
	if len(eventData["preamp_connectors"]) != len(templateBefore["preamp_connectors"]) {
		t.Fatalf("event vocabulary size = %d, want %d (full copy of template at creation)", len(eventData["preamp_connectors"]), len(templateBefore["preamp_connectors"]))
	}
	var eventValueID int64
	for _, v := range eventData["preamp_connectors"] {
		if v.Value == templateValue.Value {
			eventValueID = v.ID
		}
	}
	if eventValueID == 0 {
		t.Fatalf("event's copy of %q not found", templateValue.Value)
	}

	// Editing the template afterward never changes the already-created
	// event.
	if _, err := UpdateReferenceTemplateValueLabel(database, owner.ID, "preamp_connectors", templateValue.ID, "Edited after event creation"); err != nil {
		t.Fatalf("edit template after event creation: %v", err)
	}
	eventDataAfter, err := ListReferenceData(database, event.ID)
	if err != nil {
		t.Fatalf("list event data after template edit: %v", err)
	}
	for _, v := range eventDataAfter["preamp_connectors"] {
		if v.Label == "Edited after event creation" {
			t.Errorf("template edit leaked into the already-created event: %+v", v)
		}
	}

	// Editing the event's vocabulary never changes the creator's template.
	if _, err := UpdateReferenceValueLabel(database, event.ID, "preamp_connectors", eventValueID, "Edited on the event"); err != nil {
		t.Fatalf("edit event vocabulary: %v", err)
	}
	templateAfter, err := ListReferenceTemplate(database, owner.ID)
	if err != nil {
		t.Fatalf("list template after event edit: %v", err)
	}
	for _, v := range templateAfter["preamp_connectors"] {
		if v.Label == "Edited on the event" {
			t.Errorf("event edit leaked into the creator's template: %+v", v)
		}
	}
}

func testEvent(name string) domain.Event {
	return domain.Event{Name: name}
}

// The three dates added in migration 046 round-trip, and NULL round-trips as
// NULL rather than as an empty string that has been stored on purpose.
func TestEventSpansRoundTrip(t *testing.T) {
	database := openTestDB(t)
	owner, err := UpsertUserByGoogleSub(database, "spans-sub", "spans@example.com", "Spans", "")
	if err != nil {
		t.Fatalf("seed owner: %v", err)
	}
	inventory, err := CreateInventory(database, owner.ID, "Spans Inventory")
	if err != nil {
		t.Fatalf("create inventory: %v", err)
	}

	full := domain.Event{
		Name:        "Bruksrock",
		LoadInDate:  "2026-09-17",
		StartDate:   "2026-09-18",
		EndDate:     "2026-09-20",
		LoadOutDate: "2026-09-21",
	}
	created, err := CreateEvent(database, full, owner.ID, inventory.ID)
	if err != nil {
		t.Fatalf("create four-date event: %v", err)
	}
	if created.LoadInDate != full.LoadInDate || created.StartDate != full.StartDate ||
		created.EndDate != full.EndDate || created.LoadOutDate != full.LoadOutDate {
		t.Errorf("four dates did not round-trip: %+v", created)
	}

	// The one-day case: three columns stay NULL, and read back as "".
	oneDay, err := CreateEvent(database, domain.Event{Name: "Vigsel", StartDate: "2026-08-22"}, owner.ID, inventory.ID)
	if err != nil {
		t.Fatalf("create one-day event: %v", err)
	}
	if oneDay.LoadInDate != "" || oneDay.EndDate != "" || oneDay.LoadOutDate != "" {
		t.Errorf("a one-day event should carry no spans, got %+v", oneDay)
	}
	var nulls int
	if err := database.QueryRow(
		`SELECT (load_in_date IS NULL) + (end_date IS NULL) + (load_out_date IS NULL) FROM events WHERE id = ?`,
		oneDay.ID).Scan(&nulls); err != nil {
		t.Fatalf("inspect stored nulls: %v", err)
	}
	if nulls != 3 {
		t.Errorf("empty dates should store as NULL, got %d of 3 null", nulls)
	}

	// Clearing a span on update returns it to NULL rather than "".
	cleared, err := UpdateEvent(database, created.ID, domain.Event{Name: "Bruksrock", StartDate: "2026-09-18"})
	if err != nil {
		t.Fatalf("clear spans: %v", err)
	}
	if cleared.LoadInDate != "" || cleared.EndDate != "" || cleared.LoadOutDate != "" {
		t.Errorf("spans were not cleared: %+v", cleared)
	}
}

// A row written before migration 046 — every new column NULL — reads back as a
// valid one-day event rather than erroring on the scan.
func TestEventRowFromBeforeSpansReadsBack(t *testing.T) {
	database := openTestDB(t)
	owner, err := UpsertUserByGoogleSub(database, "legacy-sub", "legacy@example.com", "Legacy", "")
	if err != nil {
		t.Fatalf("seed owner: %v", err)
	}
	inventory, err := CreateInventory(database, owner.ID, "Legacy Inventory")
	if err != nil {
		t.Fatalf("create inventory: %v", err)
	}
	result, err := database.Exec(
		`INSERT INTO events (name, start_date, owner_user_id, inventory_id) VALUES ('Pre-046', '2025-08-16', ?, ?)`,
		owner.ID, inventory.ID)
	if err != nil {
		t.Fatalf("insert legacy row: %v", err)
	}
	id, _ := result.LastInsertId()

	event, err := GetEvent(database, id)
	if err != nil {
		t.Fatalf("read legacy row: %v", err)
	}
	if event.StartDate != "2025-08-16" {
		t.Errorf("start date = %q, want 2025-08-16", event.StartDate)
	}
	dates := event.Resolve()
	if dates.LoadIn != "2025-08-16" || dates.Last != "2025-08-16" || dates.LoadOut != "2025-08-16" {
		t.Errorf("a legacy row must resolve to one day, got %+v", dates)
	}
}
