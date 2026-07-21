package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/trionell/patchplanner/internal/api/middleware"
	dbstore "github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
	"github.com/trionell/patchplanner/internal/service"
)

type InventoriesHandler struct {
	DB *sql.DB
}

// Register wires /inventories (list-mine, create) — no {inventoryID} yet,
// scoped by the context user rather than RequireInventoryOwner.
func (h InventoriesHandler) Register(r chi.Router) {
	r.Get("/inventories", h.listMine)
	r.Post("/inventories", h.create)
}

// RegisterOwned wires the owner-only management routes inside the shared
// /inventories/{inventoryID} group, behind RequireInventoryOwner.
func (h InventoriesHandler) RegisterOwned(r chi.Router) {
	r.Get("/", h.get)
	r.Patch("/", h.rename)
	r.Delete("/", h.delete)
	r.Post("/duplicate", h.duplicate)
	r.Get("/categories", h.listCategories)
	r.Patch("/categories/{categoryID}", h.updateCategoryPickerRole)
	r.Get("/items", h.listItems)
	r.Post("/import-xlsx", h.importXLSX)
	r.Get("/items/{itemID}/fixture-modes", h.listFixtureModes)
	r.Post("/items/{itemID}/fixture-modes", h.createFixtureMode)
	r.Patch("/fixture-modes/{modeID}", h.updateFixtureMode)
	r.Delete("/fixture-modes/{modeID}", h.deleteFixtureMode)
}

func (h InventoriesHandler) listMine(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.UserFromContext(r.Context())
	inventories, err := dbstore.ListInventoriesForOwner(h.DB, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if inventories == nil {
		inventories = []domain.Inventory{}
	}
	writeJSON(w, http.StatusOK, inventories)
}

func (h InventoriesHandler) create(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.UserFromContext(r.Context())
	var payload struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if payload.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	created, err := dbstore.CreateInventory(h.DB, user.ID, payload.Name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h InventoriesHandler) get(w http.ResponseWriter, r *http.Request) {
	inventoryID, ok := parseID(w, chi.URLParam(r, "inventoryID"))
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

func (h InventoriesHandler) rename(w http.ResponseWriter, r *http.Request) {
	inventoryID, ok := parseID(w, chi.URLParam(r, "inventoryID"))
	if !ok {
		return
	}
	var payload struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if payload.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	updated, err := dbstore.RenameInventory(h.DB, inventoryID, payload.Name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h InventoriesHandler) delete(w http.ResponseWriter, r *http.Request) {
	inventoryID, ok := parseID(w, chi.URLParam(r, "inventoryID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteInventory(h.DB, inventoryID); err != nil {
		if errors.Is(err, dbstore.ErrInUse) {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h InventoriesHandler) duplicate(w http.ResponseWriter, r *http.Request) {
	inventoryID, ok := parseID(w, chi.URLParam(r, "inventoryID"))
	if !ok {
		return
	}
	user, _ := middleware.UserFromContext(r.Context())
	created, err := dbstore.DuplicateInventory(h.DB, inventoryID, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h InventoriesHandler) listCategories(w http.ResponseWriter, r *http.Request) {
	inventoryID, ok := parseID(w, chi.URLParam(r, "inventoryID"))
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

func (h InventoriesHandler) updateCategoryPickerRole(w http.ResponseWriter, r *http.Request) {
	inventoryID, ok := parseID(w, chi.URLParam(r, "inventoryID"))
	if !ok {
		return
	}
	categoryID, ok := parseID(w, chi.URLParam(r, "categoryID"))
	if !ok {
		return
	}
	var payload struct {
		PickerRole *string `json:"picker_role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	role := ""
	if payload.PickerRole != nil {
		role = *payload.PickerRole
	}
	if role != "" && role != "cable" && role != "stand" && role != "truss" {
		writeError(w, http.StatusBadRequest, "invalid picker_role: must be 'cable', 'stand', 'truss', or null")
		return
	}
	category, err := dbstore.UpdateCategoryPickerRole(h.DB, inventoryID, categoryID, role)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "inventory category not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, category)
}

func (h InventoriesHandler) listItems(w http.ResponseWriter, r *http.Request) {
	inventoryID, ok := parseID(w, chi.URLParam(r, "inventoryID"))
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

func (h InventoriesHandler) importXLSX(w http.ResponseWriter, r *http.Request) {
	inventoryID, ok := parseID(w, chi.URLParam(r, "inventoryID"))
	if !ok {
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing file upload (field name: file)")
		return
	}
	defer func() { _ = file.Close() }()

	result, err := service.InventoryService{DB: h.DB}.ImportFromXLSX(inventoryID, header.Filename, file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// requireInventoryItem validates itemID both exists and belongs to
// inventoryID (research.md R6, applied here for the fixture-modes routes
// specifically — a different inventory's owner must not manage modes for
// an item that isn't theirs just by guessing its id).
func (h InventoriesHandler) requireInventoryItem(w http.ResponseWriter, r *http.Request, inventoryID int64) (int64, bool) {
	itemID, ok := parseID(w, chi.URLParam(r, "itemID"))
	if !ok {
		return 0, false
	}
	belongs, err := dbstore.ItemBelongsToInventory(h.DB, itemID, inventoryID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return 0, false
	}
	if !belongs {
		writeError(w, http.StatusNotFound, "inventory item not found")
		return 0, false
	}
	return itemID, true
}

func (h InventoriesHandler) listFixtureModes(w http.ResponseWriter, r *http.Request) {
	inventoryID, ok := parseID(w, chi.URLParam(r, "inventoryID"))
	if !ok {
		return
	}
	itemID, ok := h.requireInventoryItem(w, r, inventoryID)
	if !ok {
		return
	}
	modes, err := dbstore.ListFixtureModes(h.DB, itemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, modes)
}

func (h InventoriesHandler) createFixtureMode(w http.ResponseWriter, r *http.Request) {
	inventoryID, ok := parseID(w, chi.URLParam(r, "inventoryID"))
	if !ok {
		return
	}
	itemID, ok := h.requireInventoryItem(w, r, inventoryID)
	if !ok {
		return
	}
	payload, ok := decodeModeRequest(w, r)
	if !ok {
		return
	}
	created, err := dbstore.CreateFixtureMode(h.DB, itemID, payload)
	if err != nil {
		if errors.Is(err, dbstore.ErrDuplicate) {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

// requireFixtureMode validates modeID both exists and belongs to an item of
// inventoryID (mirrors requireInventoryItem above — a different inventory's
// owner must not manage a mode that isn't theirs just by guessing its id).
func (h InventoriesHandler) requireFixtureMode(w http.ResponseWriter, r *http.Request, inventoryID int64) (int64, bool) {
	modeID, ok := parseID(w, chi.URLParam(r, "modeID"))
	if !ok {
		return 0, false
	}
	mode, err := dbstore.GetFixtureMode(h.DB, modeID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "fixture mode not found")
			return 0, false
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return 0, false
	}
	belongs, err := dbstore.ItemBelongsToInventory(h.DB, mode.InventoryItemID, inventoryID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return 0, false
	}
	if !belongs {
		writeError(w, http.StatusNotFound, "fixture mode not found")
		return 0, false
	}
	return modeID, true
}

func (h InventoriesHandler) updateFixtureMode(w http.ResponseWriter, r *http.Request) {
	inventoryID, ok := parseID(w, chi.URLParam(r, "inventoryID"))
	if !ok {
		return
	}
	modeID, ok := h.requireFixtureMode(w, r, inventoryID)
	if !ok {
		return
	}
	payload, ok := decodeModeRequest(w, r)
	if !ok {
		return
	}
	updated, err := dbstore.UpdateFixtureMode(h.DB, modeID, payload)
	if err != nil {
		switch {
		case errors.Is(err, sql.ErrNoRows):
			writeError(w, http.StatusNotFound, "fixture mode not found")
		case errors.Is(err, dbstore.ErrDuplicate):
			writeError(w, http.StatusConflict, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h InventoriesHandler) deleteFixtureMode(w http.ResponseWriter, r *http.Request) {
	inventoryID, ok := parseID(w, chi.URLParam(r, "inventoryID"))
	if !ok {
		return
	}
	modeID, ok := h.requireFixtureMode(w, r, inventoryID)
	if !ok {
		return
	}
	if err := dbstore.DeleteFixtureMode(h.DB, modeID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "fixture mode not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
