package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strconv"

	"github.com/go-chi/chi/v5"
	dbstore "github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
	"github.com/trionell/patchplanner/internal/service"
)

type InventoryHandler struct {
	DB *sql.DB
}

func (h InventoryHandler) Register(r chi.Router) {
	r.Route("/inventory", func(r chi.Router) {
		r.Get("/categories", h.listCategories)
		r.Patch("/categories/{categoryID}", h.updateCategoryPickerRole)
		r.Get("/items", h.listItems)
		r.Post("/import-xlsx", h.importXLSX)
	})
}

func (h InventoryHandler) listCategories(w http.ResponseWriter, r *http.Request) {
	categories, err := dbstore.ListInventoryCategories(h.DB)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if categories == nil {
		categories = []domain.InventoryCategory{}
	}
	writeJSON(w, http.StatusOK, categories)
}

func (h InventoryHandler) listItems(w http.ResponseWriter, r *http.Request) {
	var categoryID *int64
	if raw := r.URL.Query().Get("category_id"); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid category_id")
			return
		}
		categoryID = &parsed
	}
	role := r.URL.Query().Get("role")
	if role != "" && role != "cable" && role != "stand" {
		writeError(w, http.StatusBadRequest, "invalid role: must be 'cable' or 'stand'")
		return
	}
	includeDiscontinued := r.URL.Query().Get("include_discontinued") == "true"
	items, err := dbstore.ListInventoryItems(h.DB, categoryID, r.URL.Query().Get("category_type"), role, includeDiscontinued)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if items == nil {
		items = []domain.InventoryItem{}
	}
	writeJSON(w, http.StatusOK, items)
}

// updateCategoryPickerRole sets or clears which planning picker (cable /
// stand) a category feeds. null clears the role.
func (h InventoryHandler) updateCategoryPickerRole(w http.ResponseWriter, r *http.Request) {
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
	if role != "" && role != "cable" && role != "stand" {
		writeError(w, http.StatusBadRequest, "invalid picker_role: must be 'cable', 'stand', or null")
		return
	}
	category, err := dbstore.UpdateCategoryPickerRole(h.DB, categoryID, role)
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

// inventoryFilePath resolves the renter's price-list file, shared by the
// import and rental-export endpoints.
func inventoryFilePath() string {
	if path := os.Getenv("INVENTORY_PATH"); path != "" {
		return path
	}
	return "../LL.xlsx"
}

func (h InventoryHandler) importXLSX(w http.ResponseWriter, r *http.Request) {
	result, err := service.InventoryService{DB: h.DB}.ImportFromXLSX(inventoryFilePath())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}
