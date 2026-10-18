package api

import (
	"fmt"
	"net/http"
	"slices"
	"strings"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
	"github.com/trionell/patchplanner/internal/service"
)

type routingPatch struct {
	Channels []domain.InputChannel     `json:"input_channels"`
	Outputs  []domain.AudioPatchOutput `json:"outputs"`
	Mixes    []domain.DeskMix          `json:"mixes"`
	Routes   []domain.DeskRoute        `json:"routes"`
	Consoles []domain.Console          `json:"consoles"`
}

func (f *deskFixture) patch() routingPatch {
	status, raw := doJSON(f.t, http.MethodGet, fmt.Sprintf("%s/events/%d/audio-patch", f.base, f.eventID), nil)
	if status != http.StatusOK {
		f.t.Fatalf("GET patch: %d %s", status, raw)
	}
	return decodeJSON[routingPatch](f.t, raw)
}

func (f *deskFixture) addMix(desk domain.Console, kind, width string) (int, []byte) {
	return doJSON(f.t, http.MethodPost, fmt.Sprintf("%s/%d/mixes", f.consoles, desk.ID), map[string]any{"kind": kind, "width": width})
}

func (f *deskFixture) mustAddMix(desk domain.Console, kind, width string) domain.DeskMix {
	status, raw := f.addMix(desk, kind, width)
	if status != http.StatusCreated {
		f.t.Fatalf("POST mix %s: %d %s", kind, status, raw)
	}
	return decodeJSON[domain.DeskMix](f.t, raw)
}

func (f *deskFixture) setSources(mix domain.DeskMix, sources ...map[string]any) (int, []byte) {
	return doJSON(f.t, http.MethodPatch, fmt.Sprintf("%s/events/%d/mixes/%d", f.base, f.eventID, mix.ID), map[string]any{"sources": sources})
}

func mainOf(p routingPatch, desk domain.Console, slot int) domain.DeskMix {
	for _, mix := range p.Mixes {
		if mix.ConsoleID != nil && *mix.ConsoleID == desk.ID && mix.Kind == domain.MixMain && mix.Slot == slot {
			return mix
		}
	}
	return domain.DeskMix{}
}

func channelSource(id int64) map[string]any { return map[string]any{"kind": "channel", "id": id} }
func mixSource(id int64) map[string]any     { return map[string]any{"kind": "mix", "id": id} }

func TestNewChannelJoinsMainLR(t *testing.T) {
	f, desk := newDeskFixture(t)
	kick := f.mustAddChannel(map[string]any{"channel_number": 1, "channel_name": "Kick"})
	p := f.patch()
	lr := mainOf(p, desk, 1)
	if lr.ID == 0 || lr.Name != "LR" {
		t.Fatalf("desk has no Main LR: %+v", p.Mixes)
	}
	for _, channel := range p.Channels {
		if channel.ID == kick.ID && !slices.Equal(channel.MixIDs, []int64{lr.ID}) {
			t.Errorf("Kick's mixes %v, want only Main LR %d", channel.MixIDs, lr.ID)
		}
	}
}

func TestMixPoolsOnAnM32(t *testing.T) {
	f, desk := newDeskFixture(t)
	f.switchTo(desk, "m32", true)
	for i := 0; i < 8; i++ {
		f.mustAddMix(desk, "subgroup", "mono")
	}
	for i := 0; i < 6; i++ {
		f.mustAddMix(desk, "monitor", "mono")
	}
	f.mustAddMix(desk, "fx", "mono")
	if fx := f.mustAddMix(desk, "fx", "mono"); fx.Slot != 16 || fx.Name != "Bus 16" {
		t.Errorf("last bus = %+v, want Bus 16", fx)
	}
	status, raw := f.addMix(desk, "monitor", "mono")
	if status != http.StatusConflict || !strings.Contains(string(raw), "8 subgroups · 6 monitors · 2 FX") {
		t.Errorf("a 17th bus: %d %s", status, raw)
	}
	if status, raw := f.addMix(desk, "main", "stereo"); status != http.StatusBadRequest {
		t.Errorf("adding a main: %d %s", status, raw)
	}
}

func TestMixSourcesFollowTheEngine(t *testing.T) {
	f, desk := newDeskFixture(t)
	f.switchTo(desk, "m32", true)
	kick := f.mustAddChannel(map[string]any{"channel_number": 1})
	matrix := f.mustAddMix(desk, "matrix", "mono")
	bus := f.mustAddMix(desk, "subgroup", "mono")
	bus2 := f.mustAddMix(desk, "subgroup", "mono")
	if status, raw := f.setSources(matrix, channelSource(kick.ID)); status != http.StatusBadRequest || !strings.Contains(string(raw), "not channels") {
		t.Errorf("channel into an X32 matrix: %d %s", status, raw)
	}
	if status, raw := f.setSources(matrix, mixSource(bus.ID), mixSource(mainOf(f.patch(), desk, 1).ID)); status != http.StatusOK {
		t.Errorf("bus and LR into a matrix: %d %s", status, raw)
	}
	if status, raw := f.setSources(bus2, mixSource(bus.ID)); status != http.StatusBadRequest {
		t.Errorf("X32 bus → bus: %d %s", status, raw)
	}
	lr := mainOf(f.patch(), desk, 1)
	if status, raw := doJSON(t, http.MethodDelete, fmt.Sprintf("%s/events/%d/mixes/%d", f.base, f.eventID, lr.ID), nil); status != http.StatusConflict {
		t.Errorf("deleting Main LR: %d %s", status, raw)
	}
}

func TestLV1GroupsAndMatrixLimit(t *testing.T) {
	f, desk := newDeskFixture(t)
	f.switchTo(desk, "lv1_64", true)
	g1 := f.mustAddMix(desk, "subgroup", "mono")
	g2 := f.mustAddMix(desk, "subgroup", "mono")
	if g1.Width != "stereo" {
		t.Errorf("an LV1 group is stereo, got %s", g1.Width)
	}
	if status, raw := f.setSources(g2, mixSource(g1.ID)); status != http.StatusOK {
		t.Errorf("group 1 → 2: %d %s", status, raw)
	}
	if status, raw := f.setSources(g1, mixSource(g2.ID)); status != http.StatusBadRequest || !strings.Contains(string(raw), "only the groups after it") {
		t.Errorf("group 2 → 1: %d %s", status, raw)
	}
	matrix := f.mustAddMix(desk, "matrix", "mono")
	var sources []map[string]any
	for n := 1; n <= 13; n++ {
		sources = append(sources, channelSource(f.mustAddChannel(map[string]any{"channel_number": n}).ID))
	}
	if status, raw := f.setSources(matrix, sources[:12]...); status != http.StatusOK {
		t.Errorf("12 sources: %d %s", status, raw)
	}
	if status, raw := f.setSources(matrix, sources...); status != http.StatusConflict {
		t.Errorf("13 sources: %d %s", status, raw)
	}
}

func TestFedBy(t *testing.T) {
	f, desk := newDeskFixture(t)
	f.switchTo(desk, "m32", true)
	outputs := fmt.Sprintf("%s/events/%d/audio-outputs", f.base, f.eventID)
	status, raw := doJSON(t, http.MethodPost, outputs, map[string]any{"output_number": 1, "output_type": "sub", "width": "mono"})
	if status != http.StatusCreated {
		t.Fatalf("POST output: %d %s", status, raw)
	}
	sub := decodeJSON[domain.AudioPatchOutput](t, raw)
	fedBy := fmt.Sprintf("%s/%d/fed-by", outputs, sub.ID)
	lr := mainOf(f.patch(), desk, 1)
	fx := f.mustAddMix(desk, "fx", "mono")
	kick := f.mustAddChannel(map[string]any{"channel_number": 1})

	if status, raw := doJSON(t, http.MethodPut, fedBy, map[string]any{"src_kind": "mix", "src_id": lr.ID}); status != http.StatusBadRequest || !strings.Contains(string(raw), "needs a side") {
		t.Errorf("stereo LR on a mono output without a side: %d %s", status, raw)
	}
	if status, raw := doJSON(t, http.MethodPut, fedBy, map[string]any{"src_kind": "mix", "src_id": lr.ID, "side": "R"}); status != http.StatusNoContent {
		t.Errorf("LR R: %d %s", status, raw)
	}
	if status, raw := doJSON(t, http.MethodPut, fedBy, map[string]any{"src_kind": "mix", "src_id": fx.ID}); status != http.StatusBadRequest {
		t.Errorf("an FX send: %d %s", status, raw)
	}
	if status, raw := doJSON(t, http.MethodPut, fedBy, map[string]any{"src_kind": "channel", "src_id": kick.ID}); status != http.StatusBadRequest {
		t.Errorf("an X32 direct out: %d %s", status, raw)
	}
	var fed []domain.DeskRoute
	for _, route := range f.patch().Routes {
		if route.DstKind == domain.PortOutput && route.DstID == sub.ID {
			fed = append(fed, route)
		}
	}
	if len(fed) != 1 || fed[0].SrcID != lr.ID || fed[0].SrcPort != 1 {
		t.Errorf("Sub fed by %+v, want LR R", fed)
	}
	// Deleting the output clears the route naming it.
	if status, raw := doJSON(t, http.MethodDelete, fmt.Sprintf("%s/%d", outputs, sub.ID), nil); status >= 300 {
		t.Fatalf("delete output: %d %s", status, raw)
	}
	for _, route := range f.patch().Routes {
		if route.DstKind == domain.PortOutput && route.DstID == sub.ID {
			t.Errorf("a route still names the deleted output: %+v", route)
		}
	}
}

func TestChannelRoutesFollowItsDesk(t *testing.T) {
	f, foh := newDeskFixture(t)
	status, raw := doJSON(t, http.MethodPost, f.consoles, map[string]any{"name": "Mon", "role": "monitor", "desk_model": "lv1_64"})
	if status != http.StatusCreated {
		t.Fatalf("POST console: %d %s", status, raw)
	}
	mon := decodeJSON[domain.Console](t, raw)
	kick := f.mustAddChannel(map[string]any{"channel_number": 1, "channel_name": "Kick", "console_id": foh.ID})
	drums := f.mustAddMix(foh, "subgroup", "mono")
	monMix := f.mustAddMix(foh, "monitor", "mono")
	if status, raw := f.setSources(monMix, channelSource(kick.ID)); status != http.StatusOK {
		t.Fatalf("Kick into a monitor: %d %s", status, raw)
	}
	lr := mainOf(f.patch(), foh, 1)
	kick.MixIDs = []int64{lr.ID, drums.ID}
	if status, raw := doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", f.channels, kick.ID), kick); status != http.StatusOK {
		t.Fatalf("PATCH mixes: %d %s", status, raw)
	}
	// A row save leaves monitor membership alone.
	routesFrom := func(id int64) (n int) {
		for _, route := range f.patch().Routes {
			if route.SrcKind == "channel" && route.SrcID == id {
				n++
			}
		}
		return n
	}
	if got := routesFrom(kick.ID); got != 3 {
		t.Errorf("Kick has %d routes, want LR, Drums and the monitor", got)
	}
	// Another desk's mix is refused.
	monLR := mainOf(f.patch(), mon, 1)
	kick.MixIDs = []int64{monLR.ID}
	if status, raw := doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", f.channels, kick.ID), kick); status != http.StatusBadRequest {
		t.Errorf("a mix of another desk: %d %s", status, raw)
	}
	// Moving the channel drops every route on FOH and joins Monitor's Main LR.
	kick.ConsoleID = &mon.ID
	kick.ChannelNumber = 1
	kick.MixIDs = nil
	if status, raw := doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", f.channels, kick.ID), kick); status != http.StatusOK {
		t.Fatalf("move Kick: %d %s", status, raw)
	}
	for _, channel := range f.patch().Channels {
		if channel.ID == kick.ID && !slices.Equal(channel.MixIDs, []int64{monLR.ID}) {
			t.Errorf("moved Kick's mixes %v, want Monitor's LR", channel.MixIDs)
		}
	}
	if got := routesFrom(kick.ID); got != 1 {
		t.Errorf("moved Kick has %d routes, want 1", got)
	}
	// Deleting it leaves no route behind.
	if status, raw := doJSON(t, http.MethodDelete, fmt.Sprintf("%s/%d", f.channels, kick.ID), nil); status >= 300 {
		t.Fatalf("delete channel: %d %s", status, raw)
	}
	if got := routesFrom(kick.ID); got != 0 {
		t.Errorf("%d routes outlive the channel", got)
	}
}

func TestRecorder(t *testing.T) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	f := &deskFixture{t: t, base: server.URL, eventID: eventID,
		channels: fmt.Sprintf("%s/events/%d/input-channels", server.URL, eventID),
		consoles: fmt.Sprintf("%s/events/%d/consoles", server.URL, eventID)}
	desk := f.desks()[0]
	f.switchTo(desk, "m32", true)
	recorder := fmt.Sprintf("%s/%d/recorder", f.consoles, desk.ID)
	if status, raw := doJSON(t, http.MethodPost, recorder+"/fill", nil); status != http.StatusConflict {
		t.Errorf("fill without a recorder: %d %s", status, raw)
	}
	status, raw := doJSON(t, http.MethodPut, recorder, map[string]any{"recorder": true, "recorder_tracks": 7})
	if status != http.StatusOK {
		t.Fatalf("declare recorder: %d %s", status, raw)
	}
	if got := decodeJSON[domain.Console](t, raw); !got.Recorder || got.RecorderTracks != 32 {
		t.Errorf("M32 card = %+v, want 32 tracks whatever was typed", got)
	}

	// Two patched preamps: a source cabled straight into each channel.
	sources := fmt.Sprintf("%s/events/%d/input-sources", server.URL, eventID)
	cables := fmt.Sprintf("%s/events/%d/input-cables", server.URL, eventID)
	var patched []domain.InputChannel
	for n := 1; n <= 2; n++ {
		channel := f.mustAddChannel(map[string]any{"channel_number": n})
		status, raw := doJSON(t, http.MethodPost, sources, map[string]any{"name": fmt.Sprintf("DI %d", n), "kind": "line", "connector_type": "xlr", "width": "mono"})
		if status != http.StatusCreated {
			t.Fatalf("POST source: %d %s", status, raw)
		}
		source := decodeJSON[domain.InputSource](t, raw)
		if status, raw := doJSON(t, http.MethodPost, cables, map[string]any{"from_kind": "source", "from_id": source.ID, "to_kind": "channel", "to_id": channel.ID}); status != http.StatusCreated {
			t.Fatalf("POST cable: %d %s", status, raw)
		}
		patched = append(patched, channel)
	}
	f.mustAddChannel(map[string]any{"channel_number": 3}) // unpatched: not recorded
	if status, raw := doJSON(t, http.MethodPost, recorder+"/fill", nil); status != http.StatusNoContent {
		t.Fatalf("fill: %d %s", status, raw)
	}
	var record, play int
	for _, route := range f.patch().Routes {
		if route.DstKind == domain.PortRecorder {
			record++
			if route.DstPort != int(route.SrcID-patched[0].ID)+1 {
				t.Errorf("track %d records channel %d", route.DstPort, route.SrcID)
			}
		}
		if route.SrcKind == domain.PortRecorder && route.Mode == domain.PlaySoundcheck {
			play++
		}
	}
	if record != 2 || play != 2 {
		t.Errorf("filled %d record and %d playback routes, want 2 and 2", record, play)
	}
	// A track past the card's 32 is refused.
	if status, raw := doJSON(t, http.MethodPut, recorder+"/routes", []map[string]any{{"src_kind": "channel", "src_id": patched[0].ID, "dst_kind": "recorder", "dst_id": desk.ID, "dst_port": 33}}); status != http.StatusConflict || !strings.Contains(string(raw), "past") {
		t.Errorf("track 33: %d %s", status, raw)
	}
}

func TestSwitchMapsMixes(t *testing.T) {
	f, desk := newDeskFixture(t)
	f.switchTo(desk, "lv1_64", true)
	g1 := f.mustAddMix(desk, "subgroup", "mono")
	g2 := f.mustAddMix(desk, "subgroup", "mono")
	if status, raw := f.setSources(g2, mixSource(g1.ID)); status != http.StatusOK {
		t.Fatalf("group 1 → 2: %d %s", status, raw)
	}
	for i := 0; i < 15; i++ {
		f.mustAddMix(desk, "monitor", "mono")
	}
	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/%d/switch", f.consoles, desk.ID), map[string]any{"desk_model": "m32"})
	if status != http.StatusOK {
		t.Fatalf("preview: %d %s", status, raw)
	}
	preview := decodeJSON[struct {
		Mapping service.Mapping     `json:"mapping"`
		Mixes   []service.MappedMix `json:"mixes"`
	}](t, raw)
	over, mainsOver := 0, 0
	for _, mix := range preview.Mixes {
		if mix.Over && mix.Kind == domain.MixMain {
			mainsOver++
		} else if mix.Over {
			over++
		}
	}
	// 2 stereo groups take 4 buses on an X32, then 12 monitors fit; 3 are over,
	// and LV1's Mono main has no place on an M32.
	if over != 3 || mainsOver != 1 {
		t.Errorf("%d mixes and %d mains over, want 3 and 1", over, mainsOver)
	}
	var sawGroupRoute bool
	for _, line := range preview.Mapping.Lines {
		if line.Word == service.WordLeftOut && strings.Contains(line.Text, "routes") || strings.Contains(line.Text, "route ") {
			sawGroupRoute = true
		}
	}
	if !sawGroupRoute {
		t.Errorf("group → group not listed as Left out: %+v", preview.Mapping.Lines)
	}
	f.switchTo(desk, "m32", true)
	var routes int
	for _, route := range f.patch().Routes {
		if route.SrcKind == "mix" && route.SrcID == g1.ID && route.DstID == g2.ID {
			routes++
		}
	}
	if routes != 1 {
		t.Error("the group → group route was not kept")
	}
	mains := 0
	for _, mix := range f.patch().Mixes {
		if mix.Kind == domain.MixMain && mix.ConsoleID != nil && *mix.ConsoleID == desk.ID {
			mains++
		}
	}
	// LV1 64's L/R, C and Mono kept; Mono is over on an M32.
	if mains != 3 {
		t.Errorf("%d mains, want 3 kept", mains)
	}
}
