package db

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/trionell/patchplanner/internal/domain"
)

// CreateSession issues a new opaque session token for userID, valid for ttl.
// Only the SHA-256 hash of the token is stored — a DB file leak/backup
// can't be replayed as a live cookie — so the raw token is returned once
// and never persisted.
func CreateSession(database *sql.DB, userID int64, ttl time.Duration) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate session token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(raw)

	_, err := database.Exec(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)`,
		hashToken(token), userID, time.Now().Add(ttl).UTC().Format(time.RFC3339))
	if err != nil {
		return "", fmt.Errorf("create session: %w", err)
	}
	return token, nil
}

// GetSessionUser resolves a raw session token to its user, rejecting
// unknown or expired sessions with sql.ErrNoRows.
func GetSessionUser(database *sql.DB, token string) (domain.User, error) {
	row := database.QueryRow(`
		SELECT `+userColumnsPrefixed("u")+`
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = ? AND s.expires_at > ?`,
		hashToken(token), time.Now().UTC().Format(time.RFC3339))
	return scanUser(row)
}

// DeleteSession removes the session for token, if any. Deleting an
// unknown token is not an error (logout is idempotent).
func DeleteSession(database *sql.DB, token string) error {
	if _, err := database.Exec(`DELETE FROM sessions WHERE token_hash = ?`, hashToken(token)); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func userColumnsPrefixed(alias string) string {
	return alias + ".id, " + alias + ".google_sub, " + alias + ".email, " + alias + ".name, " +
		"COALESCE(" + alias + ".picture_url, ''), " + alias + ".created_at, " + alias + ".last_login_at"
}
