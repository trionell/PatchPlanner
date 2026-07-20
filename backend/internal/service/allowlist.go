package service

import "strings"

// ParseAllowedEmails splits PATCHPLANNER_ALLOWED_EMAILS on commas, trimming
// whitespace around each entry and dropping empty ones.
func ParseAllowedEmails(raw string) []string {
	parts := strings.Split(raw, ",")
	emails := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			emails = append(emails, trimmed)
		}
	}
	return emails
}

// IsAllowedEmail reports whether email matches one of allowed,
// case-insensitively.
func IsAllowedEmail(email string, allowed []string) bool {
	for _, candidate := range allowed {
		if strings.EqualFold(email, candidate) {
			return true
		}
	}
	return false
}
