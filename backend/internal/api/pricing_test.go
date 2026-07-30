package api

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

func TestPricingDefaultsRoundTrip(t *testing.T) {
	server, _ := newTestServer(t)

	status, raw := doJSON(t, http.MethodGet, server.URL+"/pricing-defaults", nil)
	if status != http.StatusOK {
		t.Fatalf("get defaults: status %d body %s", status, raw)
	}
	defaults := decodeJSON[domain.PricingDefaults](t, raw)
	if defaults.ChargedDays != domain.ChargedDaysOnsite || defaults.VATPercent != 25 {
		t.Errorf("defaults = %+v, want onsite/25 for a user who has never set them", defaults)
	}

	status, raw = doJSON(t, http.MethodPut, server.URL+"/pricing-defaults",
		domain.PricingDefaults{ChargedDays: domain.ChargedDaysShow, VATPercent: 12})
	if status != http.StatusOK {
		t.Fatalf("put defaults: status %d body %s", status, raw)
	}
	if stored := decodeJSON[domain.PricingDefaults](t, raw); stored.ChargedDays != domain.ChargedDaysShow || stored.VATPercent != 12 {
		t.Errorf("stored = %+v, want show/12", stored)
	}
}

func TestPricingValidation(t *testing.T) {
	server, database := newTestServer(t)
	inventoryID := testOwnerInventoryIDFromDB(t, database)
	eventID := seedEvent(t, server.URL)

	cases := []struct {
		name    string
		method  string
		path    string
		payload any
	}{
		{"defaults: an unknown rule", http.MethodPut, "/pricing-defaults",
			map[string]any{"charged_days": "weekends", "vat_percent": 25}},
		{"defaults: negative VAT", http.MethodPut, "/pricing-defaults",
			map[string]any{"charged_days": "onsite", "vat_percent": -1}},
		{"catalog: an unknown rule", http.MethodPut, fmt.Sprintf("/inventories/%d/pricing", inventoryID),
			map[string]any{"charged_days": "", "vat_percent": 25}},
		{"rate card: zero days", http.MethodPost, fmt.Sprintf("/inventories/%d/rent-factors", inventoryID),
			map[string]any{"days": 0, "factor": 1.5}},
		{"rate card: negative days", http.MethodPost, fmt.Sprintf("/inventories/%d/rent-factors", inventoryID),
			map[string]any{"days": -3, "factor": 1.5}},
		{"rate card: a zero factor", http.MethodPost, fmt.Sprintf("/inventories/%d/rent-factors", inventoryID),
			map[string]any{"days": 5, "factor": 0}},
		{"event: a discount above 100", http.MethodPut, fmt.Sprintf("/events/%d/pricing", eventID),
			map[string]any{"discount_percent": 101}},
		{"event: a negative discount", http.MethodPut, fmt.Sprintf("/events/%d/pricing", eventID),
			map[string]any{"discount_percent": -5}},
		{"event: a zero factor override", http.MethodPut, fmt.Sprintf("/events/%d/pricing", eventID),
			map[string]any{"discount_percent": 0, "rent_factor_override": 0}},
		{"event: an unknown rule", http.MethodPut, fmt.Sprintf("/events/%d/pricing", eventID),
			map[string]any{"discount_percent": 0, "charged_days": "sometimes"}},
	}

	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			status, raw := doJSON(t, test.method, server.URL+test.path, test.payload)
			if status != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body %s", status, raw)
			}
			// The message names the offending value, so the fix does not
			// require guessing which field was rejected.
			if body := decodeJSON[errorResponse](t, raw); body.Error == "" {
				t.Error("expected a message naming what was wrong")
			}
		})
	}
}

// The three departures are nullable, and clearing one is a legal request rather
// than a bad one — it is how an event goes back to following its catalog.
func TestEventPricingAcceptsNulls(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)

	status, raw := doJSON(t, http.MethodPut, fmt.Sprintf("%s/events/%d/pricing", server.URL, eventID),
		map[string]any{"charged_days": nil, "rent_factor_override": nil, "vat_percent": nil, "discount_percent": 0})
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200; body %s", status, raw)
	}
	event := decodeJSON[domain.Event](t, raw)
	if event.ChargedDays != nil || event.RentFactorOverride != nil || event.VATPercent != nil {
		t.Errorf("event = %+v, want every departure cleared", event)
	}
	// A zero VAT rate is a real answer — some hires are exempt — and must not
	// be rejected alongside the negative one.
	exempt := 0.0
	status, raw = doJSON(t, http.MethodPut, fmt.Sprintf("%s/events/%d/pricing", server.URL, eventID),
		domain.EventPricingRequest{VATPercent: &exempt})
	if status != http.StatusOK {
		t.Fatalf("zero VAT: status = %d, want 200; body %s", status, raw)
	}
}

func TestRentFactorDuplicateDaysConflict(t *testing.T) {
	server, database := newTestServer(t)
	inventoryID := testOwnerInventoryIDFromDB(t, database)
	path := fmt.Sprintf("%s/inventories/%d/rent-factors", server.URL, inventoryID)

	status, raw := doJSON(t, http.MethodPost, path, domain.RentFactor{Days: 5, Factor: 2.2})
	if status != http.StatusCreated {
		t.Fatalf("create: status %d body %s", status, raw)
	}
	created := decodeJSON[domain.RentFactor](t, raw)

	status, raw = doJSON(t, http.MethodPost, path, domain.RentFactor{Days: 5, Factor: 2.4})
	if status != http.StatusConflict {
		t.Fatalf("duplicate create: status %d, want 409; body %s", status, raw)
	}

	// Updating a row to a day count another row holds is the same conflict.
	other, err := db.CreateRentFactor(database, inventoryID, 14, 4)
	if err != nil {
		t.Fatalf("seed second row: %v", err)
	}
	status, _ = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", path, other.ID), domain.RentFactor{Days: 5, Factor: 4})
	if status != http.StatusConflict {
		t.Errorf("update onto a taken day count: status %d, want 409", status)
	}

	// And updating a row to its own day count is not a conflict with itself.
	status, _ = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", path, created.ID), domain.RentFactor{Days: 5, Factor: 2.5})
	if status != http.StatusOK {
		t.Errorf("update in place: status %d, want 200", status)
	}

	status, _ = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/%d", path, created.ID), nil)
	if status != http.StatusNoContent {
		t.Errorf("delete: status %d, want 204", status)
	}
	status, _ = doJSON(t, http.MethodDelete, fmt.Sprintf("%s/%d", path, created.ID), nil)
	if status != http.StatusNotFound {
		t.Errorf("delete again: status %d, want 404", status)
	}
}

// A catalog is owner-only, so somebody else's pricing is a 404 and not a 403 —
// the middleware's answer, which does not disclose that the catalog exists.
func TestInventoryPricingIsOwnerOnly(t *testing.T) {
	server, database := newTestServer(t)

	stranger, err := db.UpsertUserByGoogleSub(database, "stranger-sub", "stranger@example.com", "Stranger", "")
	if err != nil {
		t.Fatalf("seed stranger: %v", err)
	}
	theirs, err := db.CreateInventory(database, stranger.ID, "Not Yours")
	if err != nil {
		t.Fatalf("create stranger inventory: %v", err)
	}

	for _, path := range []struct {
		method string
		url    string
		body   any
	}{
		{http.MethodGet, fmt.Sprintf("/inventories/%d/pricing", theirs.ID), nil},
		{http.MethodPut, fmt.Sprintf("/inventories/%d/pricing", theirs.ID), domain.InventoryPricing{ChargedDays: "onsite", VATPercent: 25}},
		{http.MethodPost, fmt.Sprintf("/inventories/%d/rent-factors", theirs.ID), domain.RentFactor{Days: 5, Factor: 2.2}},
	} {
		status, raw := doJSON(t, path.method, server.URL+path.url, path.body)
		if status != http.StatusNotFound {
			t.Errorf("%s %s: status %d, want 404; body %s", path.method, path.url, status, raw)
		}
	}
}

// A viewer reads every number and can change none. The 403 is the middleware's,
// which is the point: this route needed no guard of its own.
func TestViewerCannotPriceAnEvent(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)

	owner, err := db.UpsertUserByGoogleSub(database, "test-google-sub", "test@example.com", "Test User", "")
	if err != nil {
		t.Fatalf("look up owner: %v", err)
	}
	viewer, err := db.UpsertUserByGoogleSub(database, "viewer-sub", "viewer@example.com", "Viewer", "")
	if err != nil {
		t.Fatalf("seed viewer: %v", err)
	}
	if err := db.UpsertEventMembership(database, eventID, viewer.ID, "viewer", owner.ID); err != nil {
		t.Fatalf("invite viewer: %v", err)
	}
	token, err := db.CreateSession(database, viewer.ID, time.Hour)
	if err != nil {
		t.Fatalf("create viewer session: %v", err)
	}
	viewerClient := clientForSession(t, server.URL, token)

	request, err := http.NewRequest(http.MethodPut, fmt.Sprintf("%s/events/%d/pricing", server.URL, eventID),
		jsonBody(t, map[string]any{"discount_percent": 25}))
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := viewerClient.Do(request)
	if err != nil {
		t.Fatalf("viewer put pricing: %v", err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want 403", response.StatusCode)
	}

	// And reading the priced order still works for them.
	getResponse, err := viewerClient.Get(fmt.Sprintf("%s/events/%d/rentals", server.URL, eventID))
	if err != nil {
		t.Fatalf("viewer get rentals: %v", err)
	}
	defer func() { _ = getResponse.Body.Close() }()
	if getResponse.StatusCode != http.StatusOK {
		t.Errorf("viewer rental summary: status = %d, want 200", getResponse.StatusCode)
	}
}

// research.md R3, as a regression test: the details drawer's save must not be
// able to wipe an agreed discount.
func TestUpdatingEventDetailsKeepsItsPricing(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)

	status, raw := doJSON(t, http.MethodPut, fmt.Sprintf("%s/events/%d/pricing", server.URL, eventID),
		map[string]any{"discount_percent": 25})
	if status != http.StatusOK {
		t.Fatalf("set discount: status %d body %s", status, raw)
	}

	// Exactly what EventDetailsDrawer sends.
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/events/%d", server.URL, eventID), map[string]any{
		"name": "Renamed", "venue": "Kulturhuset", "startDate": "2026-08-13", "notes": "",
	})
	if status != http.StatusOK {
		t.Fatalf("update details: status %d body %s", status, raw)
	}
	if event := decodeJSON[domain.Event](t, raw); event.DiscountPercent != 25 {
		t.Errorf("discount = %v after a details save, want 25", event.DiscountPercent)
	}
}

// The pricing block reaches the wire, which is what the strip, the drawer and
// every export read.
func TestRentalSummaryPayloadCarriesPricing(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	inventoryID := testOwnerInventoryIDFromDB(t, database)

	if _, err := db.CreateRentFactor(database, inventoryID, 1, 1); err != nil {
		t.Fatalf("seed rate card: %v", err)
	}
	if _, err := db.CreateRentFactor(database, inventoryID, 5, 2.2); err != nil {
		t.Fatalf("seed rate card: %v", err)
	}

	status, raw := doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/rentals", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("get rentals: status %d body %s", status, raw)
	}
	summary := decodeJSON[domain.RentalSummary](t, raw)
	if summary.Pricing.BilledDays != 1 {
		t.Errorf("billed days = %d, want 1 for an undated event", summary.Pricing.BilledDays)
	}
	if summary.Pricing.RentFactorSource != domain.SourceTable || summary.Pricing.RentFactor != 1 {
		t.Errorf("factor = %v from %q, want 1 from the 1-day row", summary.Pricing.RentFactor, summary.Pricing.RentFactorSource)
	}
	if summary.Pricing.VATPercent != 25 {
		t.Errorf("vat = %v, want the catalog's 25", summary.Pricing.VATPercent)
	}
}
