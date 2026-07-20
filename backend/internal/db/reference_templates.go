package db

import (
	"database/sql"
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
)

// ListReferenceTemplate returns one user's personal template, every
// vocabulary always present (empty ones as empty slices), label-sorted —
// mirrors ListReferenceData's shape exactly, just owner-scoped instead of
// event-scoped.
func ListReferenceTemplate(database *sql.DB, ownerUserID int64) (domain.ReferenceData, error) {
	data := make(domain.ReferenceData, len(domain.Vocabularies))
	for _, vocabulary := range domain.Vocabularies {
		data[vocabulary] = []domain.ReferenceValue{}
	}

	rows, err := database.Query(`SELECT id, vocabulary, value, label FROM reference_templates WHERE owner_user_id = ? ORDER BY vocabulary, label COLLATE NOCASE`, ownerUserID)
	if err != nil {
		return nil, fmt.Errorf("list reference template: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var v domain.ReferenceValue
		if err := rows.Scan(&v.ID, &v.Vocabulary, &v.Value, &v.Label); err != nil {
			return nil, fmt.Errorf("scan reference template value: %w", err)
		}
		if _, known := data[v.Vocabulary]; !known {
			continue
		}
		data[v.Vocabulary] = append(data[v.Vocabulary], v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate reference template: %w", err)
	}
	return data, nil
}

// CreateReferenceTemplateValue adds a value to one user's template.
// Duplicate values within the same user's template yield ErrDuplicate.
func CreateReferenceTemplateValue(database *sql.DB, ownerUserID int64, vocabulary string, req domain.ReferenceValueRequest) (domain.ReferenceTemplateValue, error) {
	var exists bool
	err := database.QueryRow(`SELECT EXISTS(SELECT 1 FROM reference_templates WHERE owner_user_id = ? AND vocabulary = ? AND value = ?)`, ownerUserID, vocabulary, req.Value).Scan(&exists)
	if err != nil {
		return domain.ReferenceTemplateValue{}, fmt.Errorf("check duplicate reference template value: %w", err)
	}
	if exists {
		return domain.ReferenceTemplateValue{}, fmt.Errorf("%w: value %q already exists in %s", ErrDuplicate, req.Value, vocabulary)
	}

	result, err := database.Exec(`INSERT INTO reference_templates (owner_user_id, vocabulary, value, label) VALUES (?, ?, ?, ?)`, ownerUserID, vocabulary, req.Value, req.Label)
	if err != nil {
		return domain.ReferenceTemplateValue{}, fmt.Errorf("insert reference template value: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.ReferenceTemplateValue{}, fmt.Errorf("reference template value id: %w", err)
	}
	return domain.ReferenceTemplateValue{ID: id, Vocabulary: vocabulary, Value: req.Value, Label: req.Label}, nil
}

// UpdateReferenceTemplateValueLabel renames a value's display label within
// one user's template. Returns sql.ErrNoRows when the id doesn't belong to
// that user's template.
func UpdateReferenceTemplateValueLabel(database *sql.DB, ownerUserID int64, vocabulary string, id int64, label string) (domain.ReferenceTemplateValue, error) {
	result, err := database.Exec(`UPDATE reference_templates SET label = ? WHERE id = ? AND owner_user_id = ? AND vocabulary = ?`, label, id, ownerUserID, vocabulary)
	if err != nil {
		return domain.ReferenceTemplateValue{}, fmt.Errorf("update reference template label: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return domain.ReferenceTemplateValue{}, fmt.Errorf("update reference template label result: %w", err)
	}
	if affected == 0 {
		return domain.ReferenceTemplateValue{}, sql.ErrNoRows
	}
	return getReferenceTemplateValue(database, ownerUserID, vocabulary, id)
}

// DeleteReferenceTemplateValue removes a value from one user's template.
// Unlike DeleteReferenceValue there is no in-use check at all — a template
// row is never referenced by any planning row under any circumstance
// (spec.md FR-009, research.md R6). Returns sql.ErrNoRows when the id
// doesn't belong to that user's template.
func DeleteReferenceTemplateValue(database *sql.DB, ownerUserID int64, vocabulary string, id int64) error {
	result, err := database.Exec(`DELETE FROM reference_templates WHERE id = ? AND owner_user_id = ? AND vocabulary = ?`, id, ownerUserID, vocabulary)
	if err != nil {
		return fmt.Errorf("delete reference template value: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("delete reference template value result: %w", err)
	}
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func getReferenceTemplateValue(database *sql.DB, ownerUserID int64, vocabulary string, id int64) (domain.ReferenceTemplateValue, error) {
	var v domain.ReferenceTemplateValue
	err := database.QueryRow(`SELECT id, vocabulary, value, label FROM reference_templates WHERE id = ? AND owner_user_id = ? AND vocabulary = ?`, id, ownerUserID, vocabulary).
		Scan(&v.ID, &v.Vocabulary, &v.Value, &v.Label)
	if err != nil {
		return domain.ReferenceTemplateValue{}, err
	}
	return v, nil
}

// EnsureUserHasReferenceTemplate guarantees userID has a personal
// vocabulary template: a no-op if they already have any reference_templates
// rows, otherwise an idempotent copy-from-seed (research.md R5) — every
// event_id IS NULL reference_values row (the permanent shared seed left
// behind by migration 039's rebuild) is copied into fresh rows owned by
// userID. Unlike EnsureUserHasInventory this never exclusively claims a
// single shared row: the seed is immutable reference content, safe to copy
// to as many users as need a starting point, so every user — first login
// or the millionth — gets an identical fresh copy (spec.md FR-004).
func EnsureUserHasReferenceTemplate(database *sql.DB, userID int64) error {
	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM reference_templates WHERE owner_user_id = ?`, userID).Scan(&count); err != nil {
		return fmt.Errorf("count user reference template: %w", err)
	}
	if count > 0 {
		return nil
	}

	if _, err := database.Exec(`
		INSERT INTO reference_templates (owner_user_id, vocabulary, value, label)
		SELECT ?, vocabulary, value, label FROM reference_values WHERE event_id IS NULL`, userID); err != nil {
		return fmt.Errorf("seed reference template: %w", err)
	}
	return nil
}
