package service

import "testing"

func TestParseAllowedEmails(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want []string
	}{
		{"empty", "", nil},
		{"single", "person@example.com", []string{"person@example.com"}},
		{"multiple with whitespace", " a@example.com ,b@example.com,  c@example.com ", []string{"a@example.com", "b@example.com", "c@example.com"}},
		{"drops empty entries", "a@example.com,,b@example.com,", []string{"a@example.com", "b@example.com"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ParseAllowedEmails(tc.raw)
			if len(got) != len(tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Errorf("index %d: got %q, want %q", i, got[i], tc.want[i])
				}
			}
		})
	}
}

func TestIsAllowedEmail(t *testing.T) {
	allowed := []string{"person@example.com", "Other@Example.com"}

	cases := []struct {
		name  string
		email string
		want  bool
	}{
		{"exact match", "person@example.com", true},
		{"case insensitive match", "PERSON@EXAMPLE.COM", true},
		{"case insensitive match on mixed-case entry", "other@example.com", true},
		{"no match", "stranger@example.com", false},
		{"empty allow-list entry never matches empty email", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsAllowedEmail(tc.email, allowed); got != tc.want {
				t.Errorf("IsAllowedEmail(%q) = %v, want %v", tc.email, got, tc.want)
			}
		})
	}

	if IsAllowedEmail("anyone@example.com", nil) {
		t.Error("expected no match against an empty allow-list")
	}
}
