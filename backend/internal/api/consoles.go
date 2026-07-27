package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"

	"github.com/go-chi/chi/v5"
	dbstore "github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

// RegisterConsoles adds the console routes to the audio-patch handler's own
// route group (Slice 23). Kept in its own file because the console is the one
// audio entity with capacity semantics — the guards below are what make
// "does the patch fit the desk?" answerable.
func (h AudioPatchHandler) RegisterConsoles(r chi.Router) {
	r.Post("/consoles", h.createConsole)
	r.Patch("/consoles/{consoleID}", h.updateConsole)
	r.Delete("/consoles/{consoleID}", h.deleteConsole)
}

func (h AudioPatchHandler) createConsole(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok || !h.requireEvent(w, eventID) {
		return
	}
	var payload domain.Console
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	payload.EventID = eventID
	payload.Name = strings.TrimSpace(payload.Name)
	if payload.Role == "" {
		payload.Role = "foh"
	}
	if !h.validConsole(w, eventID, payload) {
		return
	}
	created, err := dbstore.CreateConsole(h.DB, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h AudioPatchHandler) updateConsole(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	consoleID, ok := parseID(w, chi.URLParam(r, "consoleID"))
	if !ok {
		return
	}
	existing, err := dbstore.GetConsole(h.DB, consoleID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "console not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if existing.EventID != eventID {
		writeError(w, http.StatusNotFound, "console not found")
		return
	}

	payload := existing
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	payload.ID = existing.ID
	payload.EventID = existing.EventID
	payload.Name = strings.TrimSpace(payload.Name)
	if !h.validConsole(w, eventID, payload) {
		return
	}

	// Shrinking a desk below what is already patched into it is refused with
	// the offending jacks named (FR-024) — the same shape as the stagebox and
	// device port guards, and for the same reason: silently dropping a cable
	// would lose a plan the user had made.
	conflicts, err := dbstore.ConsoleLocalPortConflicts(h.DB, consoleID, payload.LocalInputCount, payload.LocalOutputCount)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if len(conflicts) > 0 {
		writeError(w, http.StatusConflict, fmt.Sprintf("that would orphan %d patched %s: %s",
			len(conflicts), plural(len(conflicts), "jack", "jacks"), strings.Join(conflicts, ", ")))
		return
	}

	updated, err := dbstore.UpdateConsole(h.DB, consoleID, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h AudioPatchHandler) deleteConsole(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	consoleID, ok := parseID(w, chi.URLParam(r, "consoleID"))
	if !ok {
		return
	}
	if !h.itemBelongsToEvent("event_consoles", eventID, consoleID) {
		writeError(w, http.StatusNotFound, "console not found")
		return
	}
	cleared, err := dbstore.DeleteConsole(h.DB, consoleID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"cleared_cables": cleared})
}

// validConsole checks a console payload: a known role, non-negative counts,
// at most one of the two item references, and an inventory item that belongs
// to the event's bound catalog.
func (h AudioPatchHandler) validConsole(w http.ResponseWriter, eventID int64, console domain.Console) bool {
	if !slices.Contains(domain.ValidConsoleRoles, console.Role) {
		writeError(w, http.StatusBadRequest, "role must be one of "+strings.Join(domain.ValidConsoleRoles, ", "))
		return false
	}
	if console.InputCount < 0 || console.OutputCount < 0 || console.LocalInputCount < 0 || console.LocalOutputCount < 0 {
		writeError(w, http.StatusBadRequest, "counts must not be negative")
		return false
	}
	if console.InventoryItemID != nil && console.OwnedItemID != nil {
		writeError(w, http.StatusBadRequest, "pick either a catalog item or an owned item, not both")
		return false
	}
	inventoryID, ok := inventoryIDForEvent(h.DB, w, eventID)
	if !ok {
		return false
	}
	if !h.validItemRef(w, inventoryID, "inventory_item_id", console.InventoryItemID) {
		return false
	}
	return h.validOwnedItemRef(w, console.OwnedItemID)
}

func plural(n int, singular, plural string) string {
	if n == 1 {
		return singular
	}
	return plural
}
