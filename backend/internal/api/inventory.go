package api

import (
	"database/sql"
	"net/http"
	"os"
	"strconv"

	"github.com/go-chi/chi/v5"
	dbstore "github.com/trionell/patcherplanner/internal/db"
	"github.com/trionell/patcherplanner/internal/domain"
	"github.com/trionell/patcherplanner/internal/service"
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
	items, err := dbstore.ListInventoryItems(h.DB, categoryID, r.URL.Query().Get("category_type"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if items == nil {
		items = []domain.InventoryItem{}
	}
	writeJSON(w, http.StatusOK, items)
}

func (h InventoryHandler) importXLSX(w http.ResponseWriter, r *http.Request) {
	path := os.Getenv("INVENTORY_PATH")
	if path == "" {
		path = "../LL.xlsx"
	}
	result, err := service.InventoryService{DB: h.DB}.ImportFromXLSX(path)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}
