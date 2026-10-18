package api

import (
	"net/http"
	"slices"

	dbstore "github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

const noDeskRefusal = "A channel is added to a desk, and this event has none yet. Add the desk in Rig first."

// resolveRowDesk is the rule that every channel and output is on a desk
// (Slice 47): an event with no desk refuses the row, one desk is the answer
// without asking, and several must be named. It returns the desk.
func (h AudioPatchHandler) resolveRowDesk(w http.ResponseWriter, eventID int64, sent *int64, noun string) (domain.Console, bool) {
	consoles, err := dbstore.ListConsoles(h.DB, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return domain.Console{}, false
	}
	if len(consoles) == 0 {
		message := noDeskRefusal
		if noun == "output" {
			message = "An output comes off a desk, and this event has none yet. Add the desk in Rig first."
		}
		writeError(w, http.StatusConflict, message)
		return domain.Console{}, false
	}
	if sent == nil {
		if len(consoles) == 1 {
			return consoles[0], true
		}
		writeError(w, http.StatusBadRequest, "Pick the desk this "+noun+" is on.")
		return domain.Console{}, false
	}
	for _, console := range consoles {
		if console.ID == *sent {
			return console, true
		}
	}
	writeError(w, http.StatusBadRequest, "console_id references a console of another event")
	return domain.Console{}, false
}

// placeChannel applies the desk's model to a channel being created or saved:
// the desk, the pool, the stereo behaviour the model imposes, the suggested
// number when none was sent, and the strip check. existing is nil on create.
func (h AudioPatchHandler) placeChannel(w http.ResponseWriter, eventID int64, payload *domain.InputChannel, existing *domain.InputChannel) bool {
	desk, ok := h.resolveRowDesk(w, eventID, payload.ConsoleID, "channel")
	if !ok {
		return false
	}
	payload.ConsoleID = &desk.ID
	if payload.StripPool == "" {
		payload.StripPool = domain.PoolChannel
	}
	if !slices.Contains(domain.ValidStripPools, payload.StripPool) {
		writeError(w, http.StatusBadRequest, "strip_pool must be channel or aux")
		return false
	}
	model, _ := domain.LookupDeskModel(desk.DeskModel)
	// Only X32 · M32 has aux; anywhere else a row sent to aux would be counted nowhere.
	if model.AuxIn == 0 {
		payload.StripPool = domain.PoolChannel
	}
	if forced := model.ForcedMixerBehavior(); forced != "" {
		payload.MixerBehavior = forced
	}

	others, err := dbstore.DeskStripRows(h.DB, desk.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return false
	}
	if existing == nil && payload.ChannelNumber == 0 {
		number, ok := domain.SuggestNumber(model, payload.StripPool, payload.Width, payload.MixerBehavior, others)
		if !ok {
			writeJSON(w, http.StatusConflict, domain.FullRefusal(desk.Name, model, payload.StripPool, others))
			return false
		}
		payload.ChannelNumber = number
	}
	// An over row keeps every other field editable: only a change to where it
	// sits is checked.
	if existing != nil && existing.ConsoleID != nil && *existing.ConsoleID == desk.ID &&
		existing.ChannelNumber == payload.ChannelNumber && existing.Width == payload.Width && existing.StripPool == payload.StripPool {
		return true
	}
	row := domain.StripRow{Number: payload.ChannelNumber, Width: payload.Width, MixerBehavior: payload.MixerBehavior, Pool: payload.StripPool, Name: payload.ChannelName}
	if existing != nil {
		row.ID = existing.ID
	}
	if refusal := domain.CheckStrip(desk.Name, model, row, others); refusal != nil {
		writeJSON(w, http.StatusConflict, refusal)
		return false
	}
	return true
}
