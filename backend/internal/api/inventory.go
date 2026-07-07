package api

import (
	"database/sql"
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
	includeDiscontinued := r.URL.Query().Get("include_discontinued") == "true"
	items, err := dbstore.ListInventoryItems(h.DB, categoryID, r.URL.Query().Get("category_type"), includeDiscontinued)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if items == nil {
		items = []domain.InventoryItem{}
	}
	writeJSON(w, http.StatusOK, items)
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
