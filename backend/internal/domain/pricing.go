package domain

import "time"

// Rental pricing (Slice 31). Everything in this file is pure: it takes values
// and returns values, touches no database and no request, and is what
// db.GetRentalSummary composes rather than reimplements.

// Which days a hire is charged for. Two values because there are two
// derivations, both already available from Event.Resolve() — not two labels.
const (
	// ChargedDaysOnsite bills load-in through load-out: you have the gear in
	// the truck on the days you have it.
	ChargedDaysOnsite = "onsite"
	// ChargedDaysShow bills the show days only. Some rental houses charge for
	// the stage rather than for the truck.
	ChargedDaysShow = "show"
)

// Where an effective value came from, for the surfaces that say so. A number
// whose origin is invisible is a number nobody will trust the first time it
// looks wrong.
const (
	SourceInventory = "inventory" // the catalog's, because the event did not disagree
	SourceEvent     = "event"     // this event's own departure
	SourceTable     = "table"     // the catalog's rate card
	SourceOverride  = "override"  // typed on the event
	SourceNone      = "none"      // there was no rate card; the factor is 1.0
)

// ValidChargedDays reports whether value is one of the two rules.
func ValidChargedDays(value string) bool {
	return value == ChargedDaysOnsite || value == ChargedDaysShow
}

// RentFactor is one row of a supplier's rate card: hire for this many days and
// the day rate is multiplied by this much. LL.xlsx publishes sixteen of them on
// its Hyresfaktor sheet.
type RentFactor struct {
	ID     int64   `json:"id"`
	Days   int     `json:"days"`
	Factor float64 `json:"factor"`
}

// InventoryPricing is a catalog's own terms — the supplier's, not the job's.
// Factors are always ordered by Days ascending; the query guarantees it and
// LookupRentFactor assumes it.
type InventoryPricing struct {
	ChargedDays string       `json:"charged_days"`
	VATPercent  float64      `json:"vat_percent"`
	Factors     []RentFactor `json:"factors"`
}

// PricingDefaults is what a catalog copies when it is created. Read once, at
// creation, and never again — see migration 050's header for why not at import.
type PricingDefaults struct {
	ChargedDays string  `json:"charged_days"`
	VATPercent  float64 `json:"vat_percent"`
}

// EventPricingRequest is the payload for PUT /events/{id}/pricing. The three
// pointers are nullable because NULL is a meaning here — "follow the catalog" —
// and not an absence. It is its own route rather than part of PATCH /events
// because that handler is a whole-object replace and would wipe these
// (research.md R3).
type EventPricingRequest struct {
	ChargedDays        *string  `json:"charged_days"`
	RentFactorOverride *float64 `json:"rent_factor_override"`
	VATPercent         *float64 `json:"vat_percent"`
	DiscountPercent    float64  `json:"discount_percent"`
}

// RentalPricing is how an order's total was reached, stored nowhere and derived
// on every read. It carries every intermediate step rather than only the result,
// because the ledger, the strip and all three exports print the derivation — and
// a total nobody can trace is a total nobody will send.
type RentalPricing struct {
	BilledDays        int    `json:"billed_days"`
	ChargedDays       string `json:"charged_days"`
	ChargedDaysSource string `json:"charged_days_source"`
	// The two dates the day count spans, inclusive. Empty on an undated event.
	FirstDay string `json:"first_day,omitempty"`
	LastDay  string `json:"last_day,omitempty"`

	RentFactor       float64 `json:"rent_factor"`
	RentFactorSource string  `json:"rent_factor_source"`
	// RentFactorDays is the rate-card row that produced the factor, which is
	// what makes a step-down visible: billed_days 17, rent_factor_days 14.
	// Zero when the factor did not come from a row.
	RentFactorDays int `json:"rent_factor_days,omitempty"`

	DiscountPercent float64 `json:"discount_percent"`
	DiscountAmount  float64 `json:"discount_amount"`

	SubtotalExVAT float64 `json:"subtotal_ex_vat"`
	TotalExVAT    float64 `json:"total_ex_vat"`

	VATPercent  float64 `json:"vat_percent"`
	VATSource   string  `json:"vat_source"`
	VATAmount   float64 `json:"vat_amount"`
	TotalIncVAT float64 `json:"total_inc_vat"`
}

// LookupRentFactor reads a rate card the way the trade reads one: by STEPPING
// DOWN to the highest row whose day count is at or below the hire, clamped at
// both ends. Seventeen days gets the fourteen-day factor — the last rate you
// qualified for — and anything past the final row holds at the final row's.
//
// This was settled with the user against interpolating between rows: an
// interpolated factor is a number the supplier never published, and cannot be
// asked to honour. The clamp's cost is known and accepted — a sixty-day hire
// prices at the thirty-day factor, and a supplier who cares will publish a
// sixty-day row, which there is now somewhere to put.
//
// factors MUST be ordered by Days ascending; ListRentFactors guarantees it.
// Returns found=false for an empty rate card, where the caller uses 1.0.
func LookupRentFactor(factors []RentFactor, days int) (factor float64, row int, found bool) {
	if len(factors) == 0 {
		return 0, 0, false
	}
	// Below the first row, the first row: a rate card that starts at 2 days has
	// no opinion about 1, and the cheapest published rate is the honest answer.
	best := factors[0]
	for _, candidate := range factors {
		if candidate.Days <= days {
			best = candidate
			continue
		}
		break
	}
	return best.Factor, best.Days, true
}

// BilledDays counts the days a hire is charged for, INCLUSIVE of both ends, over
// the event's resolved dates — so every absent date has already fallen back to
// its neighbour and this needs no null handling of its own. It cannot disagree
// with the timeline, the dashboard or the clash sweep, because all four read the
// same resolution.
//
// An event with no start_date at all is one day. That is not an error and
// nothing about it is blocked: an undated event is a plan somebody has started,
// and it still has an order.
func BilledDays(event Event, chargedDays string) (days int, first, last string) {
	dates := event.Resolve()
	if dates.First == "" {
		return 1, "", ""
	}
	first, last = dates.LoadIn, dates.LoadOut
	if chargedDays == ChargedDaysShow {
		first, last = dates.First, dates.Last
	}
	return inclusiveDays(first, last), first, last
}

// inclusiveDays counts first..last inclusive, so a same-day span is 1. The API
// has refused out-of-order dates since Slice 30, so a negative span means an
// unparseable date rather than a backwards event — and either way the answer is
// the one day every pre-Slice-30 event means.
func inclusiveDays(first, last string) int {
	const layout = "2006-01-02"
	from, err := time.Parse(layout, first)
	if err != nil {
		return 1
	}
	to, err := time.Parse(layout, last)
	if err != nil {
		return 1
	}
	days := int(to.Sub(from).Hours()/24) + 1
	if days < 1 {
		return 1
	}
	return days
}

// ComputePricing derives an order's price from the day-rate subtotal, the
// event's departures and the catalog's terms.
//
// The order of operations is the supplier's own, taken from Sammanställning's
// formula `Summa utrustning ex = (B2 - (B2 * B4)) * B5`: DISCOUNT, then FACTOR,
// then VAT. The first two are both multiplicative so the total is the same
// either way; the order is fixed because the ledger prints it and because
// LL.xlsx's own file computes it that way.
func ComputePricing(subtotal float64, event Event, inventory InventoryPricing) RentalPricing {
	pricing := RentalPricing{
		ChargedDays:       inventory.ChargedDays,
		ChargedDaysSource: SourceInventory,
		VATPercent:        inventory.VATPercent,
		VATSource:         SourceInventory,
		DiscountPercent:   event.DiscountPercent,
		SubtotalExVAT:     subtotal,
	}
	if event.ChargedDays != nil && *event.ChargedDays != "" {
		pricing.ChargedDays = *event.ChargedDays
		pricing.ChargedDaysSource = SourceEvent
	}
	if event.VATPercent != nil {
		pricing.VATPercent = *event.VATPercent
		pricing.VATSource = SourceEvent
	}

	pricing.BilledDays, pricing.FirstDay, pricing.LastDay = BilledDays(event, pricing.ChargedDays)

	switch {
	case event.RentFactorOverride != nil:
		// The override wins over everything, including an empty rate card. It
		// is the whole point of it: some job was priced by a formula nobody
		// here can reconstruct.
		pricing.RentFactor = *event.RentFactorOverride
		pricing.RentFactorSource = SourceOverride
	default:
		factor, row, found := LookupRentFactor(inventory.Factors, pricing.BilledDays)
		if found {
			pricing.RentFactor, pricing.RentFactorDays = factor, row
			pricing.RentFactorSource = SourceTable
		} else {
			// No rate card: x1.00, and the strip says so in amber words. It is
			// the honest answer for a supplier who does not price this way, and
			// it is what every catalog meant before this slice.
			pricing.RentFactor = 1
			pricing.RentFactorSource = SourceNone
		}
	}

	pricing.DiscountAmount = subtotal * pricing.DiscountPercent / 100
	pricing.TotalExVAT = (subtotal - pricing.DiscountAmount) * pricing.RentFactor
	pricing.VATAmount = pricing.TotalExVAT * pricing.VATPercent / 100
	pricing.TotalIncVAT = pricing.TotalExVAT + pricing.VATAmount
	return pricing
}
