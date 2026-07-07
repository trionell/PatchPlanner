package api

import (
	"database/sql"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func NewRouter(db *sql.DB) http.Handler {
	r := chi.NewRouter()
	EventsHandler{DB: db}.Register(r)
	InventoryHandler{DB: db}.Register(r)
	AudioPatchHandler{DB: db}.Register(r)
	LightingHandler{DB: db}.Register(r)
	RentalHandler{DB: db}.Register(r)
	OwnedHandler{DB: db}.Register(r)
	return r
}
