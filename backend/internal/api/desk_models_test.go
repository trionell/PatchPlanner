package api

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
	"github.com/trionell/patchplanner/internal/service"
)

type deskFixture struct {
	t        *testing.T
	base     string
	eventID  int64
	channels string
	consoles string
}

func newDeskFixture(t *testing.T) (*deskFixture, domain.Console) {
	server, _ := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	f := &deskFixture{
		t: t, base: server.URL, eventID: eventID,
		channels: fmt.Sprintf("%s/events/%d/input-channels", server.URL, eventID),
		consoles: fmt.Sprintf("%s/events/%d/consoles", server.URL, eventID),
	}
	return f, f.desks()[0]
}

func (f *deskFixture) desks() []domain.Console {
	status, raw := doJSON(f.t, http.MethodGet, fmt.Sprintf("%s/events/%d/audio-patch", f.base, f.eventID), nil)
	if status != http.StatusOK {
		f.t.Fatalf("GET patch: %d %s", status, raw)
	}
	return decodeJSON[struct {
		Consoles []domain.Console `json:"consoles"`
	}](f.t, raw).Consoles
}

func (f *deskFixture) channelList() []domain.InputChannel {
	status, raw := doJSON(f.t, http.MethodGet, fmt.Sprintf("%s/events/%d/audio-patch", f.base, f.eventID), nil)
	if status != http.StatusOK {
		f.t.Fatalf("GET patch: %d %s", status, raw)
	}
	return decodeJSON[struct {
		Channels []domain.InputChannel `json:"input_channels"`
	}](f.t, raw).Channels
}

func (f *deskFixture) addChannel(payload map[string]any) (int, []byte) {
	return doJSON(f.t, http.MethodPost, f.channels, payload)
}

func (f *deskFixture) mustAddChannel(payload map[string]any) domain.InputChannel {
	status, raw := f.addChannel(payload)
	if status != http.StatusCreated {
		f.t.Fatalf("POST channel %v: %d %s", payload, status, raw)
	}
	return decodeJSON[domain.InputChannel](f.t, raw)
}

func (f *deskFixture) switchTo(desk domain.Console, model string, apply bool) service.Mapping {
	status, raw := doJSON(f.t, http.MethodPost, fmt.Sprintf("%s/%d/switch", f.consoles, desk.ID), map[string]any{"desk_model": model, "apply": apply})
	if status != http.StatusOK {
		f.t.Fatalf("switch to %s: %d %s", model, status, raw)
	}
	return decodeJSON[struct {
		Mapping service.Mapping `json:"mapping"`
	}](f.t, raw).Mapping
}

func TestDeskModelsList(t *testing.T) {
	server, _ := newTestServer(t)
	status, raw := doJSON(t, http.MethodGet, server.URL+"/desk-models", nil)
	if status != http.StatusOK {
		t.Fatalf("GET desk-models: %d %s", status, raw)
	}
	if models := decodeJSON[[]domain.DeskModel](t, raw); len(models) != 17 {
		t.Errorf("%d models, want 17", len(models))
	}
}

// The wedding, end to end: a Generic desk with stereo Piano on 7, switched to
// the M32R it is. The preview's numbers are the numbers the switch writes.
func TestDeskSwitchWeddingToM32R(t *testing.T) {
	f, desk := newDeskFixture(t)
	if desk.DeskModel != domain.DeskModelGeneric {
		t.Fatalf("a new event's desk is %q, want generic", desk.DeskModel)
	}
	for n := 1; n <= 6; n++ {
		f.mustAddChannel(map[string]any{"channel_number": n})
	}
	piano := f.mustAddChannel(map[string]any{"channel_number": 7, "channel_name": "Piano", "width": "stereo"})
	trumpet := f.mustAddChannel(map[string]any{"channel_number": 8, "channel_name": "Trumpet"})

	preview := f.switchTo(desk, "m32r", false)
	previewed := map[int64]int{}
	for _, row := range preview.Rows {
		previewed[row.ID] = row.ToNumber
	}
	if previewed[trumpet.ID] != 9 {
		t.Errorf("preview puts Trumpet on %d, want 9", previewed[trumpet.ID])
	}
	// The preview changed nothing.
	for _, channel := range f.channelList() {
		if channel.ID == trumpet.ID && channel.ChannelNumber != 8 {
			t.Fatalf("preview moved Trumpet to %d", channel.ChannelNumber)
		}
	}

	f.switchTo(desk, "m32r", true)
	for _, channel := range f.channelList() {
		if channel.ChannelNumber != previewed[channel.ID] {
			t.Errorf("channel %d on %d, preview said %d", channel.ID, channel.ChannelNumber, previewed[channel.ID])
		}
		if channel.ID == piano.ID && channel.MixerBehavior != "linked_channels" {
			t.Errorf("Piano mixer_behavior %q, want linked_channels", channel.MixerBehavior)
		}
	}
	switched := f.desks()[0]
	if switched.DeskModel != "m32r" || switched.InputCount != 32 || switched.LocalInputCount != 16 || switched.LocalOutputCount != 8 || switched.OutputCount != 0 {
		t.Errorf("switched desk = %+v, want M32R's profile", switched)
	}

	// Typed counts on a real model are ignored.
	status, raw := doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", f.consoles, desk.ID), map[string]any{"input_count": 99, "desk_model": "lv1_64"})
	if status != http.StatusOK {
		t.Fatalf("PATCH console: %d %s", status, raw)
	}
	if got := decodeJSON[domain.Console](t, raw); got.InputCount != 32 || got.DeskModel != "m32r" {
		t.Errorf("PATCH changed a derived count or the model: %+v", got)
	}
}

func TestStripChecksOnAnM32(t *testing.T) {
	f, desk := newDeskFixture(t)
	f.switchTo(desk, "m32l", true)
	f.mustAddChannel(map[string]any{"channel_number": 1, "channel_name": "Kick"})
	f.mustAddChannel(map[string]any{"channel_number": 7, "channel_name": "Pausmusik L/R", "width": "stereo", "strip_pool": "aux"})

	if got := f.mustAddChannel(map[string]any{"channel_number": 0}); got.ChannelNumber != 2 {
		t.Errorf("suggested number %d, want 2", got.ChannelNumber)
	}
	for _, c := range []struct {
		name    string
		payload map[string]any
		message string
		fix     int
	}{
		{"even stereo start", map[string]any{"channel_number": 6, "width": "stereo"}, "a stereo channel starts on an odd number", 5},
		{"past aux", map[string]any{"channel_number": 9, "strip_pool": "aux"}, "Aux 9 is past M32 Live's 8 aux inputs.", 1},
		{"taken aux", map[string]any{"channel_number": 7, "strip_pool": "aux"}, "Aux 7 is Pausmusik L/R's.", 1},
	} {
		status, raw := f.addChannel(c.payload)
		if status != http.StatusConflict {
			t.Errorf("%s: status %d %s, want 409", c.name, status, raw)
			continue
		}
		refusal := decodeJSON[domain.StripRefusal](t, raw)
		if !strings.Contains(refusal.Message, c.message) || refusal.Fix == nil || refusal.Fix.Number != c.fix {
			t.Errorf("%s: %+v (fix %+v)", c.name, refusal, refusal.Fix)
		}
	}

	// Fill the channel pool; the next + Channel names the desk and points at aux.
	for len(f.channelList()) < 33 {
		f.mustAddChannel(map[string]any{"channel_number": 0})
	}
	status, raw := f.addChannel(map[string]any{"channel_number": 0})
	if status != http.StatusConflict || !strings.Contains(string(raw), "32 channels are taken. Free a channel, or move one to the aux section") {
		t.Errorf("full pool: %d %s", status, raw)
	}
}

func TestOverRowStaysEditable(t *testing.T) {
	f, desk := newDeskFixture(t)
	f.switchTo(desk, "lv1_64", true)
	far := f.mustAddChannel(map[string]any{"channel_number": 40, "channel_name": "Ambience"})
	f.switchTo(desk, "m32", true)

	far.ChannelName = "Ambience L"
	status, raw := doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", f.channels, far.ID), far)
	if status != http.StatusOK {
		t.Errorf("renaming an over row: %d %s", status, raw)
	}
	far.ChannelNumber = 41
	if status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", f.channels, far.ID), far); status != http.StatusConflict {
		t.Errorf("moving an over row further past the end: %d %s, want 409", status, raw)
	}
}

func TestEveryRowIsOnADesk(t *testing.T) {
	f, first := newDeskFixture(t)
	status, raw := doJSON(t, http.MethodPost, f.consoles, map[string]any{"name": "Mon", "role": "monitor", "desk_model": "lv1_80"})
	if status != http.StatusCreated {
		t.Fatalf("POST console: %d %s", status, raw)
	}
	monitor := decodeJSON[domain.Console](t, raw)
	if monitor.BusMode != domain.BusModeMonitors || monitor.InputCount != 80 {
		t.Errorf("LV1 80 monitor desk = %+v, want Monitors mode and 80 strips", monitor)
	}

	if status, raw := f.addChannel(map[string]any{"channel_number": 1}); status != http.StatusBadRequest || !strings.Contains(string(raw), "Pick the desk this channel is on.") {
		t.Errorf("two desks, no console_id: %d %s", status, raw)
	}
	outputs := fmt.Sprintf("%s/events/%d/audio-outputs", f.base, f.eventID)
	if status, raw := doJSON(t, http.MethodPost, outputs, map[string]any{"output_number": 1, "output_type": "foh"}); status != http.StatusBadRequest {
		t.Errorf("two desks, output without console_id: %d %s", status, raw)
	}

	// A channel left on no desk by a deleted desk is placed onto the other.
	kick := f.mustAddChannel(map[string]any{"channel_number": 5, "channel_name": "Kick", "console_id": monitor.ID})
	f.mustAddChannel(map[string]any{"channel_number": 5, "channel_name": "Snare", "console_id": first.ID})
	if status, raw := doJSON(t, http.MethodDelete, fmt.Sprintf("%s/%d", f.consoles, monitor.ID), nil); status != http.StatusOK {
		t.Fatalf("delete desk: %d %s", status, raw)
	}
	kick.ChannelName = "Kick in"
	kick.ConsoleID = nil
	if status, raw := doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", f.channels, kick.ID), kick); status != http.StatusOK {
		// One desk left: a save without a desk repairs onto it.
		t.Errorf("saving a deskless row on a one-desk event: %d %s", status, raw)
	}

	// No desk at all: adding is refused.
	if status, raw := doJSON(t, http.MethodDelete, fmt.Sprintf("%s/%d", f.consoles, first.ID), nil); status != http.StatusOK {
		t.Fatalf("delete desk: %d %s", status, raw)
	}
	if status, raw := f.addChannel(map[string]any{"channel_number": 1}); status != http.StatusConflict || !strings.Contains(string(raw), "Add the desk in Rig first.") {
		t.Errorf("no desk: %d %s", status, raw)
	}
}

func TestPlaceDesklessRows(t *testing.T) {
	f, first := newDeskFixture(t)
	f.switchTo(first, "lv1_64", true)
	status, raw := doJSON(t, http.MethodPost, f.consoles, map[string]any{"name": "Mon", "desk_model": "generic"})
	if status != http.StatusCreated {
		t.Fatalf("POST console: %d %s", status, raw)
	}
	second := decodeJSON[domain.Console](t, raw)
	f.mustAddChannel(map[string]any{"channel_number": 5, "channel_name": "Snare", "console_id": first.ID})
	kick := f.mustAddChannel(map[string]any{"channel_number": 5, "channel_name": "Kick", "console_id": second.ID})
	if status, raw := doJSON(t, http.MethodDelete, fmt.Sprintf("%s/%d", f.consoles, second.ID), nil); status != http.StatusOK {
		t.Fatalf("delete desk: %d %s", status, raw)
	}

	placeURL := fmt.Sprintf("%s/%d/place", f.consoles, first.ID)
	status, raw = doJSON(t, http.MethodPost, placeURL, map[string]any{})
	if status != http.StatusOK {
		t.Fatalf("place preview: %d %s", status, raw)
	}
	preview := decodeJSON[struct {
		Mapping service.Mapping `json:"mapping"`
	}](t, raw).Mapping
	if len(preview.Rows) != 1 || preview.Rows[0].ToNumber != 6 || len(preview.Lines) == 0 || preview.Lines[0].Word != service.WordMoved {
		t.Fatalf("place preview = %+v", preview)
	}
	if status, raw = doJSON(t, http.MethodPost, placeURL, map[string]any{"apply": true}); status != http.StatusOK {
		t.Fatalf("place: %d %s", status, raw)
	}
	for _, channel := range f.channelList() {
		if channel.ID == kick.ID && (channel.ConsoleID == nil || *channel.ConsoleID != first.ID || channel.ChannelNumber != 6) {
			t.Errorf("Kick after placing = %+v", channel)
		}
	}
}
