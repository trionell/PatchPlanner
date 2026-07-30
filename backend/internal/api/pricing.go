package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/trionell/patchplanner/internal/api/middleware"
	dbstore "github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

// PricingHandler serves the three stores rental pricing lives in (Slice 31):
// a user's defaults, a catalog's terms and rate card, and an event's departures.
//
// Each is registered into the group that already carries the right guard, so
// this file adds no middleware of its own: /pricing-defaults is user-scoped from
// the session, the inventory routes sit behind RequireInventoryOwner, and the
// event route behind RequireEventAccess — which already forbids every mutating
// method to a viewer.
type PricingHandler struct {
	DB *sql.DB
}

// Register wires the user-scoped defaults, following /reference-templates:
// scoped to the session's user rather than to a URL parameter.
func (h PricingHandler) Register(r chi.Router) {
	r.Get("/pricing-defaults", h.getDefaults)
	r.Put("/pricing-defaults", h.putDefaults)
}

// RegisterOwned wires the catalog's own terms and its rate card, inside
// /inventories/{inventoryID}.
func (h PricingHandler) RegisterOwned(r chi.Router) {
	r.Get("/pricing", h.getInventoryPricing)
	r.Put("/pricing", h.putInventoryPricing)
	r.Post("/rent-factors", h.createRentFactor)
	r.Patch("/rent-factors/{factorID}", h.updateRentFactor)
	r.Delete("/rent-factors/{factorID}", h.deleteRentFactor)
}

// RegisterEvent wires this event's departures, inside /events/{eventID}.
//
// Its own route rather than part of PATCH /events/{id} because that handler is a
// whole-object replace: folding pricing into it would mean the details drawer's
// Save — which sends a name, a venue, four dates and notes — silently wiped an
// agreed discount (research.md R3).
func (h PricingHandler) RegisterEvent(r chi.Router) {
	r.Put("/pricing", h.putEventPricing)
}

func (h PricingHandler) getDefaults(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.UserFromContext(r.Context())
	defaults, err := dbstore.GetPricingDefaults(h.DB, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, defaults)
}

func (h PricingHandler) putDefaults(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.UserFromContext(r.Context())
	var payload domain.PricingDefaults
	if !decodePricingBody(w, r, &payload) {
		return
	}
	if !validChargedDays(w, payload.ChargedDays) || !validVATPercent(w, payload.VATPercent) {
		return
	}
	defaults, err := dbstore.SetPricingDefaults(h.DB, user.ID, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, defaults)
}

func (h PricingHandler) getInventoryPricing(w http.ResponseWriter, r *http.Request) {
	inventoryID, ok := parseID(w, chi.URLParam(r, "inventoryID"))
	if !ok {
		return
	}
	pricing, err := dbstore.GetInventoryPricing(h.DB, inventoryID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "inventory not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, pricing)
}

// putInventoryPricing writes the catalog's two terms only. The rate card is
// deliberately not accepted here: it is edited row by row, so a drawer that is
// mid-edit cannot post a stale copy of the whole curve over a row that changed
// under it.
func (h PricingHandler) putInventoryPricing(w http.ResponseWriter, r *http.Request) {
	inventoryID, ok := parseID(w, chi.URLParam(r, "inventoryID"))
	if !ok {
		return
	}
	var payload domain.InventoryPricing
	if !decodePricingBody(w, r, &payload) {
		return
	}
	if !validChargedDays(w, payload.ChargedDays) || !validVATPercent(w, payload.VATPercent) {
		return
	}
	if err := dbstore.SetInventoryPricing(h.DB, inventoryID, payload.ChargedDays, payload.VATPercent); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	pricing, err := dbstore.GetInventoryPricing(h.DB, inventoryID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, pricing)
}

func (h PricingHandler) createRentFactor(w http.ResponseWriter, r *http.Request) {
	inventoryID, ok := parseID(w, chi.URLParam(r, "inventoryID"))
	if !ok {
		return
	}
	var payload domain.RentFactor
	if !decodePricingBody(w, r, &payload) {
		return
	}
	if !validRentFactorRow(w, payload) {
		return
	}
	created, err := dbstore.CreateRentFactor(h.DB, inventoryID, payload.Days, payload.Factor)
	if err != nil {
		if errors.Is(err, dbstore.ErrDuplicate) {
			writeError(w, http.StatusConflict, fmt.Sprintf("this catalog already has a factor for %d days", payload.Days))
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h PricingHandler) updateRentFactor(w http.ResponseWriter, r *http.Request) {
	inventoryID, ok := parseID(w, chi.URLParam(r, "inventoryID"))
	if !ok {
		return
	}
	factorID, ok := parseID(w, chi.URLParam(r, "factorID"))
	if !ok {
		return
	}
	var payload domain.RentFactor
	if !decodePricingBody(w, r, &payload) {
		return
	}
	if !validRentFactorRow(w, payload) {
		return
	}
	updated, err := dbstore.UpdateRentFactor(h.DB, inventoryID, factorID, payload.Days, payload.Factor)
	if err != nil {
		switch {
		case errors.Is(err, sql.ErrNoRows):
			writeError(w, http.StatusNotFound, "rent factor not found")
		case errors.Is(err, dbstore.ErrDuplicate):
			writeError(w, http.StatusConflict, fmt.Sprintf("this catalog already has a factor for %d days", payload.Days))
		default:
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h PricingHandler) deleteRentFactor(w http.ResponseWriter, r *http.Request) {
	inventoryID, ok := parseID(w, chi.URLParam(r, "inventoryID"))
	if !ok {
		return
	}
	factorID, ok := parseID(w, chi.URLParam(r, "factorID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteRentFactor(h.DB, inventoryID, factorID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "rent factor not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h PricingHandler) putEventPricing(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	var payload domain.EventPricingRequest
	if !decodePricingBody(w, r, &payload) {
		return
	}
	// null means "follow the catalog" on all three, so only a non-null value is
	// checked — an absent one is a departure being cleared, not a bad request.
	if payload.ChargedDays != nil && !validChargedDays(w, *payload.ChargedDays) {
		return
	}
	if payload.VATPercent != nil && !validVATPercent(w, *payload.VATPercent) {
		return
	}
	if payload.RentFactorOverride != nil && *payload.RentFactorOverride <= 0 {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("rent factor override must be greater than 0, got %v", *payload.RentFactorOverride))
		return
	}
	if payload.DiscountPercent < 0 || payload.DiscountPercent > 100 {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("discount must be between 0 and 100, got %v", payload.DiscountPercent))
		return
	}

	event, err := dbstore.UpdateEventPricing(h.DB, eventID, payload)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "event not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if role, ok := middleware.EventRoleFromContext(r.Context()); ok {
		event.YourRole = role
	}
	writeJSON(w, http.StatusOK, event)
}

func decodePricingBody(w http.ResponseWriter, r *http.Request, target any) bool {
	if err := json.NewDecoder(r.Body).Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return false
	}
	return true
}

func validChargedDays(w http.ResponseWriter, value string) bool {
	if !domain.ValidChargedDays(value) {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("charged_days must be %q or %q, got %q",
			domain.ChargedDaysOnsite, domain.ChargedDaysShow, value))
		return false
	}
	return true
}

// A zero rate is legal — some hires are exempt — and only a negative one is not.
func validVATPercent(w http.ResponseWriter, value float64) bool {
	if value < 0 {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("vat_percent cannot be negative, got %v", value))
		return false
	}
	return true
}

func validRentFactorRow(w http.ResponseWriter, factor domain.RentFactor) bool {
	if factor.Days < 1 {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("days must be at least 1, got %d", factor.Days))
		return false
	}
	if factor.Factor <= 0 {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("factor must be greater than 0, got %v", factor.Factor))
		return false
	}
	return true
}
