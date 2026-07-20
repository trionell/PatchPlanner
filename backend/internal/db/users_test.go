package db

import "testing"

func TestUpsertUserByGoogleSub(t *testing.T) {
	database := openTestDB(t)

	created, err := UpsertUserByGoogleSub(database, "sub-1", "person@example.com", "Person One", "https://example.com/pic.jpg")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	if created.Email != "person@example.com" || created.Name != "Person One" || created.PictureURL != "https://example.com/pic.jpg" {
		t.Errorf("created user: %+v", created)
	}

	// Upserting the same google_sub again updates in place — same row,
	// refreshed profile fields, bumped last_login_at.
	updated, err := UpsertUserByGoogleSub(database, "sub-1", "person@example.com", "Person One Renamed", "https://example.com/new.jpg")
	if err != nil {
		t.Fatalf("re-upsert user: %v", err)
	}
	if updated.ID != created.ID {
		t.Errorf("re-upsert created a new row: got id %d, want %d", updated.ID, created.ID)
	}
	if updated.Name != "Person One Renamed" || updated.PictureURL != "https://example.com/new.jpg" {
		t.Errorf("profile fields not refreshed: %+v", updated)
	}

	// A distinct google_sub is a distinct user, even with the same name.
	other, err := UpsertUserByGoogleSub(database, "sub-2", "other@example.com", "Person One Renamed", "")
	if err != nil {
		t.Fatalf("create second user: %v", err)
	}
	if other.ID == created.ID {
		t.Errorf("distinct google_sub reused the same row")
	}

	fetched, err := GetUserByID(database, created.ID)
	if err != nil {
		t.Fatalf("get user by id: %v", err)
	}
	if fetched.Email != "person@example.com" {
		t.Errorf("get user by id: %+v", fetched)
	}
}

func TestUpsertUserByGoogleSubEmailCollision(t *testing.T) {
	database := openTestDB(t)

	if _, err := UpsertUserByGoogleSub(database, "sub-1", "shared@example.com", "First", ""); err != nil {
		t.Fatalf("create first user: %v", err)
	}

	// A different google_sub claiming an email already owned by another
	// user must fail clearly rather than silently corrupting either row.
	if _, err := UpsertUserByGoogleSub(database, "sub-2", "shared@example.com", "Second", ""); err == nil {
		t.Fatal("expected an error on duplicate email under a different google_sub")
	}
}
