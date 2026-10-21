package service

import (
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
	"github.com/trionell/patchplanner/internal/service/consolefile"
)

// ErrGenericDesk is an export asked of a desk with no model: there is no file
// format for it, and the dialog says to pick a model in Rig.
var ErrGenericDesk = errors.New("a Generic desk has no showfile: pick its model in Rig")

// PortChoice is where the export dialog put one stagebox (or the desk's local
// jacks) on the desk's I/O (Slice 49 D2). X32 · M32: a socket group and the
// index of the box's first port on it. LV1: an I/O bank and slot and the device
// model there.
type PortChoice struct {
	Socket string `json:"socket"` // x32: local | a | b | card
	Start  int    `json:"start"`
	Bank   int    `json:"bank"`
	Slot   int    `json:"slot"`
	Device string `json:"device"` // SG4000 | SG1000 | Classic | Other
}

// ExportPorts maps "stagebox:<id>" and "local" to where they sit; a box that is
// absent is not connected.
type ExportPorts map[string]PortChoice

// ExportFigure is one of the dialog's figures: what the file holds.
type ExportFigure struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

// ConsoleExport is a written showfile and its preview.
type ConsoleExport struct {
	Bytes    []byte               `json:"-"`
	Filename string               `json:"-"`
	Figures  []ExportFigure       `json:"figures"`
	Notices  []consolefile.Notice `json:"lines"`
	// Boxes are the stageboxes the desk uses, for the dialog's port rows.
	Boxes []ExportBox `json:"boxes"`
}

// ExportBox is one row of the dialog's port mapping.
type ExportBox struct {
	Key    string `json:"key"`
	Name   string `json:"name"`
	Inputs int    `json:"inputs"`
	// Model is the box's recorded model, which the dialog defaults an LV1 device to.
	Model string `json:"model,omitempty"`
	// Fixed is a row the desk decides (X32 local jacks): stated, never chosen.
	Fixed string `json:"fixed,omitempty"`
}

// BuildConsoleExport writes one desk of an event as the file its model loads:
// an X32 · M32 scene or an LV1 session. The preview's figures and lines come
// from the same pass that writes the file, so what the dialog says is what the
// download does (Slice 49 D1).
func (s ExportService) BuildConsoleExport(eventID, consoleID int64, ports ExportPorts) (ConsoleExport, error) {
	event, err := db.GetEvent(s.DB, eventID)
	if err != nil {
		return ConsoleExport{}, err
	}
	console, err := db.GetConsole(s.DB, consoleID)
	if err != nil {
		return ConsoleExport{}, err
	}
	if console.EventID != eventID {
		return ConsoleExport{}, sql.ErrNoRows
	}
	model, _ := domain.LookupDeskModel(console.DeskModel)
	model = model.WithBusMode(console.BusMode)
	if model.Engine == domain.EngineGeneric {
		return ConsoleExport{}, ErrGenericDesk
	}
	data, err := loadAudioGraphData(s.DB, eventID, event.InventoryID)
	if err != nil {
		return ConsoleExport{}, err
	}
	allRoutes, err := db.ListDeskRoutes(s.DB, eventID)
	if err != nil {
		return ConsoleExport{}, err
	}
	var routes []domain.DeskRoute
	for _, route := range allRoutes {
		if route.ConsoleID == console.ID {
			routes = append(routes, route)
		}
	}

	show := consolefile.Show{EventName: event.Name, DeskName: console.Name, Engine: model.Engine}
	var notices []consolefile.Notice
	boxName := map[string]string{}
	for _, box := range data.stageboxes {
		boxName[fmt.Sprintf("stagebox:%d", box.ID)] = box.Name
	}
	unmapped := map[string]bool{}
	usedBoxes := map[string]bool{}
	boxName["local"] = "Local jacks"

	// resolve is a box port as a desk port, through the dialog's choices.
	//
	// X32 · M32's local jacks are the desk's own sockets and always sit at Local 1:
	// the dialog states them rather than offering a choice (Slice 49 review). An LV1
	// Classic's local jacks default to an LV1 Classic in the first slot no box takes.
	socketSize := map[string]int{"local": 32, "a": 48, "b": 48, "card": 32}
	var pastSocket []string
	resolve := func(kind string, id int64, port int) *consolefile.DeskPort {
		key := ""
		switch kind {
		case "stagebox":
			key = fmt.Sprintf("stagebox:%d", id)
		case "console_local":
			if id != console.ID {
				return nil
			}
			key = "local"
		case "console_aux":
			// The desk's own aux in sockets: fixed, never mapped, and only an X32 ·
			// M32 has them (D9).
			if id != console.ID || model.Engine != domain.EngineX32 {
				return nil
			}
			return &consolefile.DeskPort{Socket: "aux", Index: port}
		default:
			return nil
		}
		usedBoxes[key] = true
		choice, ok := ports[key]
		if key == "local" && model.Engine == domain.EngineX32 {
			choice, ok = PortChoice{Socket: "local"}, true
		}
		if !ok && key == "local" && model.Engine == domain.EngineLV1 && model.LocalIn > 0 {
			choice, ok = classicSlot(ports), true
		}
		if !ok {
			unmapped[key] = true
			return nil
		}
		if model.Engine == domain.EngineX32 {
			index := choice.Start + port
			if size := socketSize[choice.Socket]; index >= size {
				// A box past the end of its socket must not spill onto the next one —
				// its preamps and 48 V would be another box's.
				pastSocket = append(pastSocket, fmt.Sprintf("%s %d", boxName[key], port+1))
				return nil
			}
			return &consolefile.DeskPort{Socket: choice.Socket, Index: index}
		}
		return &consolefile.DeskPort{Socket: "device", Bank: choice.Bank, Slot: choice.Slot, Index: choice.Start + port, Device: choice.Device}
	}

	// The desk input a channel's port sits on: the box whose cable lands on it.
	inputOf := func(channelID int64, port int) *consolefile.DeskPort {
		for _, cable := range data.inCables {
			if cable.ToKind == "channel" && cable.ToID == channelID && cable.ToPort == port {
				return resolve(cable.FromKind, cable.FromID, cable.FromPort)
			}
		}
		return nil
	}
	feeds := inputSourcesByChannel(data)
	phantomCount := 0
	stripCount, auxCount := 0, 0
	var overStrips, overMixes []string
	for _, channel := range data.channels {
		if channel.ConsoleID == nil || *channel.ConsoleID != console.ID {
			continue
		}
		capacity := model.PoolCapacity(channel.StripPool, 0)
		width := model.StripWidth(channel.Width, channel.MixerBehavior)
		// Checked before its ports are resolved, so a box only an over row uses is
		// not reported as having no port.
		if channel.ChannelNumber+width-1 > capacity {
			overStrips = append(overStrips, channel.ChannelName)
			continue
		}
		strip := consolefile.Strip{
			ID: channel.ID, Aux: channel.StripPool == domain.PoolAux, Number: channel.ChannelNumber,
			Stereo: channel.Width == "stereo", Name: channel.ChannelName, Color: channel.Color,
			Input: inputOf(channel.ID, 0), Phantom: feeds[channel.ID].phantom,
		}
		if strip.Stereo {
			strip.InputR = inputOf(channel.ID, 1)
		}
		if strip.Aux {
			auxCount++
		} else {
			stripCount++
		}
		if strip.Phantom && strip.Input != nil {
			phantomCount++
		}
		show.Strips = append(show.Strips, strip)
	}

	mixCount, dcaCount, muteCount := 0, 0, 0
	for _, mix := range data.mixes {
		if mix.ConsoleID == nil || *mix.ConsoleID != console.ID {
			continue
		}
		pool := model.PoolOf(mix.Kind)
		if mix.Kind != domain.MixMain && !pool.Unbounded && mix.Slot+model.MixSlotWidth(mix.Kind, mix.Width)-1 > pool.Capacity {
			overMixes = append(overMixes, mix.Name)
			continue
		}
		switch mix.Kind {
		case domain.MixDCA:
			dcaCount++
		case domain.MixMute:
			muteCount++
		case domain.MixMain:
		default:
			mixCount++
		}
		show.Mixes = append(show.Mixes, consolefile.Mix{ID: mix.ID, Kind: mix.Kind, Slot: mix.Slot, Stereo: mix.Width == "stereo", Name: mix.Name, Color: mix.Color})
	}

	for _, over := range []struct {
		items []string
		one   string
		many  string
	}{{overStrips, "channel", "channels"}, {overMixes, "mix", "mixes"}} {
		if len(over.items) > 0 {
			noun := over.many
			if len(over.items) == 1 {
				noun = over.one
			}
			notices = append(notices, consolefile.Notice{Word: consolefile.LeftOut, Text: fmt.Sprintf("%d %s flagged over on %s, not in the file.", len(over.items), noun, console.Name), Items: over.items})
		}
	}

	fedBy := map[int64]domain.DeskRoute{}
	for _, route := range routes {
		switch {
		case route.DstKind == domain.PortMix && route.SrcKind == domain.PortChannel:
			show.Routes = append(show.Routes, consolefile.Route{FromStrip: route.SrcID, ToMix: route.DstID})
		case route.DstKind == domain.PortMix && route.SrcKind == domain.PortMix:
			show.Routes = append(show.Routes, consolefile.Route{FromMix: route.SrcID, ToMix: route.DstID})
		case route.DstKind == domain.PortOutput:
			fedBy[route.DstID] = route
		}
	}

	patched, total := 0, 0
	for _, output := range data.outputs {
		if output.ConsoleID == nil || *output.ConsoleID != console.ID {
			continue
		}
		total++
		out := consolefile.Output{ID: output.ID, Name: output.OutputName, Stereo: output.Width == "stereo"}
		for _, cable := range data.outCables {
			if cable.FromKind != "mixer" || cable.FromID != output.ID {
				continue
			}
			port := resolve(cable.ToKind, cable.ToID, cable.ToPort)
			if cable.FromPort == 1 {
				out.PortR = port
			} else {
				out.Port = port
			}
		}
		if route, ok := fedBy[output.ID]; ok {
			if route.SrcKind == domain.PortMix {
				out.FedByMix, out.FedBySide = route.SrcID, route.SrcPort
			} else {
				out.FedByStrip = route.SrcID
			}
		}
		if out.Port != nil {
			patched++
		}
		show.Outputs = append(show.Outputs, out)
	}

	tracks := map[int]*consolefile.Track{}
	track := func(n int) *consolefile.Track {
		if tracks[n] == nil {
			tracks[n] = &consolefile.Track{Number: n}
		}
		return tracks[n]
	}
	if console.Recorder {
		show.RecorderTracks = model.RecorderTracks()
		for _, route := range routes {
			switch {
			case route.DstKind == domain.PortRecorder:
				t := track(route.DstPort)
				if route.SrcKind == domain.PortChannel {
					t.FromStrip = route.SrcID
				} else {
					t.FromMix, t.FromSide = route.SrcID, route.SrcPort
				}
			case route.SrcKind == domain.PortRecorder && route.DstKind == domain.PortChannel:
				t := track(route.SrcPort)
				t.PlayStrip, t.Soundcheck = route.DstID, route.Mode == domain.PlaySoundcheck
			}
		}
		numbers := make([]int, 0, len(tracks))
		for n := range tracks {
			numbers = append(numbers, n)
		}
		sort.Ints(numbers)
		for _, n := range numbers {
			show.Tracks = append(show.Tracks, *tracks[n])
		}
	}

	var bytes []byte
	var written []consolefile.Notice
	ext := "scn"
	if model.Engine == domain.EngineX32 {
		bytes, written = consolefile.WriteX32(show)
	} else {
		ext = "emo"
		bytes, written, err = consolefile.WriteLV1(show)
		if err != nil {
			return ConsoleExport{}, err
		}
	}
	if len(pastSocket) > 0 {
		notices = append(notices, consolefile.Notice{Word: consolefile.LeftOut, Text: fmt.Sprintf("%d box ports past the end of their socket; move the box's first port.", len(pastSocket)), Items: pastSocket})
	}
	notices = append(notices, written...)
	keys := make([]string, 0, len(unmapped))
	for key := range unmapped {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		name := boxName[key]
		if key == "local" {
			name = "the desk's local jacks"
		}
		notices = append(notices, consolefile.Notice{Word: consolefile.NoPort, Text: fmt.Sprintf("No port for %s: what it carries is written with no patch, 48 V or recording.", name)})
	}

	var boxes []ExportBox
	for _, box := range data.stageboxes {
		key := fmt.Sprintf("stagebox:%d", box.ID)
		if usedBoxes[key] {
			boxes = append(boxes, ExportBox{Key: key, Name: box.Name, Inputs: box.OutputCount, Model: box.Model})
		}
	}
	if usedBoxes["local"] {
		local := ExportBox{Key: "local", Name: "Local jacks", Inputs: console.LocalInputCount}
		switch {
		case model.Engine == domain.EngineX32:
			local.Fixed = "Local 1 on, the desk's own sockets"
		case model.LocalIn > 0:
			local.Model = "Classic"
		}
		// An LV1 software desk has no local jacks to map.
		if model.Engine == domain.EngineX32 || model.LocalIn > 0 {
			boxes = append(boxes, local)
		}
	}

	strips := fmt.Sprintf("%d", stripCount)
	if model.Engine == domain.EngineX32 && auxCount > 0 {
		strips = fmt.Sprintf("%d +%d aux", stripCount, auxCount)
	}
	recorder := "—"
	if console.Recorder {
		label := "Card"
		if model.Engine == domain.EngineLV1 {
			label = "SoundGrid"
		}
		rec, play := 0, 0
		for _, t := range show.Tracks {
			if t.FromStrip != 0 || t.FromMix != 0 {
				rec++
			}
			if t.PlayStrip != 0 {
				play++
			}
		}
		recorder = fmt.Sprintf("%d · %d %s", rec, play, label)
	}
	figures := []ExportFigure{
		{"Channel strips", strips},
		{"Mixes", fmt.Sprintf("%d", mixCount)},
		{"DCAs · mutes", fmt.Sprintf("%d · %d", dcaCount, muteCount)},
		{"48 V", fmt.Sprintf("%d", phantomCount)},
		{"Outputs patched", fmt.Sprintf("%d of %d", patched, total)},
		{"Recorder", recorder},
	}
	return ConsoleExport{
		Bytes:    bytes,
		Filename: fmt.Sprintf("%s-%s.%s", fileSafe(event.Name), fileSafe(console.Name), ext),
		Figures:  figures,
		Notices:  orderNotices(notices),
		Boxes:    boxes,
	}, nil
}

// orderNotices puts the lines in the preview's order: Left out, Changed, No input, No port.
func orderNotices(notices []consolefile.Notice) []consolefile.Notice {
	rank := map[string]int{consolefile.LeftOut: 0, consolefile.Changed: 1, consolefile.NoInput: 2, consolefile.NoPort: 3}
	sort.SliceStable(notices, func(i, j int) bool { return rank[notices[i].Word] < rank[notices[j].Word] })
	return notices
}

// fileSafe is a name fit for the downloaded file: English letters only (see
// consolefile.ASCII), and none of the characters a file system refuses.
func fileSafe(name string) string {
	name = strings.TrimSpace(consolefile.ASCII(name))
	if name == "" {
		return "desk"
	}
	return strings.Map(func(r rune) rune {
		if strings.ContainsRune(`/\:*?"<>|`, r) {
			return '-'
		}
		return r
	}, name)
}

// classicSlot is where an LV1 Classic's own local I/O sits when the dialog has not
// said: the first I/O slot no box is mapped to.
func classicSlot(ports ExportPorts) PortChoice {
	taken := map[[2]int]bool{}
	for _, choice := range ports {
		taken[[2]int{choice.Bank, choice.Slot}] = true
	}
	for bank := 0; bank < 2; bank++ {
		for slot := 0; slot < 8; slot++ {
			if !taken[[2]int{bank, slot}] {
				return PortChoice{Bank: bank, Slot: slot, Device: "Classic"}
			}
		}
	}
	return PortChoice{Device: "Classic"}
}
