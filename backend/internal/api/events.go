package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/trionell/patchplanner/internal/api/middleware"
	dbstore "github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

type EventsHandler struct {
	DB *sql.DB
}

// Register wires /events (list, scoped to the caller; create, owned by
// the caller) — routes with no specific event yet, so they sit in the
// outer authenticated group, not behind RequireEventAccess.
func (h EventsHandler) Register(r chi.Router) {
	r.Route("/events", func(r chi.Router) {
		r.Get("/", h.list)
		r.Post("/", h.create)
	})
}

// RegisterEvent wires the single-event routes (get/update/delete) inside
// the shared /events/{eventID} group, behind RequireEventAccess.
func (h EventsHandler) RegisterEvent(r chi.Router) {
	r.Get("/", h.get)
	r.Patch("/", h.update)
	r.Delete("/", h.delete)
}

func (h EventsHandler) list(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.UserFromContext(r.Context())
	events, err := dbstore.ListEventsForUser(h.DB, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if events == nil {
		events = []domain.Event{}
	}
	writeJSON(w, http.StatusOK, events)
}

func (h EventsHandler) get(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	event, err := dbstore.GetEvent(h.DB, eventID)
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

func (h EventsHandler) create(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.UserFromContext(r.Context())
	var event domain.Event
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if event.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	created, err := dbstore.CreateEvent(h.DB, event, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	created.YourRole = "owner"
	writeJSON(w, http.StatusCreated, created)
}

func (h EventsHandler) update(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	var event domain.Event
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if event.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	updated, err := dbstore.UpdateEvent(h.DB, eventID, event)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h EventsHandler) delete(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteEvent(h.DB, eventID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func parseID(w http.ResponseWriter, raw string) (int64, bool) {
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return 0, false
	}
	return id, true
}
