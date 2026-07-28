package api

import (
	"fmt"
	"time"

	"github.com/trionell/patchplanner/internal/domain"
)

// validateEventDates enforces the one rule an event's four dates have to obey:
//
//	loadIn <= start <= end <= loadOut
//
// applied to the *resolved* dates (domain.Event.Resolve), not the stored ones,
// so an event supplying only an end_date earlier than its start_date is caught
// and an event supplying nothing at all is trivially valid.
//
// Two things the messages do on purpose:
//
// Each names the offending pair. The form has four date fields, and "invalid
// dates" tells the user to check all four.
//
// Where more than one rule is broken, only the chronologically earliest is
// reported. Fixing the first commonly fixes the rest — one mistyped year
// breaks every downstream comparison — and four errors about one typo is
// noise, not detail.
func validateEventDates(event domain.Event) error {
	// Format first, so a malformed date is never compared lexicographically
	// against a well-formed one. "2026-9-18" sorts before "2026-08-14".
	for _, field := range []struct {
		name  string
		value string
	}{
		{"loadInDate", event.LoadInDate},
		{"startDate", event.StartDate},
		{"endDate", event.EndDate},
		{"loadOutDate", event.LoadOutDate},
	} {
		if field.value == "" {
			continue
		}
		if _, err := time.Parse(time.DateOnly, field.value); err != nil {
			return fmt.Errorf("%s must be a date in YYYY-MM-DD form", field.name)
		}
	}

	dates := event.Resolve()
	if dates.First == "" {
		// No start date: nothing resolves, so there is nothing to order.
		// An event with an end but no start is caught here rather than by a
		// comparison, because "ends before it starts" is not what is wrong
		// with it.
		if event.EndDate != "" || event.LoadInDate != "" || event.LoadOutDate != "" {
			return fmt.Errorf("startDate is required when any other date is set")
		}
		return nil
	}

	// Ordered so the earliest broken pair is the one reported.
	if dates.LoadIn > dates.First {
		return fmt.Errorf("loadInDate must not be after startDate")
	}
	if dates.Last < dates.First {
		return fmt.Errorf("endDate must not be before startDate")
	}
	if dates.LoadOut < dates.Last {
		return fmt.Errorf("loadOutDate must not be before endDate")
	}
	return nil
}
