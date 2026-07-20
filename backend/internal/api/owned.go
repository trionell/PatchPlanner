package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	dbstore "github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

var validOwnedCategoryTypes = map[string]bool{
	"audio": true, "lighting": true, "rigging": true, "video": true, "misc": true,
}

type OwnedHandler struct {
	DB *sql.DB
}

// Register wires the /owned-items catalog — not event-scoped, sits in
// the outer authenticated group.
func (h OwnedHandler) Register(r chi.Router) {
	r.Route("/owned-items", func(r chi.Router) {
		r.Get("/", h.listItems)
		r.Post("/", h.createItem)
		r.Patch("/{itemID}", h.updateItem)
		r.Delete("/{itemID}", h.deleteItem)
	})
}

// RegisterEventEquipment wires the per-event owned-equipment routes
// inside the shared /events/{eventID} group, behind RequireEventAccess.
func (h OwnedHandler) RegisterEventEquipment(r chi.Router) {
	r.Get("/owned-equipment", h.listEventEquipment)
	r.Put("/owned-equipment/{ownedItemID}", h.putEventEquipment)
	r.Delete("/owned-equipment/{ownedItemID}", h.deleteEventEquipment)
}

func (h OwnedHandler) listItems(w http.ResponseWriter, r *http.Request) {
	items, err := dbstore.ListOwnedItems(h.DB)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (h OwnedHandler) createItem(w http.ResponseWriter, r *http.Request) {
	item, ok := decodeOwnedItem(w, r)
	if !ok {
		return
	}
	created, err := dbstore.CreateOwnedItem(h.DB, item)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h OwnedHandler) updateItem(w http.ResponseWriter, r *http.Request) {
	itemID, ok := parseID(w, chi.URLParam(r, "itemID"))
	if !ok {
		return
	}
	item, ok := decodeOwnedItem(w, r)
	if !ok {
		return
	}
	if _, err := dbstore.GetOwnedItem(h.DB, itemID); err != nil {
		writeOwnedLookupError(w, err, "owned item not found")
		return
	}
	updated, err := dbstore.UpdateOwnedItem(h.DB, itemID, item)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h OwnedHandler) deleteItem(w http.ResponseWriter, r *http.Request) {
	itemID, ok := parseID(w, chi.URLParam(r, "itemID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteOwnedItem(h.DB, itemID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h OwnedHandler) listEventEquipment(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	lines, err := dbstore.ListEventOwnedEquipment(h.DB, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, lines)
}

func (h OwnedHandler) putEventEquipment(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	ownedItemID, ok := parseID(w, chi.URLParam(r, "ownedItemID"))
	if !ok {
		return
	}
	var payload domain.OwnedEquipmentRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if payload.Quantity < 0 {
		writeError(w, http.StatusBadRequest, "quantity must not be negative")
		return
	}
	if _, err := dbstore.GetEvent(h.DB, eventID); err != nil {
		writeOwnedLookupError(w, err, "event not found")
		return
	}
	if _, err := dbstore.GetOwnedItem(h.DB, ownedItemID); err != nil {
		writeOwnedLookupError(w, err, "owned item not found")
		return
	}
	if err := dbstore.UpsertEventOwnedEquipment(h.DB, eventID, ownedItemID, payload); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	line, err := dbstore.GetEventOwnedEquipment(h.DB, eventID, ownedItemID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// The line was removed (quantity zero) — return an empty line
			// describing the removal.
			writeJSON(w, http.StatusOK, domain.EventOwnedEquipment{OwnedItemID: ownedItemID})
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, line)
}

func (h OwnedHandler) deleteEventEquipment(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	ownedItemID, ok := parseID(w, chi.URLParam(r, "ownedItemID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteEventOwnedEquipment(h.DB, eventID, ownedItemID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// decodeOwnedItem parses and validates the create/update payload, writing a
// 400 and returning ok=false on invalid input.
func decodeOwnedItem(w http.ResponseWriter, r *http.Request) (domain.OwnedItem, bool) {
	var item domain.OwnedItem
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return domain.OwnedItem{}, false
	}
	if item.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return domain.OwnedItem{}, false
	}
	if item.CategoryType == "" {
		item.CategoryType = "misc"
	}
	if !validOwnedCategoryTypes[item.CategoryType] {
		writeError(w, http.StatusBadRequest, "invalid category_type")
		return domain.OwnedItem{}, false
	}
	if item.QuantityOwned < 0 {
		writeError(w, http.StatusBadRequest, "quantity_owned must not be negative")
		return domain.OwnedItem{}, false
	}
	if item.QuantityOwned == 0 {
		item.QuantityOwned = 1
	}
	return item, true
}

func writeOwnedLookupError(w http.ResponseWriter, err error, notFoundMessage string) {
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, notFoundMessage)
		return
	}
	writeError(w, http.StatusInternalServerError, err.Error())
}
