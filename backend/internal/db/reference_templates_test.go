package db

import (
	"database/sql"
	"errors"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

func TestReferenceTemplateCRUD(t *testing.T) {
	database := openTestDB(t)
	owner, err := UpsertUserByGoogleSub(database, "owner-sub", "owner@example.com", "Owner", "")
	if err != nil {
		t.Fatalf("seed owner: %v", err)
	}

	created, err := CreateReferenceTemplateValue(database, owner.ID, "signal_cable_types", domain.ReferenceValueRequest{Value: "dmx5", Label: "DMX 5-pin"})
	if err != nil {
		t.Fatalf("create template value: %v", err)
	}
	if created.Value != "dmx5" || created.Label != "DMX 5-pin" || created.Vocabulary != "signal_cable_types" {
		t.Errorf("created template value mismatch: %+v", created)
	}

	if _, err := CreateReferenceTemplateValue(database, owner.ID, "signal_cable_types", domain.ReferenceValueRequest{Value: "dmx5", Label: "Again"}); !errors.Is(err, ErrDuplicate) {
		t.Errorf("expected ErrDuplicate, got %v", err)
	}

	renamed, err := UpdateReferenceTemplateValueLabel(database, owner.ID, "signal_cable_types", created.ID, "DMX 5-pin (110 Ω)")
	if err != nil {
		t.Fatalf("rename template value: %v", err)
	}
	if renamed.Label != "DMX 5-pin (110 Ω)" || renamed.Value != "dmx5" {
		t.Errorf("rename must change label only: %+v", renamed)
	}
	if _, err := UpdateReferenceTemplateValueLabel(database, owner.ID, "signal_cable_types", 99999, "X"); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("expected ErrNoRows for unknown id, got %v", err)
	}

	// Delete always succeeds — no in-use check at all (spec.md FR-009):
	// a template value is never referenced by any planning row.
	if err := DeleteReferenceTemplateValue(database, owner.ID, "signal_cable_types", created.ID); err != nil {
		t.Fatalf("delete template value: %v", err)
	}
	data, err := ListReferenceTemplate(database, owner.ID)
	if err != nil {
		t.Fatalf("list after delete: %v", err)
	}
	for _, v := range data["signal_cable_types"] {
		if v.Value == "dmx5" {
			t.Error("deleted template value still listed")
		}
	}
	if err := DeleteReferenceTemplateValue(database, owner.ID, "signal_cable_types", created.ID); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("expected ErrNoRows deleting twice, got %v", err)
	}
}

// TestReferenceTemplateNotAccessibleByOtherOwner covers ownership scoping:
// a value created under one user's template is invisible to another's.
func TestReferenceTemplateNotAccessibleByOtherOwner(t *testing.T) {
	database := openTestDB(t)
	ownerA, _ := UpsertUserByGoogleSub(database, "owner-a-sub", "a@example.com", "A", "")
	ownerB, _ := UpsertUserByGoogleSub(database, "owner-b-sub", "b@example.com", "B", "")

	valueA, err := CreateReferenceTemplateValue(database, ownerA.ID, "signal_cable_types", domain.ReferenceValueRequest{Value: "dmx5", Label: "A's DMX 5-pin"})
	if err != nil {
		t.Fatalf("create value for owner A: %v", err)
	}
	if _, err := UpdateReferenceTemplateValueLabel(database, ownerB.ID, "signal_cable_types", valueA.ID, "Hijacked"); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("owner B updated owner A's template value: err=%v, want ErrNoRows", err)
	}
	if err := DeleteReferenceTemplateValue(database, ownerB.ID, "signal_cable_types", valueA.ID); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("owner B deleted owner A's template value: err=%v, want ErrNoRows", err)
	}
}

func TestEnsureUserHasReferenceTemplate(t *testing.T) {
	database := openTestDB(t)

	first, _ := UpsertUserByGoogleSub(database, "first-sub", "first@example.com", "First", "")
	if err := EnsureUserHasReferenceTemplate(database, first.ID); err != nil {
		t.Fatalf("ensure template for first user: %v", err)
	}
	firstData, err := ListReferenceTemplate(database, first.ID)
	if err != nil {
		t.Fatalf("list first user's template: %v", err)
	}
	if len(firstData["signal_cable_types"]) != seedCounts["signal_cable_types"] {
		t.Fatalf("first user's template signal_cable_types = %d, want %d (full seed copy)", len(firstData["signal_cable_types"]), seedCounts["signal_cable_types"])
	}

	// Calling again is a no-op — no duplicate rows.
	if err := EnsureUserHasReferenceTemplate(database, first.ID); err != nil {
		t.Fatalf("ensure template again: %v", err)
	}
	firstDataAgain, err := ListReferenceTemplate(database, first.ID)
	if err != nil {
		t.Fatalf("list first user's template again: %v", err)
	}
	if len(firstDataAgain["signal_cable_types"]) != seedCounts["signal_cable_types"] {
		t.Errorf("first user's template changed after repeat call: %d, want %d", len(firstDataAgain["signal_cable_types"]), seedCounts["signal_cable_types"])
	}

	// A second user gets their own independent full copy — not a shared
	// claim (research.md R5): editing one never affects the other.
	second, _ := UpsertUserByGoogleSub(database, "second-sub", "second@example.com", "Second", "")
	if err := EnsureUserHasReferenceTemplate(database, second.ID); err != nil {
		t.Fatalf("ensure template for second user: %v", err)
	}
	secondData, err := ListReferenceTemplate(database, second.ID)
	if err != nil {
		t.Fatalf("list second user's template: %v", err)
	}
	if len(secondData["signal_cable_types"]) != seedCounts["signal_cable_types"] {
		t.Fatalf("second user's template signal_cable_types = %d, want %d", len(secondData["signal_cable_types"]), seedCounts["signal_cable_types"])
	}

	firstValue := firstData["signal_cable_types"][0]
	if _, err := UpdateReferenceTemplateValueLabel(database, first.ID, "signal_cable_types", firstValue.ID, "Renamed by first"); err != nil {
		t.Fatalf("rename first user's value: %v", err)
	}
	secondDataAfter, err := ListReferenceTemplate(database, second.ID)
	if err != nil {
		t.Fatalf("list second user's template after first user's edit: %v", err)
	}
	for _, v := range secondDataAfter["signal_cable_types"] {
		if v.Label == "Renamed by first" {
			t.Errorf("first user's rename leaked into second user's template: %+v", v)
		}
	}
}
