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
		UsersHandler{DB: db}.Register(r)
		EventsHandler{DB: db}.Register(r)
		OwnedHandler{DB: db}.Register(r)
		ReferenceHandler{DB: db}.Register(r)
		InventoriesHandler{DB: db}.Register(r)

		r.Route("/inventories/{inventoryID}", func(ir chi.Router) {
			ir.Use(middleware.RequireInventoryOwner(db))
			InventoriesHandler{DB: db}.RegisterOwned(ir)
		})

		r.Route("/events/{eventID}", func(er chi.Router) {
			er.Use(middleware.RequireEventAccess(db))
			EventsHandler{DB: db}.RegisterEvent(er)
			EventMembersHandler{DB: db}.Register(er)
			EventInventoryHandler{DB: db}.Register(er)
			AudioPatchHandler{DB: db}.Register(er)
			LightingHandler{DB: db}.Register(er)
			RentalHandler{DB: db}.Register(er)
			OwnedHandler{DB: db}.RegisterEventEquipment(er)
			StagePlotsHandler{DB: db}.Register(er)
		})
	})
	return r
}
