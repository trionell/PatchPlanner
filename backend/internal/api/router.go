package api

import (
	"database/sql"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/trionell/patchplanner/internal/api/middleware"
)

func NewRouter(db *sql.DB, auth AuthConfig) http.Handler {
	r := chi.NewRouter()
	authHandler := AuthHandler{DB: db, Config: auth}
	authHandler.Register(r)
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth(db))
		authHandler.RegisterMe(r)
		EventsHandler{DB: db}.Register(r)
		InventoryHandler{DB: db}.Register(r)
		AudioPatchHandler{DB: db}.Register(r)
		LightingHandler{DB: db}.Register(r)
		RentalHandler{DB: db}.Register(r)
		OwnedHandler{DB: db}.Register(r)
		ReferenceHandler{DB: db}.Register(r)
		StagePlotsHandler{DB: db}.Register(r)
	})
	return r
}
