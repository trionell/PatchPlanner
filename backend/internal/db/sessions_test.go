package db

import (
	"database/sql"
	"errors"
	"testing"
	"time"
)

func TestSessionCreateLookupDelete(t *testing.T) {
	database := openTestDB(t)
	user, err := UpsertUserByGoogleSub(database, "sub-1", "person@example.com", "Person", "")
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}

	token, err := CreateSession(database, user.ID, time.Hour)
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	if token == "" {
		t.Fatal("expected a non-empty token")
	}

	found, err := GetSessionUser(database, token)
	if err != nil {
		t.Fatalf("lookup session: %v", err)
	}
	if found.ID != user.ID {
		t.Errorf("lookup returned wrong user: %+v", found)
	}

	if err := DeleteSession(database, token); err != nil {
		t.Fatalf("delete session: %v", err)
	}
	if _, err := GetSessionUser(database, token); err == nil {
		t.Fatal("expected an error looking up a deleted session")
	}

	// Deleting again (or a token that never existed) is not an error —
	// logout is idempotent.
	if err := DeleteSession(database, token); err != nil {
		t.Errorf("repeat delete: %v", err)
	}
	if err := DeleteSession(database, "never-existed"); err != nil {
		t.Errorf("delete unknown token: %v", err)
	}
}

func TestSessionExpired(t *testing.T) {
	database := openTestDB(t)
	user, err := UpsertUserByGoogleSub(database, "sub-1", "person@example.com", "Person", "")
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}

	token, err := CreateSession(database, user.ID, -time.Minute)
	if err != nil {
		t.Fatalf("create expired session: %v", err)
	}

	if _, err := GetSessionUser(database, token); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("expected sql.ErrNoRows for an expired session, got: %v", err)
	}
}
