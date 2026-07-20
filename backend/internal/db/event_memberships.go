package db

import (
	"database/sql"
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
)

// ListEventMembers returns the owner (role "owner", sorted first) followed
// by every invited collaborator, for the event's members UI.
func ListEventMembers(db *sql.DB, eventID int64) ([]domain.EventMembership, error) {
	rows, err := db.Query(`
		SELECT u.id, u.email, u.name, COALESCE(u.picture_url, ''), 'owner' AS role, NULL AS invited_by_user_id, e.created_at, 0 AS sort_key
		FROM events e
		JOIN users u ON u.id = e.owner_user_id
		WHERE e.id = ?
		UNION ALL
		SELECT u.id, u.email, u.name, COALESCE(u.picture_url, ''), m.role, m.invited_by_user_id, m.created_at,
			CASE m.role WHEN 'contributor' THEN 1 ELSE 2 END AS sort_key
		FROM event_memberships m
		JOIN users u ON u.id = m.user_id
		WHERE m.event_id = ?
		ORDER BY 8, 3`, eventID, eventID)
	if err != nil {
		return nil, fmt.Errorf("list event members: %w", err)
	}
	defer rows.Close()

	members := make([]domain.EventMembership, 0)
	for rows.Next() {
		var member domain.EventMembership
		var invitedBy sql.NullInt64
		var sortKey int
		if err := rows.Scan(&member.UserID, &member.Email, &member.Name, &member.PictureURL, &member.Role, &invitedBy, &member.CreatedAt, &sortKey); err != nil {
			return nil, fmt.Errorf("scan event member: %w", err)
		}
		member.InvitedByUserID = int64PtrFromNull(invitedBy)
		members = append(members, member)
	}
	return members, rows.Err()
}

// UpsertEventMembership grants userID the given role on eventID, or
// changes their existing role if they're already a member (research.md
// R5 — re-inviting is idempotent, mirroring UpsertEventOwnedEquipment).
func UpsertEventMembership(db *sql.DB, eventID, userID int64, role string, invitedByUserID int64) error {
	_, err := db.Exec(`
		INSERT INTO event_memberships (event_id, user_id, role, invited_by_user_id)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(event_id, user_id) DO UPDATE SET role = excluded.role`,
		eventID, userID, role, invitedByUserID)
	if err != nil {
		return fmt.Errorf("upsert event membership: %w", err)
	}
	return nil
}

// RemoveEventMembership removes userID's access to eventID. Removing a
// non-member is not an error (idempotent, matching FR-010's "takes effect
// immediately" without needing the caller to check existence first).
func RemoveEventMembership(db *sql.DB, eventID, userID int64) error {
	if _, err := db.Exec(`DELETE FROM event_memberships WHERE event_id = ? AND user_id = ?`, eventID, userID); err != nil {
		return fmt.Errorf("remove event membership: %w", err)
	}
	return nil
}
