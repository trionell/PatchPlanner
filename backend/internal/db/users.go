package db

import (
	"database/sql"
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
)

const userColumns = `id, google_sub, email, name, COALESCE(picture_url, ''), created_at, last_login_at`

// UpsertUserByGoogleSub creates or updates the user identified by Google's
// stable, immutable account id. Email/name/picture refresh from the profile
// on every call (edge case: a person's name/picture changes on the Google
// side between visits), and last_login_at bumps to now.
func UpsertUserByGoogleSub(database *sql.DB, googleSub, email, name, pictureURL string) (domain.User, error) {
	_, err := database.Exec(`
		INSERT INTO users (google_sub, email, name, picture_url, last_login_at)
		VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(google_sub) DO UPDATE SET
			email = excluded.email,
			name = excluded.name,
			picture_url = excluded.picture_url,
			last_login_at = CURRENT_TIMESTAMP`,
		googleSub, email, name, nullString(pictureURL))
	if err != nil {
		return domain.User{}, fmt.Errorf("upsert user: %w", err)
	}
	return getUserByGoogleSub(database, googleSub)
}

func GetUserByID(database *sql.DB, id int64) (domain.User, error) {
	row := database.QueryRow(`SELECT `+userColumns+` FROM users WHERE id = ?`, id)
	return scanUser(row)
}

// ListUsers returns every known user (anyone who has signed in at least
// once), ordered by name — feeds the invite picker (research.md R6).
func ListUsers(database *sql.DB) ([]domain.User, error) {
	rows, err := database.Query(`SELECT ` + userColumns + ` FROM users ORDER BY name ASC`)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	users := make([]domain.User, 0)
	for rows.Next() {
		user, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	return users, rows.Err()
}

func getUserByGoogleSub(database *sql.DB, googleSub string) (domain.User, error) {
	row := database.QueryRow(`SELECT `+userColumns+` FROM users WHERE google_sub = ?`, googleSub)
	return scanUser(row)
}

func scanUser(row scanner) (domain.User, error) {
	var user domain.User
	if err := row.Scan(&user.ID, &user.GoogleSub, &user.Email, &user.Name, &user.PictureURL, &user.CreatedAt, &user.LastLoginAt); err != nil {
		return domain.User{}, fmt.Errorf("scan user: %w", err)
	}
	return user, nil
}
