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
	"github.com/trionell/patchplanner/internal/service"
)

// RegisterConsoles adds the console routes to the audio-patch handler's own
// route group (Slice 23). Kept in its own file because the console is the one
// audio entity with capacity semantics — the guards below are what make
// "does the patch fit the desk?" answerable.
func (h AudioPatchHandler) RegisterConsoles(r chi.Router) {
	r.Post("/consoles", h.createConsole)
	r.Patch("/consoles/{consoleID}", h.updateConsole)
	r.Delete("/consoles/{consoleID}", h.deleteConsole)
	r.Post("/consoles/{consoleID}/switch", h.switchConsoleModel)
	r.Post("/consoles/{consoleID}/place", h.placeOnConsole)
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
	// A desk added without a model would become Generic by accident, which
	// is the state Slice 47 exists to end, so the model is never defaulted.
	model, ok := domain.LookupDeskModel(payload.DeskModel)
	if !ok {
		writeError(w, http.StatusBadRequest, "Pick the desk's model, or Generic.")
		return
	}
	if payload.BusMode == "" {
		payload.BusMode = model.DefaultBusMode(payload.Role)
	}
	applyDeskProfile(&payload, model)
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
	// The model changes only through the previewed switch, which renumbers
	// rows; a PATCH that could change it would skip the preview.
	payload.DeskModel = existing.DeskModel
	model, _ := domain.LookupDeskModel(existing.DeskModel)
	applyDeskProfile(&payload, model)
	if !h.validConsole(w, eventID, payload) {
		return
	}
	if model.Engine != domain.EngineGeneric {
		updated, err := dbstore.UpdateConsole(h.DB, consoleID, payload)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, updated)
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
	model, ok := domain.LookupDeskModel(console.DeskModel)
	if !ok {
		writeError(w, http.StatusBadRequest, "unknown desk model")
		return false
	}
	if console.BusMode != "" && (!model.HasBusModes || !slices.Contains(domain.ValidBusModes, console.BusMode)) {
		writeError(w, http.StatusBadRequest, "bus_mode is groups or monitors, on LV1 80 and LV1 Classic 80 only")
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

// applyDeskProfile writes a real model's counts over whatever was typed: on
// those desks the counts are read, not declared (Slice 47 D3). Storing them
// keeps every reader that predates models — the jack panels, the port
// guards, the PDF — working unchanged. Outputs are 0, "undeclared": no model
// caps them, the sockets do. Generic keeps its typed counts.
func applyDeskProfile(console *domain.Console, model domain.DeskModel) {
	if model.Engine == domain.EngineGeneric {
		return
	}
	console.InputCount = model.Strips
	console.OutputCount = 0
	console.LocalInputCount = model.LocalIn
	console.LocalOutputCount = model.LocalOut
}

// listDeskModels serves the in-code model list (Slice 47 D1). It is the same
// for everyone and changes only with a release.
func listDeskModels(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, domain.DeskModels)
}

func plural(n int, singular, plural string) string {
	if n == 1 {
		return singular
	}
	return plural
}

// eventConsole loads a console of this event, writing the 404 itself.
func (h AudioPatchHandler) eventConsole(w http.ResponseWriter, r *http.Request) (domain.Console, bool) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return domain.Console{}, false
	}
	consoleID, ok := parseID(w, chi.URLParam(r, "consoleID"))
	if !ok {
		return domain.Console{}, false
	}
	console, err := dbstore.GetConsole(h.DB, consoleID)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && console.EventID != eventID) {
		writeError(w, http.StatusNotFound, "console not found")
		return domain.Console{}, false
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return domain.Console{}, false
	}
	return console, true
}

func consoleRoutes(db *sql.DB, console domain.Console) ([]domain.DeskRoute, error) {
	all, err := dbstore.ListDeskRoutes(db, console.EventID)
	if err != nil {
		return nil, err
	}
	routes := make([]domain.DeskRoute, 0)
	for _, route := range all {
		if route.ConsoleID == console.ID {
			routes = append(routes, route)
		}
	}
	return routes, nil
}

func consoleSide(console domain.Console) service.DeskSide {
	model, _ := domain.LookupDeskModel(console.DeskModel)
	return service.DeskSide{
		Model:  model.WithBusMode(console.BusMode),
		Inputs: console.InputCount, LocalIn: console.LocalInputCount, LocalOut: console.LocalOutputCount,
	}
}

func placements(rows []service.MappedRow) []dbstore.StripPlacement {
	out := make([]dbstore.StripPlacement, len(rows))
	for i, row := range rows {
		out[i] = dbstore.StripPlacement{ID: row.ID, Number: row.ToNumber, Pool: row.ToPool, MixerBehavior: row.MixerBehavior}
	}
	return out
}

// switchConsoleModel previews a model switch, or with apply makes it (Slice
// 47 D4). Both run the same mapping, so the switch does what the preview
// said. A switch is never refused for what it leaves out.
func (h AudioPatchHandler) switchConsoleModel(w http.ResponseWriter, r *http.Request) {
	console, ok := h.eventConsole(w, r)
	if !ok {
		return
	}
	var payload struct {
		DeskModel string `json:"desk_model"`
		BusMode   string `json:"bus_mode"`
		Apply     bool   `json:"apply"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	target, ok := domain.LookupDeskModel(payload.DeskModel)
	if !ok {
		writeError(w, http.StatusBadRequest, "unknown desk model")
		return
	}
	next := console
	next.DeskModel = target.Key
	next.BusMode = payload.BusMode
	if next.BusMode == "" || !target.HasBusModes {
		next.BusMode = target.DefaultBusMode(console.Role)
	}
	if !slices.Contains(append(domain.ValidBusModes, ""), next.BusMode) {
		writeError(w, http.StatusBadRequest, "bus_mode is groups or monitors")
		return
	}
	// Leaving a real model for Generic keeps what the desk held as typed
	// counts; arriving on a real model reads them from the profile.
	applyDeskProfile(&next, target)

	rows, err := dbstore.DeskStripRows(h.DB, console.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jacks, err := dbstore.DeskLocalUse(h.DB, console.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	mapping := service.MapRows(rows, jacks, consoleSide(console), consoleSide(next))
	mixes, err := dbstore.ConsoleMixes(h.DB, console.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	routes, err := consoleRoutes(h.DB, console)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Slice 48: the same preview says what happens to the desk's mixes, its
	// routes, Fed by and the recorder, in the same words.
	mixMapping := service.MapMixes(mixes, routes, consoleSide(console), consoleSide(next), console.Recorder, console.RecorderTracks)
	next.RecorderTracks = mixMapping.RecorderTracks
	mapping.Figures = append(mapping.Figures, mixMapping.Figures...)
	mapping.Lines = append(mapping.Lines, mixMapping.Lines...)
	result := struct {
		Mapping service.Mapping     `json:"mapping"`
		Mixes   []service.MappedMix `json:"mixes"`
		Console domain.Console      `json:"console"`
	}{mapping, mixMapping.Mixes, next}
	if payload.Apply {
		placedMixes := make([]dbstore.MixPlacement, len(mixMapping.Mixes))
		for i, mix := range mixMapping.Mixes {
			placedMixes[i] = dbstore.MixPlacement{ID: mix.ID, Slot: mix.ToSlot, Width: mix.ToWidth, Name: mix.ToName}
		}
		if result.Console, err = dbstore.ApplyDeskSwitch(h.DB, next, placements(mapping.Rows), placedMixes); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	writeJSON(w, http.StatusOK, result)
}

// placeOnConsole previews, or with apply makes, putting rows that are on no
// desk onto this one: the No desk list's "Put on <desk>". The rows already on
// the desk never move. With no ids every deskless row of the event is placed.
func (h AudioPatchHandler) placeOnConsole(w http.ResponseWriter, r *http.Request) {
	console, ok := h.eventConsole(w, r)
	if !ok {
		return
	}
	var payload struct {
		ChannelIDs []int64 `json:"channel_ids"`
		OutputIDs  []int64 `json:"output_ids"`
		Apply      bool    `json:"apply"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	existing, err := dbstore.DeskStripRows(h.DB, console.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	deskless, err := dbstore.DesklessStripRows(h.DB, console.EventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Channels move only when asked for, or when nothing at all was named: an
	// outputs-only placing must not take the deskless channels with it.
	incoming := deskless
	if len(payload.ChannelIDs) == 0 && len(payload.OutputIDs) > 0 {
		incoming = nil
	} else if len(payload.ChannelIDs) > 0 {
		incoming = incoming[:0:0]
		for _, row := range deskless {
			if slices.Contains(payload.ChannelIDs, row.ID) {
				incoming = append(incoming, row)
			}
		}
	}
	mapping := service.PlaceRows(existing, incoming, consoleSide(console))
	if payload.Apply {
		outputIDs := payload.OutputIDs
		if len(payload.ChannelIDs) == 0 && len(outputIDs) == 0 {
			if outputIDs, err = dbstore.DesklessOutputIDs(h.DB, console.EventID); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
		}
		if err := dbstore.PlaceOnDesk(h.DB, console.EventID, console.ID, placements(mapping.Rows), outputIDs); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	writeJSON(w, http.StatusOK, struct {
		Mapping service.Mapping `json:"mapping"`
	}{mapping})
}
