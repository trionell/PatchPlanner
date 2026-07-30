package domain

// Event is a show file. Its four dates are ordered chronologically in the
// struct rather than alphabetically, so reading the type reads like the event:
// you arrive, you play, you stop playing, you leave.
//
// Only StartDate has no fallback. Each of the other three means "derives from
// its neighbour" when empty — LoadInDate from StartDate, EndDate from
// StartDate, LoadOutDate from EndDate and then from StartDate. An event
// carrying only a StartDate is therefore one day long, which is what every
// event created before Slice 30 means.
type Event struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	LoadInDate  string `json:"loadInDate,omitempty"`
	StartDate   string `json:"startDate,omitempty"`
	EndDate     string `json:"endDate,omitempty"`
	LoadOutDate string `json:"loadOutDate,omitempty"`
	Venue       string `json:"venue,omitempty"`
	Notes       string `json:"notes,omitempty"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
	OwnerUserID *int64 `json:"-"`
	YourRole    string `json:"yourRole,omitempty"`
	InventoryID int64  `json:"inventoryId"`

	// This job's own pricing terms (Slice 31), written only by
	// PUT /events/{id}/pricing — never by the create or update handlers, whose
	// UpdateEvent is a whole-object replace that would wipe them.
	//
	// The three pointers are nullable because NULL is a meaning here, as it is
	// on the three dates above: "follow the catalog". A catalog corrected after
	// the fact therefore corrects every event that never disagreed with it.
	// DiscountPercent is not a pointer and not omitempty — there is nothing
	// above it to inherit from, and a zero discount is a stated fact the
	// drawer's field has to render as 0 rather than as empty.
	ChargedDays        *string  `json:"chargedDays,omitempty"`
	RentFactorOverride *float64 `json:"rentFactorOverride,omitempty"`
	VATPercent         *float64 `json:"vatPercent,omitempty"`
	DiscountPercent    float64  `json:"discountPercent"`
}

// ResolvedDates is Event's four dates with every gap filled from its
// neighbour. Empty strings only where the event has no StartDate at all —
// an undated event resolves to nothing and participates in no comparison.
type ResolvedDates struct {
	LoadIn  string
	First   string
	Last    string
	LoadOut string
}

// Resolve fills the chain. Note that LoadOut falls back twice: an event with a
// last show day but no load-out loads out on its last show day, not on its
// first. Getting that wrong silently shortens every multi-day event whose
// owner did not fill in load-out.
func (e Event) Resolve() ResolvedDates {
	if e.StartDate == "" {
		return ResolvedDates{}
	}
	first := e.StartDate
	last := firstNonEmpty(e.EndDate, first)
	return ResolvedDates{
		LoadIn:  firstNonEmpty(e.LoadInDate, first),
		First:   first,
		Last:    last,
		LoadOut: firstNonEmpty(e.LoadOutDate, last),
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
