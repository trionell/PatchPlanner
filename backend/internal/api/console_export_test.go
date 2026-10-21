package api

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

func exportURL(f *deskFixture, consoleID int64, ports string, preview bool) string {
	path := "console-export"
	if preview {
		path += "/preview"
	}
	u := fmt.Sprintf("%s/events/%d/%s?console=%d", f.base, f.eventID, path, consoleID)
	if ports != "" {
		u += "&ports=" + url.QueryEscape(ports)
	}
	return u
}

func TestConsoleExportScene(t *testing.T) {
	f, desk := newDeskFixture(t)
	if status, raw := doJSON(t, http.MethodGet, exportURL(f, desk.ID, "", true), nil); status != http.StatusConflict || !strings.Contains(string(raw), "Pick its model in Rig") {
		t.Errorf("a Generic desk: %d %s", status, raw)
	}
	f.switchTo(desk, "m32r", true)
	f.mustAddChannel(map[string]any{"channel_number": 1, "channel_name": "Gitarr Johannes"})

	status, raw := doJSON(t, http.MethodGet, exportURL(f, desk.ID, "", true), nil)
	if status != http.StatusOK {
		t.Fatalf("preview: %d %s", status, raw)
	}
	preview := decodeJSON[struct {
		Filename string `json:"filename"`
		Figures  []struct{ Label, Value string }
		Lines    []struct{ Word, Text string }
	}](t, raw)
	if preview.Filename != "API Test Event-desk.scn" {
		t.Errorf("filename %q", preview.Filename)
	}
	if len(preview.Figures) == 0 || preview.Figures[0].Value != "1" {
		t.Errorf("figures %+v", preview.Figures)
	}
	var cut, noInput bool
	for _, line := range preview.Lines {
		cut = cut || line.Word == "Changed" && strings.Contains(line.Text, "cut to 12")
		noInput = noInput || line.Word == "No input"
	}
	if !cut || !noInput {
		t.Errorf("preview lines %+v", preview.Lines)
	}

	response, err := httpClient.Get(exportURL(f, desk.ID, "", false))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != http.StatusOK || !strings.HasPrefix(string(body), "#4.0#") || !strings.Contains(string(body), `/ch/01/config "Gitarr Johan"`) {
		t.Errorf("scene: %d %.80q", response.StatusCode, body)
	}
	if got := response.Header.Get("Content-Disposition"); !strings.Contains(got, ".scn") {
		t.Errorf("Content-Disposition %q", got)
	}
}

func TestConsoleExportSessionAndViewer(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	f := &deskFixture{t: t, base: server.URL, eventID: eventID,
		channels: fmt.Sprintf("%s/events/%d/input-channels", server.URL, eventID),
		consoles: fmt.Sprintf("%s/events/%d/consoles", server.URL, eventID)}
	desk := f.desks()[0]
	f.switchTo(desk, "lv1_64", true)
	f.mustAddChannel(map[string]any{"channel_number": 1, "channel_name": "Kick"})

	owner, _ := db.UpsertUserByGoogleSub(database, "test-google-sub", "test@example.com", "Test User", "")
	viewer, _ := db.UpsertUserByGoogleSub(database, "viewer-sub", "viewer@example.com", "Viewer", "")
	if err := db.UpsertEventMembership(database, eventID, viewer.ID, "viewer", owner.ID); err != nil {
		t.Fatal(err)
	}
	token, _ := db.CreateSession(database, viewer.ID, time.Hour)
	client := clientForSession(t, server.URL, token)
	response, err := client.Get(exportURL(f, desk.ID, "", false))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != http.StatusOK || !strings.HasPrefix(string(body), "SQLite format 3") {
		t.Errorf("a viewer's LV1 export: %d %.20q", response.StatusCode, body)
	}
	if got := response.Header.Get("Content-Disposition"); !strings.Contains(got, ".emo") {
		t.Errorf("Content-Disposition %q", got)
	}
	if status, _ := doJSON(t, http.MethodGet, exportURL(f, 9999, "", true), nil); status != http.StatusNotFound {
		t.Errorf("unknown desk: %d", status)
	}
}

// A stagebox mapped to AES50-A lands in the user-in table; unmapped, it is No port.
func TestConsoleExportResolvesStageboxPorts(t *testing.T) {
	f, desk := newDeskFixture(t)
	f.switchTo(desk, "m32", true)
	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/stageboxes", f.base, f.eventID), map[string]any{"name": "Scen A", "input_count": 16, "output_count": 16})
	if status != http.StatusCreated {
		t.Fatalf("stagebox: %d %s", status, raw)
	}
	box := decodeJSON[struct {
		ID int64 `json:"id"`
	}](t, raw)
	kick := f.mustAddChannel(map[string]any{"channel_number": 1, "channel_name": "Kick"})
	if status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/input-cables", f.base, f.eventID), map[string]any{"from_kind": "stagebox", "from_id": box.ID, "from_port": 4, "to_kind": "channel", "to_id": kick.ID, "to_port": 0}); status != http.StatusCreated {
		t.Fatalf("cable: %d %s", status, raw)
	}

	status, raw = doJSON(t, http.MethodGet, exportURL(f, desk.ID, "", true), nil)
	if status != http.StatusOK || !strings.Contains(string(raw), `"word":"No port"`) || !strings.Contains(string(raw), `"name":"Scen A"`) {
		t.Errorf("unmapped box: %d %s", status, raw)
	}
	ports := fmt.Sprintf(`{"stagebox:%d":{"socket":"a","start":8}}`, box.ID)
	response, err := httpClient.Get(exportURL(f, desk.ID, ports, false))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()
	body, _ := io.ReadAll(response.Body)
	for _, line := range strings.Split(string(body), "\n") {
		if strings.HasPrefix(line, "/config/userrout/in ") {
			// AES50-A 13 (start 8 + port 4, 0-based 12) is code 33 + 12 = 45.
			if got := strings.Fields(line)[1]; got != "45" {
				t.Errorf("user in 1 = %s, want 45", got)
			}
		}
	}
}

// D9: an aux socket needs no mapping. It reaches the scene as user in 161–166
// for an ordinary channel.
func TestConsoleExportAuxSocket(t *testing.T) {
	f, desk := newDeskFixture(t)
	f.switchTo(desk, "m32", true)
	host := f.mustAddChannel(map[string]any{"channel_number": 1, "channel_name": "Host mic RX"})
	if status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/input-cables", f.base, f.eventID), map[string]any{"from_kind": "console_aux", "from_id": desk.ID, "from_port": 2, "to_kind": "channel", "to_id": host.ID, "to_port": 0}); status != http.StatusCreated {
		t.Fatalf("cable: %d %s", status, raw)
	}
	response, err := httpClient.Get(exportURL(f, desk.ID, "", false))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()
	body, _ := io.ReadAll(response.Body)
	found := false
	for _, line := range strings.Split(string(body), "\n") {
		if strings.HasPrefix(line, "/config/userrout/in ") {
			found = true
			if got := strings.Fields(line)[1]; got != "163" {
				t.Errorf("user in 1 = %s, want 163 (Aux In 3)", got)
			}
		}
	}
	if !found {
		t.Errorf("no user-in line in %d bytes", len(body))
	}
}

// D9 review: an aux socket writes no 48 V, so the figure does not count it; and a
// socket kept past a switch to a model without them is left out, not written.
func TestConsoleExportAuxSocketPhantomAndPastSockets(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	mic := seedItem(t, database, "Shure SM58", 4, 150)
	f := &deskFixture{t: t, base: server.URL, eventID: eventID,
		channels: fmt.Sprintf("%s/events/%d/input-channels", server.URL, eventID),
		consoles: fmt.Sprintf("%s/events/%d/consoles", server.URL, eventID)}
	desk := f.desks()[0]
	f.switchTo(desk, "m32", true)
	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/input-sources", server.URL, eventID), map[string]any{
		"name": "Condenser", "kind": "mic", "mic_item_id": mic, "connector_type": "xlr", "width": "mono", "phantom_power": true,
	})
	if status != http.StatusCreated {
		t.Fatalf("source: %d %s", status, raw)
	}
	source := decodeJSON[domain.InputSource](t, raw)
	ch := f.mustAddChannel(map[string]any{"channel_number": 1, "channel_name": "Condenser"})
	cables := fmt.Sprintf("%s/events/%d/input-cables", server.URL, eventID)
	for _, body := range []map[string]any{
		{"from_kind": "source", "from_id": source.ID, "from_port": 0, "to_kind": "console_aux", "to_id": desk.ID, "to_port": 1},
		{"from_kind": "console_aux", "from_id": desk.ID, "from_port": 1, "to_kind": "channel", "to_id": ch.ID, "to_port": 0},
	} {
		if status, raw := doJSON(t, http.MethodPost, cables, body); status != http.StatusCreated {
			t.Fatalf("cable %v: %d %s", body, status, raw)
		}
	}

	status, raw = doJSON(t, http.MethodGet, exportURL(f, desk.ID, "", true), nil)
	if status != http.StatusOK || !strings.Contains(string(raw), `{"label":"48 V","value":"0"}`) {
		t.Errorf("48 V figure counts an aux socket: %d %s", status, raw)
	}

	f.switchTo(desk, "x32core", true)
	status, raw = doJSON(t, http.MethodGet, exportURL(f, desk.ID, "", true), nil)
	if status != http.StatusOK || !strings.Contains(string(raw), "aux sockets past X32 Core") || !strings.Contains(string(raw), "aux in 2") {
		t.Errorf("past-socket line missing: %d %s", status, raw)
	}
	response, err := httpClient.Get(exportURL(f, desk.ID, "", false))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()
	body, _ := io.ReadAll(response.Body)
	for _, line := range strings.Split(string(body), "\n") {
		if strings.HasPrefix(line, "/config/userrout/in ") && strings.Fields(line)[1] != "0" {
			t.Errorf("a socket X32 Core lacks was written: %s", line)
		}
	}
}

// Someone with no access to the event gets nothing, not even the preview.
func TestConsoleExportStranger(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	stranger, err := db.UpsertUserByGoogleSub(database, "stranger-sub", "stranger@example.com", "Stranger", "")
	if err != nil {
		t.Fatal(err)
	}
	token, _ := db.CreateSession(database, stranger.ID, time.Hour)
	client := clientForSession(t, server.URL, token)
	consoles, _ := db.ListConsoles(database, eventID)
	for _, path := range []string{"console-export", "console-export/preview"} {
		response, err := client.Get(fmt.Sprintf("%s/events/%d/%s?console=%d", server.URL, eventID, path, consoles[0].ID))
		if err != nil {
			t.Fatal(err)
		}
		_ = response.Body.Close()
		if response.StatusCode != http.StatusForbidden && response.StatusCode != http.StatusNotFound {
			t.Errorf("a stranger's %s: %d, want 403", path, response.StatusCode)
		}
	}
}
