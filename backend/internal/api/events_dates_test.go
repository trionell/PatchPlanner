package api

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
)

// The four dates, and the one rule they obey. Contract table from
// specs/030-events-timeline/contracts/events-api.md §4.
//
// Every rejection is asserted on its *message*, not just its status, because
// the whole point of the rule is that it names which two of the four fields to
// look at (FR-003).
func TestCreateEventDateOrdering(t *testing.T) {
	server, _ := newTestServer(t)
	inventoryID := testOwnerInventoryID(t, server.URL)

	cases := []struct {
		name       string
		dates      map[string]any
		wantStatus int
		// Substrings that must both appear in the error, so a message that
		// names only one side of the pair fails the test.
		wantNamed []string
	}{
		{
			name:       "no dates at all",
			dates:      map[string]any{},
			wantStatus: http.StatusCreated,
		},
		{
			name:       "start date only",
			dates:      map[string]any{"startDate": "2026-08-22"},
			wantStatus: http.StatusCreated,
		},
		{
			name: "all four in order",
			dates: map[string]any{
				"loadInDate": "2026-09-17", "startDate": "2026-09-18",
				"endDate": "2026-09-20", "loadOutDate": "2026-09-21",
			},
			wantStatus: http.StatusCreated,
		},
		{
			name: "all four equal — a one-day event stated the long way",
			dates: map[string]any{
				"loadInDate": "2026-09-18", "startDate": "2026-09-18",
				"endDate": "2026-09-18", "loadOutDate": "2026-09-18",
			},
			wantStatus: http.StatusCreated,
		},
		{
			name:       "end without start",
			dates:      map[string]any{"endDate": "2026-09-20"},
			wantStatus: http.StatusBadRequest,
			wantNamed:  []string{"startDate"},
		},
		{
			name:       "load-in after start",
			dates:      map[string]any{"loadInDate": "2026-09-19", "startDate": "2026-09-18"},
			wantStatus: http.StatusBadRequest,
			wantNamed:  []string{"loadInDate", "startDate"},
		},
		{
			name:       "end before start",
			dates:      map[string]any{"startDate": "2026-09-18", "endDate": "2026-09-16"},
			wantStatus: http.StatusBadRequest,
			wantNamed:  []string{"endDate", "startDate"},
		},
		{
			name: "load-out before end",
			dates: map[string]any{
				"startDate": "2026-09-18", "endDate": "2026-09-20", "loadOutDate": "2026-09-19",
			},
			wantStatus: http.StatusBadRequest,
			wantNamed:  []string{"loadOutDate", "endDate"},
		},
		{
			// The resolution chain has to fall back twice here: with no
			// endDate, loadOut is compared against start. A single fallback
			// would compare it against nothing and let this through.
			name:       "load-out before start, no end date",
			dates:      map[string]any{"startDate": "2026-09-18", "loadOutDate": "2026-09-17"},
			wantStatus: http.StatusBadRequest,
			wantNamed:  []string{"loadOutDate"},
		},
		{
			// Both loadIn>start and end<start are broken. Only the
			// chronologically earliest is reported.
			name: "two rules broken reports the earliest pair",
			dates: map[string]any{
				"loadInDate": "2026-09-19", "startDate": "2026-09-18", "endDate": "2026-09-01",
			},
			wantStatus: http.StatusBadRequest,
			wantNamed:  []string{"loadInDate"},
		},
		{
			name:       "malformed date",
			dates:      map[string]any{"startDate": "2026-9-18"},
			wantStatus: http.StatusBadRequest,
			wantNamed:  []string{"startDate", "YYYY-MM-DD"},
		},
		{
			// A malformed date must be caught before any comparison: as a
			// string, "2026-9-18" sorts *before* "2026-08-14", so a
			// lexicographic check would call this ordering valid.
			name:       "malformed date is caught before it is compared",
			dates:      map[string]any{"startDate": "2026-08-14", "endDate": "2026-9-18"},
			wantStatus: http.StatusBadRequest,
			wantNamed:  []string{"endDate", "YYYY-MM-DD"},
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			payload := map[string]any{"name": testCase.name, "inventoryId": inventoryID}
			for key, value := range testCase.dates {
				payload[key] = value
			}
			status, raw := doJSON(t, http.MethodPost, server.URL+"/events", payload)
			if status != testCase.wantStatus {
				t.Fatalf("status = %d, want %d (body %s)", status, testCase.wantStatus, raw)
			}
			for _, named := range testCase.wantNamed {
				if !strings.Contains(string(raw), named) {
					t.Errorf("error %s does not name %q", raw, named)
				}
			}
		})
	}
}

// The four dates round-trip, and an absent one stays absent rather than
// arriving back as an empty string — `omitempty` is what tells the client that
// a value derives from its neighbour rather than being blank.
func TestEventDatesRoundTrip(t *testing.T) {
	server, _ := newTestServer(t)
	inventoryID := testOwnerInventoryID(t, server.URL)

	status, raw := doJSON(t, http.MethodPost, server.URL+"/events", map[string]any{
		"name": "Bruksrock", "inventoryId": inventoryID,
		"loadInDate": "2026-09-17", "startDate": "2026-09-18",
		"endDate": "2026-09-20", "loadOutDate": "2026-09-21",
	})
	if status != http.StatusCreated {
		t.Fatalf("create: status %d body %s", status, raw)
	}
	created := decodeJSON[struct {
		ID          int64  `json:"id"`
		LoadInDate  string `json:"loadInDate"`
		StartDate   string `json:"startDate"`
		EndDate     string `json:"endDate"`
		LoadOutDate string `json:"loadOutDate"`
	}](t, raw)

	if created.LoadInDate != "2026-09-17" || created.StartDate != "2026-09-18" ||
		created.EndDate != "2026-09-20" || created.LoadOutDate != "2026-09-21" {
		t.Fatalf("dates did not round-trip: %+v", created)
	}

	// Clearing the outer two leaves them absent from the payload entirely.
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/events/%d", server.URL, created.ID), map[string]any{
		"name": "Bruksrock", "startDate": "2026-09-18", "endDate": "2026-09-20",
		"loadInDate": "", "loadOutDate": "",
	})
	if status != http.StatusOK {
		t.Fatalf("patch: status %d body %s", status, raw)
	}
	if strings.Contains(string(raw), "loadInDate") || strings.Contains(string(raw), "loadOutDate") {
		t.Errorf("cleared dates should be omitted from the payload, got %s", raw)
	}
}

// A one-day event created before Slice 30 reads back unchanged: one date, and
// three fields that are absent rather than empty.
func TestEventWithoutSpansIsUnchanged(t *testing.T) {
	server, _ := newTestServer(t)
	inventoryID := testOwnerInventoryID(t, server.URL)

	status, raw := doJSON(t, http.MethodPost, server.URL+"/events", map[string]any{
		"name": "Karin & Erik", "inventoryId": inventoryID, "startDate": "2026-08-22",
	})
	if status != http.StatusCreated {
		t.Fatalf("create: status %d body %s", status, raw)
	}
	for _, absent := range []string{"loadInDate", "endDate", "loadOutDate"} {
		if strings.Contains(string(raw), absent) {
			t.Errorf("a one-day event should not carry %s, got %s", absent, raw)
		}
	}
	if !strings.Contains(string(raw), `"startDate":"2026-08-22"`) {
		t.Errorf("startDate missing from %s", raw)
	}
}
