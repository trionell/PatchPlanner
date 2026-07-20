package api

import (
	"database/sql"
	"net/http"

	"github.com/go-chi/chi/v5"
	dbstore "github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

// EventInventoryHandler serves an event's bound inventory read-only,
// inside the /events/{eventID} group behind the existing RequireEventAccess
// (research.md R3) — any role gets a GET, so no new authorization code is
// needed here at all; the handler just resolves the event's inventory_id
// and delegates to the (now inventory-scoped) db read functions.
type EventInventoryHandler struct {
	DB *sql.DB
}

func (h EventInventoryHandler) Register(r chi.Router) {
	r.Get("/inventory", h.getInventory)
	r.Get("/inventory/categories", h.listCategories)
	r.Get("/inventory/items", h.listItems)
}

// getInventory returns the event's bound inventory's public fields (name,
// source filename) to any role — a collaborator needs to know which
// inventory an event uses even though only its owner can manage it (US3).
func (h EventInventoryHandler) getInventory(w http.ResponseWriter, r *http.Request) {
	inventoryID, ok := h.eventInventoryID(w, r)
	if !ok {
		return
	}
	inventory, err := dbstore.GetInventory(h.DB, inventoryID)
	if err != nil {
		writeError(w, http.StatusNotFound, "inventory not found")
		return
	}
	writeJSON(w, http.StatusOK, inventory)
}

func (h EventInventoryHandler) eventInventoryID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	return resolveEventInventoryID(h.DB, w, r)
}

// resolveEventInventoryID resolves {eventID}'s bound inventory, writing a
// 404 and returning ok=false if the event doesn't exist. Shared by every
// handler that needs to validate a picked catalog item against the
// event's own inventory (research.md R6).
func resolveEventInventoryID(db *sql.DB, w http.ResponseWriter, r *http.Request) (int64, bool) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return 0, false
	}
	return inventoryIDForEvent(db, w, eventID)
}

// inventoryIDForEvent looks up eventID's bound inventory, writing a 404
// and returning ok=false if the event doesn't exist — for handlers that
// have already resolved eventID (from the URL, or from an existing row's
// own event_id) rather than needing to parse it fresh.
func inventoryIDForEvent(db *sql.DB, w http.ResponseWriter, eventID int64) (int64, bool) {
	event, err := dbstore.GetEvent(db, eventID)
	if err != nil {
		writeError(w, http.StatusNotFound, "event not found")
		return 0, false
	}
	return event.InventoryID, true
}

// validInventoryItemRef writes a 400 and returns false when itemID is
// non-nil and doesn't belong to inventoryID — either because it doesn't
// exist at all or because it belongs to a different inventory
// (research.md R6): picking equipment from the wrong catalog must be
// rejected, not silently accepted.
func validInventoryItemRef(db *sql.DB, w http.ResponseWriter, field string, inventoryID int64, itemID *int64) bool {
	if itemID == nil {
		return true
	}
	belongs, err := dbstore.ItemBelongsToInventory(db, *itemID, inventoryID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return false
	}
	if !belongs {
		writeError(w, http.StatusBadRequest, field+" references an item from a different inventory")
		return false
	}
	return true
}

func (h EventInventoryHandler) listCategories(w http.ResponseWriter, r *http.Request) {
	inventoryID, ok := h.eventInventoryID(w, r)
	if !ok {
		return
	}
	categories, err := dbstore.ListInventoryCategories(h.DB, inventoryID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if categories == nil {
		categories = []domain.InventoryCategory{}
	}
	writeJSON(w, http.StatusOK, categories)
}

func (h EventInventoryHandler) listItems(w http.ResponseWriter, r *http.Request) {
	inventoryID, ok := h.eventInventoryID(w, r)
	if !ok {
		return
	}
	var categoryID *int64
	if raw := r.URL.Query().Get("category_id"); raw != "" {
		parsed, ok := parseID(w, raw)
		if !ok {
			return
		}
		categoryID = &parsed
	}
	role := r.URL.Query().Get("role")
	if role != "" && role != "cable" && role != "stand" && role != "truss" {
		writeError(w, http.StatusBadRequest, "invalid role: must be 'cable', 'stand' or 'truss'")
		return
	}
	includeDiscontinued := r.URL.Query().Get("include_discontinued") == "true"
	items, err := dbstore.ListInventoryItems(h.DB, inventoryID, categoryID, r.URL.Query().Get("category_type"), role, includeDiscontinued)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if items == nil {
		items = []domain.InventoryItem{}
	}
	writeJSON(w, http.StatusOK, items)
}
