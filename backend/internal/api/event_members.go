package api

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/trionell/patchplanner/internal/api/middleware"
	dbstore "github.com/trionell/patchplanner/internal/db"
)

type EventMembersHandler struct {
	DB *sql.DB
}

// Register wires the members-management routes inside the shared
// /events/{eventID} group, behind RequireEventAccess (GET needs viewer+,
// the rest need owner/contributor).
func (h EventMembersHandler) Register(r chi.Router) {
	r.Get("/members", h.list)
	r.Post("/members", h.invite)
	r.Patch("/members/{userID}", h.updateRole)
	r.Delete("/members/{userID}", h.remove)
}

func (h EventMembersHandler) list(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	members, err := dbstore.ListEventMembers(h.DB, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, members)
}

type memberRoleRequest struct {
	UserID int64  `json:"userId"`
	Role   string `json:"role"`
}

func (h EventMembersHandler) invite(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	var req memberRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if !validMemberRole(req.Role) {
		writeError(w, http.StatusBadRequest, "role must be contributor or viewer")
		return
	}
	// FR-007: only someone who has signed in before can be invited.
	if _, err := dbstore.GetUserByID(h.DB, req.UserID); err != nil {
		writeError(w, http.StatusBadRequest, "userId is not a known user")
		return
	}
	if h.targetIsOwner(w, eventID, req.UserID) {
		return
	}

	invitedBy, _ := middleware.UserFromContext(r.Context())
	if err := dbstore.UpsertEventMembership(h.DB, eventID, req.UserID, req.Role, invitedBy.ID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.respondWithMember(w, http.StatusCreated, eventID, req.UserID)
}

func (h EventMembersHandler) updateRole(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	userID, ok := parseID(w, chi.URLParam(r, "userID"))
	if !ok {
		return
	}
	if h.targetIsOwner(w, eventID, userID) {
		return
	}
	var req struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if !validMemberRole(req.Role) {
		writeError(w, http.StatusBadRequest, "role must be contributor or viewer")
		return
	}

	invitedBy, _ := middleware.UserFromContext(r.Context())
	if err := dbstore.UpsertEventMembership(h.DB, eventID, userID, req.Role, invitedBy.ID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.respondWithMember(w, http.StatusOK, eventID, userID)
}

func (h EventMembersHandler) remove(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	userID, ok := parseID(w, chi.URLParam(r, "userID"))
	if !ok {
		return
	}
	if h.targetIsOwner(w, eventID, userID) {
		return
	}
	if err := dbstore.RemoveEventMembership(h.DB, eventID, userID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// targetIsOwner writes the 400 response and returns true if userID is
// eventID's owner (FR-011 — the owner's access can't be changed here).
func (h EventMembersHandler) targetIsOwner(w http.ResponseWriter, eventID, userID int64) bool {
	role, found, err := dbstore.GetEventRole(h.DB, eventID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return true
	}
	if found && role == "owner" {
		writeError(w, http.StatusBadRequest, "cannot change or remove the event owner's access")
		return true
	}
	return false
}

func (h EventMembersHandler) respondWithMember(w http.ResponseWriter, status int, eventID, userID int64) {
	members, err := dbstore.ListEventMembers(h.DB, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for _, member := range members {
		if member.UserID == userID {
			writeJSON(w, status, member)
			return
		}
	}
	writeError(w, http.StatusInternalServerError, "member not found after upsert")
}

func validMemberRole(role string) bool {
	return role == "contributor" || role == "viewer"
}
