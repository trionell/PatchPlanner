package domain

import "testing"

// llRateCard is the real card from LL.xlsx's Hyresfaktor sheet, abridged around
// the gaps that matter: it jumps 14 -> 21 -> 30, which is what makes the
// step-down rule a decision rather than a detail.
var llRateCard = []RentFactor{
	{Days: 1, Factor: 1},
	{Days: 2, Factor: 1.5},
	{Days: 3, Factor: 1.8},
	{Days: 4, Factor: 2},
	{Days: 5, Factor: 2.2},
	{Days: 14, Factor: 4},
	{Days: 21, Factor: 5.4},
	{Days: 30, Factor: 6.6},
}

func TestLookupRentFactor(t *testing.T) {
	tests := []struct {
		name       string
		factors    []RentFactor
		days       int
		wantFactor float64
		wantRow    int
		wantFound  bool
	}{
		{"exact row", llRateCard, 5, 2.2, 5, true},
		{"between rows steps down", llRateCard, 17, 4, 14, true},
		{"just above a row steps down", llRateCard, 6, 2.2, 5, true},
		{"above the last row holds", llRateCard, 45, 6.6, 30, true},
		{"the last row itself", llRateCard, 30, 6.6, 30, true},
		{"the first row", llRateCard, 1, 1, 1, true},
		{"below the first row takes the first", []RentFactor{{Days: 3, Factor: 1.8}, {Days: 7, Factor: 2.6}}, 1, 1.8, 3, true},
		{"a single row applies to everything", []RentFactor{{Days: 7, Factor: 2.6}}, 60, 2.6, 7, true},
		{"a single row below its day count", []RentFactor{{Days: 7, Factor: 2.6}}, 2, 2.6, 7, true},
		{"an empty card is not found", nil, 5, 0, 0, false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			factor, row, found := LookupRentFactor(test.factors, test.days)
			if found != test.wantFound {
				t.Fatalf("found = %v, want %v", found, test.wantFound)
			}
			if factor != test.wantFactor {
				t.Errorf("factor = %v, want %v", factor, test.wantFactor)
			}
			if row != test.wantRow {
				t.Errorf("row = %d, want %d", row, test.wantRow)
			}
		})
	}
}

func TestBilledDays(t *testing.T) {
	// The worked example the whole slice is specified against: a festival that
	// rigs on the 12th, plays the 13th to the 15th and leaves on the 16th.
	festival := Event{
		LoadInDate:  "2026-08-12",
		StartDate:   "2026-08-13",
		EndDate:     "2026-08-15",
		LoadOutDate: "2026-08-16",
	}

	tests := []struct {
		name        string
		event       Event
		chargedDays string
		wantDays    int
		wantFirst   string
		wantLast    string
	}{
		{"on-site spans load-in to load-out", festival, ChargedDaysOnsite, 5, "2026-08-12", "2026-08-16"},
		{"show days span start to end", festival, ChargedDaysShow, 3, "2026-08-13", "2026-08-15"},
		{
			"a start date alone is one day, both ways",
			Event{StartDate: "2026-08-13"}, ChargedDaysOnsite, 1, "2026-08-13", "2026-08-13",
		},
		{
			"a start date alone, on show days",
			Event{StartDate: "2026-08-13"}, ChargedDaysShow, 1, "2026-08-13", "2026-08-13",
		},
		{
			"an undated event is one day and spans nothing",
			Event{}, ChargedDaysOnsite, 1, "", "",
		},
		{
			// Slice 30's fallback chain: load-out falls back to the last show
			// day, not to the first. Getting that wrong silently shortens every
			// multi-day event whose owner did not fill load-out in.
			"a missing load-out falls back to the last show day",
			Event{StartDate: "2026-08-13", EndDate: "2026-08-15"}, ChargedDaysOnsite, 3, "2026-08-13", "2026-08-15",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			days, first, last := BilledDays(test.event, test.chargedDays)
			if days != test.wantDays {
				t.Errorf("days = %d, want %d", days, test.wantDays)
			}
			if first != test.wantFirst || last != test.wantLast {
				t.Errorf("span = %q..%q, want %q..%q", first, last, test.wantFirst, test.wantLast)
			}
		})
	}
}

// TestComputePricingWorkedExample is the arithmetic the spec, the mockup and
// every export are specified against, in one place: a 12 480.00/day order over
// five days at 25% off, on LL's card, at 25% VAT.
func TestComputePricingWorkedExample(t *testing.T) {
	event := Event{
		LoadInDate:      "2026-08-12",
		StartDate:       "2026-08-13",
		EndDate:         "2026-08-15",
		LoadOutDate:     "2026-08-16",
		DiscountPercent: 25,
	}
	inventory := InventoryPricing{ChargedDays: ChargedDaysOnsite, VATPercent: 25, Factors: llRateCard}

	pricing := ComputePricing(12480, event, inventory)

	assertPricing(t, pricing, map[string]float64{
		"billed days":     5,
		"factor":          2.2,
		"discount amount": 3120,
		"total ex VAT":    20592,
		"VAT amount":      5148,
		"total inc VAT":   25740,
	})
	if pricing.RentFactorSource != SourceTable || pricing.RentFactorDays != 5 {
		t.Errorf("factor source = %q row %d, want %q row 5", pricing.RentFactorSource, pricing.RentFactorDays, SourceTable)
	}
	if pricing.ChargedDaysSource != SourceInventory || pricing.VATSource != SourceInventory {
		t.Errorf("sources = %q/%q, want both %q", pricing.ChargedDaysSource, pricing.VATSource, SourceInventory)
	}
}

func TestComputePricingDepartures(t *testing.T) {
	festival := Event{
		LoadInDate:  "2026-08-12",
		StartDate:   "2026-08-13",
		EndDate:     "2026-08-15",
		LoadOutDate: "2026-08-16",
	}
	llPricing := InventoryPricing{ChargedDays: ChargedDaysOnsite, VATPercent: 25, Factors: llRateCard}

	t.Run("no rate card prices at 1.00 and says so", func(t *testing.T) {
		pricing := ComputePricing(12480, festival, InventoryPricing{ChargedDays: ChargedDaysOnsite, VATPercent: 25})
		if pricing.RentFactor != 1 || pricing.RentFactorSource != SourceNone {
			t.Fatalf("factor = %v from %q, want 1 from %q", pricing.RentFactor, pricing.RentFactorSource, SourceNone)
		}
		if pricing.TotalExVAT != 12480 {
			t.Errorf("total = %v, want the subtotal unchanged", pricing.TotalExVAT)
		}
		if pricing.RentFactorDays != 0 {
			t.Errorf("rent factor days = %d, want 0 — no row produced it", pricing.RentFactorDays)
		}
	})

	t.Run("an override beats the table", func(t *testing.T) {
		override := 3.4
		event := festival
		event.RentFactorOverride = &override
		pricing := ComputePricing(1000, event, llPricing)
		if pricing.RentFactor != 3.4 || pricing.RentFactorSource != SourceOverride {
			t.Fatalf("factor = %v from %q, want 3.4 from %q", pricing.RentFactor, pricing.RentFactorSource, SourceOverride)
		}
		if pricing.RentFactorDays != 0 {
			t.Errorf("rent factor days = %d, want 0 — no row produced it", pricing.RentFactorDays)
		}
	})

	t.Run("an override beats an empty card too", func(t *testing.T) {
		override := 3.4
		event := festival
		event.RentFactorOverride = &override
		pricing := ComputePricing(1000, event, InventoryPricing{ChargedDays: ChargedDaysOnsite})
		if pricing.RentFactor != 3.4 {
			t.Fatalf("factor = %v, want the override to win", pricing.RentFactor)
		}
	})

	t.Run("the event may charge show days only", func(t *testing.T) {
		show := ChargedDaysShow
		event := festival
		event.ChargedDays = &show
		pricing := ComputePricing(12480, event, llPricing)
		if pricing.BilledDays != 3 || pricing.ChargedDaysSource != SourceEvent {
			t.Fatalf("days = %d from %q, want 3 from %q", pricing.BilledDays, pricing.ChargedDaysSource, SourceEvent)
		}
		if pricing.RentFactor != 1.8 {
			t.Errorf("factor = %v, want the 3-day row", pricing.RentFactor)
		}
	})

	t.Run("the event may override VAT", func(t *testing.T) {
		exempt := 0.0
		event := festival
		event.VATPercent = &exempt
		pricing := ComputePricing(1000, event, llPricing)
		if pricing.VATPercent != 0 || pricing.VATSource != SourceEvent {
			t.Fatalf("VAT = %v from %q, want 0 from %q", pricing.VATPercent, pricing.VATSource, SourceEvent)
		}
		if pricing.VATAmount != 0 || pricing.TotalIncVAT != pricing.TotalExVAT {
			t.Errorf("an exempt hire should carry no VAT: %+v", pricing)
		}
	})

	t.Run("a full discount prices at zero", func(t *testing.T) {
		event := festival
		event.DiscountPercent = 100
		pricing := ComputePricing(12480, event, llPricing)
		if pricing.TotalExVAT != 0 || pricing.TotalIncVAT != 0 {
			t.Errorf("total = %v ex / %v inc, want zero", pricing.TotalExVAT, pricing.TotalIncVAT)
		}
	})

	t.Run("discount is applied before the factor, as the supplier's own file does", func(t *testing.T) {
		event := festival
		event.DiscountPercent = 50
		pricing := ComputePricing(1000, event, llPricing)
		// (1000 - 500) * 2.2, not 1000 * 2.2 - 500.
		if pricing.TotalExVAT != 1100 {
			t.Errorf("total = %v, want 1100", pricing.TotalExVAT)
		}
	})
}

func assertPricing(t *testing.T, pricing RentalPricing, want map[string]float64) {
	t.Helper()
	got := map[string]float64{
		"billed days":     float64(pricing.BilledDays),
		"factor":          pricing.RentFactor,
		"discount amount": pricing.DiscountAmount,
		"total ex VAT":    pricing.TotalExVAT,
		"VAT amount":      pricing.VATAmount,
		"total inc VAT":   pricing.TotalIncVAT,
	}
	for name, expected := range want {
		if got[name] != expected {
			t.Errorf("%s = %v, want %v", name, got[name], expected)
		}
	}
}
