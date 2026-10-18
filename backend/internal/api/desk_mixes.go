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

// RegisterDeskMixes adds Slice 48's routes: a desk's mixes, an output's Fed
// by and the desk's recorder. Every connection they write is a route between
// two ports (design D1).
func (h AudioPatchHandler) RegisterDeskMixes(r chi.Router) {
	r.Post("/consoles/{consoleID}/mixes", h.createDeskMix)
	r.Patch("/mixes/{mixID}", h.updateDeskMix)
	r.Delete("/mixes/{mixID}", h.deleteDeskMix)
	r.Put("/audio-outputs/{outputID}/fed-by", h.setFedBy)
	r.Put("/consoles/{consoleID}/recorder", h.setRecorder)
	r.Put("/consoles/{consoleID}/recorder/routes", h.setRecorderRoutes)
	r.Post("/consoles/{consoleID}/recorder/fill", h.fillRecorder)
}

func deskModelOf(console domain.Console) domain.DeskModel {
	model, _ := domain.LookupDeskModel(console.DeskModel)
	return model.WithBusMode(console.BusMode)
}

func (h AudioPatchHandler) createDeskMix(w http.ResponseWriter, r *http.Request) {
	console, ok := h.eventConsole(w, r)
	if !ok {
		return
	}
	var payload domain.DeskMix
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if !slices.Contains(domain.ValidMixKinds, payload.Kind) || payload.Kind == domain.MixMain {
		writeError(w, http.StatusBadRequest, "kind must be subgroup, monitor, fx, matrix, dca or mute — a desk's mains always exist")
		return
	}
	model := deskModelOf(console)
	payload.Width = mixWidth(model, payload.Kind, payload.Width)
	mixes, err := dbstore.ConsoleMixes(h.DB, console.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	slot, ok := model.FirstFreeMixSlot(payload.Kind, payload.Width, mixes)
	if !ok {
		writeError(w, http.StatusConflict, model.FullPoolRefusal(console.Name, payload.Kind, mixes))
		return
	}
	payload.EventID, payload.ConsoleID, payload.Slot = console.EventID, &console.ID, slot
	payload.Name = strings.TrimSpace(payload.Name)
	if payload.Name == "" {
		payload.Name = defaultMixName(model, payload.Kind, slot)
	}
	created, err := dbstore.CreateDeskMix(h.DB, payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

// mixWidth is the width a mix is stored with: LV1 groups are always stereo,
// DCAs and mute groups always mono, everything else as asked.
func mixWidth(model domain.DeskModel, kind, width string) string {
	switch {
	case model.StereoForced(kind):
		return "stereo"
	case kind == domain.MixDCA || kind == domain.MixMute || width != "stereo":
		return "mono"
	}
	return "stereo"
}

func defaultMixName(model domain.DeskModel, kind string, slot int) string {
	short := map[string]string{domain.MixSubgroup: "Group", domain.MixMonitor: "Mon", domain.MixFX: "FX", domain.MixMatrix: "Mtx", domain.MixDCA: "DCA", domain.MixMute: "Mute"}[kind]
	if model.Engine == domain.EngineX32 && model.PoolOf(kind).Name == "bus" {
		short = "Bus"
	}
	return fmt.Sprintf("%s %d", short, slot)
}

// mixInEvent loads a mix and its desk, writing the 404 itself.
func (h AudioPatchHandler) mixInEvent(w http.ResponseWriter, r *http.Request) (domain.DeskMix, domain.Console, bool) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return domain.DeskMix{}, domain.Console{}, false
	}
	mixID, ok := parseID(w, chi.URLParam(r, "mixID"))
	if !ok {
		return domain.DeskMix{}, domain.Console{}, false
	}
	mix, err := dbstore.GetDeskMix(h.DB, mixID)
	if errors.Is(err, sql.ErrNoRows) || err == nil && (mix.EventID != eventID || mix.ConsoleID == nil) {
		writeError(w, http.StatusNotFound, "mix not found")
		return domain.DeskMix{}, domain.Console{}, false
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return domain.DeskMix{}, domain.Console{}, false
	}
	console, err := dbstore.GetConsole(h.DB, *mix.ConsoleID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return domain.DeskMix{}, domain.Console{}, false
	}
	return mix, console, true
}

// updateDeskMix is the column Save: the mix's fields and, when sent, every
// source that feeds it, written together. Each source must be on the same
// desk and a route the engine can make.
func (h AudioPatchHandler) updateDeskMix(w http.ResponseWriter, r *http.Request) {
	mix, console, ok := h.mixInEvent(w, r)
	if !ok {
		return
	}
	var payload struct {
		Slot    *int    `json:"slot"`
		Name    *string `json:"name"`
		Width   *string `json:"width"`
		Color   *string `json:"color"`
		Sources *[]struct {
			Kind string `json:"kind"`
			ID   int64  `json:"id"`
			Port int    `json:"port"`
		} `json:"sources"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	model := deskModelOf(console)
	next := mix
	if payload.Name != nil {
		next.Name = strings.TrimSpace(*payload.Name)
	}
	if payload.Color != nil {
		next.Color = *payload.Color
	}
	if payload.Width != nil && mix.Kind != domain.MixMain {
		next.Width = mixWidth(model, mix.Kind, *payload.Width)
	}
	if payload.Slot != nil && mix.Kind != domain.MixMain {
		next.Slot = *payload.Slot
	}
	mixes, err := dbstore.ConsoleMixes(h.DB, console.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if mix.Kind != domain.MixMain && (next.Slot != mix.Slot || next.Width != mix.Width) && !model.MixSlotFits(mix.Kind, next.Width, next.Slot, mixes, mix.ID) {
		writeError(w, http.StatusConflict, fmt.Sprintf("%s slot %d is not free for a %s %s.", deskLabelOf(console, model), next.Slot, next.Width, model.MixNoun(mix.Kind, 1)))
		return
	}

	var sources []domain.DeskRoute
	if payload.Sources != nil {
		// A route a model switch kept, though the new engine refuses it, stays
		// saveable as it is: the switch promised to keep it (Slice 48 D6). Only a
		// new route is checked against the engine.
		stored := map[string]bool{}
		if all, err := consoleRoutes(h.DB, console); err == nil {
			for _, route := range all {
				if route.DstKind == domain.PortMix && route.DstID == mix.ID {
					stored[fmt.Sprintf("%s:%d:%d", route.SrcKind, route.SrcID, route.SrcPort)] = true
				}
			}
		}
		channels, err := dbstore.DeskStripRows(h.DB, console.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		sources = make([]domain.DeskRoute, 0, len(*payload.Sources))
		for _, source := range *payload.Sources {
			switch source.Kind {
			case domain.PortChannel:
				if !slices.ContainsFunc(channels, func(row domain.StripRow) bool { return row.ID == source.ID }) {
					writeError(w, http.StatusBadRequest, "a source channel is not on this desk")
					return
				}
				if source.Port != 0 {
					writeError(w, http.StatusBadRequest, "a channel source has port 0")
					return
				}
				if err := model.RouteAllowed(domain.RouteFromChannel, 0, mix.Kind, next.Slot); err != nil && !stored[fmt.Sprintf("channel:%d:0", source.ID)] {
					writeError(w, http.StatusBadRequest, err.Error())
					return
				}
			case domain.PortMix:
				i := slices.IndexFunc(mixes, func(m domain.DeskMix) bool { return m.ID == source.ID })
				if i < 0 {
					writeError(w, http.StatusBadRequest, "a source mix is not on this desk")
					return
				}
				if source.Port != 0 && !(source.Port == 1 && mixes[i].Width == "stereo") {
					writeError(w, http.StatusBadRequest, "a mix source's port is its side: 0, or 1 on a stereo mix")
					return
				}
				if err := model.RouteAllowed(mixes[i].Kind, mixes[i].Slot, mix.Kind, next.Slot); err != nil && !stored[fmt.Sprintf("mix:%d:%d", source.ID, source.Port)] {
					writeError(w, http.StatusBadRequest, err.Error())
					return
				}
			default:
				writeError(w, http.StatusBadRequest, "a source is a channel or a mix")
				return
			}
			sources = append(sources, domain.DeskRoute{SrcKind: source.Kind, SrcID: source.ID, SrcPort: source.Port})
		}
		if limit := model.MatrixSourceLimit(); mix.Kind == domain.MixMatrix && limit > 0 && len(sources) > limit {
			writeError(w, http.StatusConflict, fmt.Sprintf("An %s matrix takes %d sources; this has %d.", model.Label, limit, len(sources)))
			return
		}
	}
	updated, err := dbstore.UpdateDeskMix(h.DB, next, sources)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func deskLabelOf(console domain.Console, model domain.DeskModel) string {
	return domain.DeskLabel(console.Name, model)
}

func (h AudioPatchHandler) deleteDeskMix(w http.ResponseWriter, r *http.Request) {
	mix, _, ok := h.mixInEvent(w, r)
	if !ok {
		return
	}
	if err := dbstore.DeleteDeskMix(h.DB, mix.ID); err != nil {
		if errors.Is(err, dbstore.ErrMainFixed) {
			writeError(w, http.StatusConflict, "A desk's mains are never deleted.")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// setFedBy replaces an output's Fed by: one mix on its own desk (never an FX
// send), or on LV1 and Generic a channel's direct out. null clears it.
func (h AudioPatchHandler) setFedBy(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	outputID, ok := parseID(w, chi.URLParam(r, "outputID"))
	if !ok {
		return
	}
	output, err := dbstore.GetAudioPatchOutput(h.DB, outputID)
	if errors.Is(err, sql.ErrNoRows) || err == nil && output.EventID != eventID {
		writeError(w, http.StatusNotFound, "output not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var payload *struct {
		Kind string `json:"src_kind"`
		ID   int64  `json:"src_id"`
		Side string `json:"side"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if payload == nil {
		if err := dbstore.SetFedBy(h.DB, output, nil); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if output.ConsoleID == nil {
		writeError(w, http.StatusBadRequest, "Put the output on a desk before choosing what feeds it.")
		return
	}
	console, err := dbstore.GetConsole(h.DB, *output.ConsoleID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	model := deskModelOf(console)
	source := domain.DeskRoute{SrcKind: payload.Kind, SrcID: payload.ID}
	switch payload.Kind {
	case domain.PortMix:
		mix, err := dbstore.GetDeskMix(h.DB, payload.ID)
		if err != nil || mix.ConsoleID == nil || *mix.ConsoleID != console.ID {
			writeError(w, http.StatusBadRequest, "src_id is not a mix of this output's desk")
			return
		}
		if !model.FedByAllowed(mix.Kind) {
			writeError(w, http.StatusBadRequest, "An FX send, a DCA or a mute group does not feed an output.")
			return
		}
		// A stereo mix on a mono output names its side; a mono mix plays on both.
		if mix.Width == "stereo" && output.Width == "mono" {
			switch payload.Side {
			case "L":
				source.SrcPort = 0
			case "R":
				source.SrcPort = 1
			default:
				writeError(w, http.StatusBadRequest, "A stereo mix on a mono output needs a side, L or R.")
				return
			}
		}
	case domain.PortChannel:
		channel, err := dbstore.GetInputChannel(h.DB, payload.ID)
		if err != nil || channel.ConsoleID == nil || *channel.ConsoleID != console.ID {
			writeError(w, http.StatusBadRequest, "src_id is not a channel of this output's desk")
			return
		}
	default:
		writeError(w, http.StatusBadRequest, "src_kind is mix or channel")
		return
	}
	if err := dbstore.SetFedBy(h.DB, output, &source); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// recorderTracks is how many tracks each way a desk's recorder has.
func recorderTracks(console domain.Console) int {
	if n := deskModelOf(console).RecorderTracks(); n > 0 {
		return n
	}
	return console.RecorderTracks
}

func (h AudioPatchHandler) setRecorder(w http.ResponseWriter, r *http.Request) {
	console, ok := h.eventConsole(w, r)
	if !ok {
		return
	}
	var payload struct {
		Recorder       bool `json:"recorder"`
		RecorderTracks int  `json:"recorder_tracks"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	tracks := payload.RecorderTracks
	if n := deskModelOf(console).RecorderTracks(); n > 0 {
		tracks = n
	}
	if tracks < 0 {
		writeError(w, http.StatusBadRequest, "recorder_tracks must not be negative")
		return
	}
	if err := dbstore.SetRecorder(h.DB, console, payload.Recorder, tracks); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	updated, err := dbstore.GetConsole(h.DB, console.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// validRecorderRoutes checks a recorder's routes: each record route ends on a
// track and starts at a preamp or a mix side on this desk; each playback starts
// on a track and ends on one of its channels, which takes at most one; no
// track past the recorder's count.
func (h AudioPatchHandler) validRecorderRoutes(w http.ResponseWriter, console domain.Console, routes []domain.DeskRoute) bool {
	if !console.Recorder {
		writeError(w, http.StatusConflict, "Declare the desk's recorder in Rig first.")
		return false
	}
	tracks := recorderTracks(console)
	channels, err := dbstore.DeskStripRows(h.DB, console.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return false
	}
	mixes, err := dbstore.ConsoleMixes(h.DB, console.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return false
	}
	onDesk := func(id int64) bool {
		return slices.ContainsFunc(channels, func(row domain.StripRow) bool { return row.ID == id })
	}
	// Tracks past the recorder's count that a model switch kept are accepted as
	// stored, so saving the table does not drop them (Slice 48 D6).
	stored := map[string]bool{}
	if all, err := consoleRoutes(h.DB, console); err == nil {
		for _, route := range all {
			if route.SrcKind == domain.PortRecorder || route.DstKind == domain.PortRecorder {
				stored[routeKey(route)] = true
			}
		}
	}
	played := map[int64]bool{}
	recordOn := map[int]bool{}
	playOn := map[int]bool{}
	for _, route := range routes {
		var track int
		switch {
		case route.DstKind == domain.PortRecorder && route.DstID == console.ID:
			track = route.DstPort
			switch route.SrcKind {
			case domain.PortChannel:
				if !onDesk(route.SrcID) {
					writeError(w, http.StatusBadRequest, "a recorded preamp is not on this desk")
					return false
				}
			case domain.PortMix:
				i := slices.IndexFunc(mixes, func(m domain.DeskMix) bool { return m.ID == route.SrcID })
				if i < 0 {
					writeError(w, http.StatusBadRequest, "a recorded mix is not on this desk")
					return false
				}
				if route.SrcPort != 0 && !(route.SrcPort == 1 && mixes[i].Width == "stereo") {
					writeError(w, http.StatusBadRequest, "a recorded mix's port is its side: 0, or 1 on a stereo mix")
					return false
				}
			default:
				writeError(w, http.StatusBadRequest, "a track records a preamp or a mix")
				return false
			}
		case route.SrcKind == domain.PortRecorder && route.SrcID == console.ID && route.DstKind == domain.PortChannel:
			track = route.SrcPort
			if !onDesk(route.DstID) {
				writeError(w, http.StatusBadRequest, "a playback channel is not on this desk")
				return false
			}
			if played[route.DstID] {
				writeError(w, http.StatusBadRequest, "A channel plays back from one track at most.")
				return false
			}
			if playOn[track] {
				writeError(w, http.StatusBadRequest, fmt.Sprintf("Track %d plays back into one channel at most.", track))
				return false
			}
			played[route.DstID] = true
			playOn[track] = true
			if route.Mode != domain.PlaySoundcheck && route.Mode != domain.PlaySource {
				writeError(w, http.StatusBadRequest, "playback mode is soundcheck or source")
				return false
			}
		default:
			writeError(w, http.StatusBadRequest, "a recorder route starts or ends on this desk's recorder")
			return false
		}
		if route.DstKind == domain.PortRecorder {
			if recordOn[track] {
				writeError(w, http.StatusBadRequest, fmt.Sprintf("Track %d records one source at most.", track))
				return false
			}
			recordOn[track] = true
		}
		if track > tracks && stored[routeKey(route)] {
			continue
		}
		if track < 1 || track > tracks {
			writeError(w, http.StatusConflict, fmt.Sprintf("Track %d is past %s's %d tracks.", track, deskLabelOf(console, deskModelOf(console)), tracks))
			return false
		}
	}
	return true
}

func (h AudioPatchHandler) setRecorderRoutes(w http.ResponseWriter, r *http.Request) {
	console, ok := h.eventConsole(w, r)
	if !ok {
		return
	}
	var routes []domain.DeskRoute
	if err := json.NewDecoder(r.Body).Decode(&routes); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if !h.validRecorderRoutes(w, console, routes) {
		return
	}
	if err := dbstore.ReplaceRecorderRoutes(h.DB, console, routes); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// fillRecorder is Record every preamp: the desk's patched preamps, in channel
// order, onto the free record tracks, each playing back into its own channel
// as soundcheck. Refused, changing nothing, when they do not fit.
func (h AudioPatchHandler) fillRecorder(w http.ResponseWriter, r *http.Request) {
	console, ok := h.eventConsole(w, r)
	if !ok {
		return
	}
	if !console.Recorder {
		writeError(w, http.StatusConflict, "Declare the desk's recorder in Rig first.")
		return
	}
	existing, err := dbstore.ListDeskRoutes(h.DB, console.EventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var kept []domain.DeskRoute
	usedTrack := map[int]bool{}
	recorded := map[int64]bool{}
	played := map[int64]bool{}
	for _, route := range existing {
		if route.DstKind == domain.PortRecorder && route.DstID == console.ID {
			kept = append(kept, route)
			usedTrack[route.DstPort] = true
			if route.SrcKind == domain.PortChannel {
				recorded[route.SrcID] = true
			}
		}
		if route.SrcKind == domain.PortRecorder && route.SrcID == console.ID {
			kept = append(kept, route)
			played[route.DstID] = true
			// A track already playing into a channel is taken, even if it records nothing.
			usedTrack[route.SrcPort] = true
		}
	}
	patched, err := dbstore.PatchedChannels(h.DB, console.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tracks := recorderTracks(console)
	next := kept
	track := 1
	for _, channelID := range patched {
		if recorded[channelID] {
			continue
		}
		for track <= tracks && usedTrack[track] {
			track++
		}
		if track > tracks {
			writeError(w, http.StatusConflict, fmt.Sprintf("%s's %d tracks cannot take every patched preamp.", deskLabelOf(console, deskModelOf(console)), tracks))
			return
		}
		usedTrack[track] = true
		next = append(next, domain.DeskRoute{SrcKind: domain.PortChannel, SrcID: channelID, DstKind: domain.PortRecorder, DstID: console.ID, DstPort: track})
		if !played[channelID] {
			next = append(next, domain.DeskRoute{SrcKind: domain.PortRecorder, SrcID: console.ID, SrcPort: track, DstKind: domain.PortChannel, DstID: channelID, Mode: domain.PlaySoundcheck})
		}
	}
	if err := dbstore.ReplaceRecorderRoutes(h.DB, console, next); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func routeKey(route domain.DeskRoute) string {
	return fmt.Sprintf("%s:%d:%d>%s:%d:%d", route.SrcKind, route.SrcID, route.SrcPort, route.DstKind, route.DstID, route.DstPort)
}
