package service

import (
	"database/sql"
	"strings"
	"testing"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

// seedAudioEvent builds a small but complete patch: two mic sources into a
// stagebox, the stagebox into a desk's channels, plus a stage multi and a desk
// with local jacks. Small enough to assert exactly, complete enough that every
// node kind the document draws appears at least once.
func seedAudioEvent(t *testing.T) (*sql.DB, int64, int64) {
	t.Helper()
	database := openTestDB(t)

	owner, err := db.UpsertUserByGoogleSub(database, "audio-owner-sub", "audio@example.com", "Audio Owner", "")
	if err != nil {
		t.Fatalf("seed owner: %v", err)
	}
	inventory, err := db.CreateInventory(database, owner.ID, "Trionell Ljud & Ljus AB")
	if err != nil {
		t.Fatalf("create inventory: %v", err)
	}
	event, err := db.CreateEvent(database, domain.Event{
		Name: "Vårfest 2026", StartDate: "2026-08-14", EndDate: "2026-08-16", Venue: "Stora Scenen",
	}, owner.ID, inventory.ID)
	if err != nil {
		t.Fatalf("create event: %v", err)
	}

	micItem := seedItem(t, database, inventory.ID, "Shure Beta 58A")
	standItem := seedItem(t, database, inventory.ID, "K&M 210/9")

	desk, err := db.CreateConsole(database, domain.Console{
		EventID: event.ID, Name: "SD12", Role: "foh",
		InputCount: 96, OutputCount: 48, LocalInputCount: 8, LocalOutputCount: 8,
		InputPositionX: 1500, InputPositionY: 40,
		LocalInputPositionX: 900, LocalInputPositionY: 560,
	})
	if err != nil {
		t.Fatalf("create console: %v", err)
	}

	box, err := db.CreateStagebox(database, domain.Stagebox{
		EventID: event.ID, Name: "Rio3224-D #1", InputCount: 32, OutputCount: 24,
		ConnectionType: "Dante",
		InputPositionX: 500, InputPositionY: 40,
		PositionX: 900, PositionY: 40,
	})
	if err != nil {
		t.Fatalf("create stagebox: %v", err)
	}

	multi, err := db.CreateStageMulti(database, domain.StageMulti{
		EventID: event.ID, Name: "Stage multi A", LengthM: 30, Channels: 16,
		ConnectorType:  "XLR-3",
		InputPositionX: 950, InputPositionY: 60,
		PositionX: 500, PositionY: 60,
	})
	if err != nil {
		t.Fatalf("create stage multi: %v", err)
	}

	lead, err := db.CreateInputSource(database, domain.InputSource{
		EventID: event.ID, Name: "Lead vocal", Kind: "mic",
		MicItemID: &micItem, StandItemID: &standItem, PhantomPower: true,
		ConnectorType: "XLR-3", Width: "mono",
	})
	if err != nil {
		t.Fatalf("create source: %v", err)
	}
	keys, err := db.CreateInputSource(database, domain.InputSource{
		EventID: event.ID, Name: "Keys", Kind: "line",
		ConnectorType: "XLR-3", Width: "stereo",
	})
	if err != nil {
		t.Fatalf("create stereo source: %v", err)
	}

	ch1, err := db.CreateInputChannel(database, domain.InputChannel{
		EventID: event.ID, ChannelNumber: 1, ChannelName: "Lead Vox",
		Color: "#22d3ee", Width: "mono", ConsoleID: &desk.ID, Notes: "Spare 58A on the stand base.",
	})
	if err != nil {
		t.Fatalf("create channel: %v", err)
	}
	ch2, err := db.CreateInputChannel(database, domain.InputChannel{
		EventID: event.ID, ChannelNumber: 2, ChannelName: "Keys",
		Color: "#f59e0b", Width: "stereo", ConsoleID: &desk.ID,
	})
	if err != nil {
		t.Fatalf("create stereo channel: %v", err)
	}
	// A channel with nothing patched into it — the gap the document must state.
	if _, err := db.CreateInputChannel(database, domain.InputChannel{
		EventID: event.ID, ChannelNumber: 3, ChannelName: "Talkback",
		Width: "mono", ConsoleID: &desk.ID,
	}); err != nil {
		t.Fatalf("create empty channel: %v", err)
	}

	// Lead vocal -> stagebox in 0; stagebox out 0 -> channel 1.
	mustCable(t, database, domain.InputCable{
		EventID: event.ID, FromKind: "source", FromID: lead.ID, FromPort: 0,
		ToKind: "stagebox", ToID: box.ID, ToPort: 0,
	})
	mustCable(t, database, domain.InputCable{
		EventID: event.ID, FromKind: "stagebox", FromID: box.ID, FromPort: 0,
		ToKind: "channel", ToID: ch1.ID, ToPort: 0,
	})
	// Keys L/R -> stagebox in 1,2 -> channel 2 L/R.
	mustCable(t, database, domain.InputCable{
		EventID: event.ID, FromKind: "source", FromID: keys.ID, FromPort: 0,
		ToKind: "stagebox", ToID: box.ID, ToPort: 1,
	})
	mustCable(t, database, domain.InputCable{
		EventID: event.ID, FromKind: "source", FromID: keys.ID, FromPort: 1,
		ToKind: "stagebox", ToID: box.ID, ToPort: 2,
	})
	mustCable(t, database, domain.InputCable{
		EventID: event.ID, FromKind: "stagebox", FromID: box.ID, FromPort: 1,
		ToKind: "channel", ToID: ch2.ID, ToPort: 0,
	})
	mustCable(t, database, domain.InputCable{
		EventID: event.ID, FromKind: "stagebox", FromID: box.ID, FromPort: 2,
		ToKind: "channel", ToID: ch2.ID, ToPort: 1,
	})

	// One output run: main L off the desk, through the multi, into a speaker.
	out1, err := db.CreateAudioPatchOutput(database, domain.AudioPatchOutput{
		EventID: event.ID, OutputNumber: 1, OutputName: "Main L", OutputType: "main",
		Width: "mono", Color: "#38bdf8", ConsoleID: &desk.ID,
	})
	if err != nil {
		t.Fatalf("create output: %v", err)
	}
	speaker, err := db.CreateOutputDevice(database, domain.OutputDevice{
		EventID: event.ID, Name: "d&b V-Series SL",
		InputPortCount: 2, OutputPortCount: 0, PositionX: 1500, PositionY: 300,
	})
	if err != nil {
		t.Fatalf("create output device: %v", err)
	}
	mustOutCable(t, database, domain.OutputCable{
		EventID: event.ID, FromKind: "mixer", FromID: out1.ID, FromPort: 0,
		ToKind: "stage_multi", ToID: multi.ID, ToPort: 0,
	})
	mustOutCable(t, database, domain.OutputCable{
		EventID: event.ID, FromKind: "stage_multi", FromID: multi.ID, FromPort: 0,
		ToKind: "device", ToID: speaker.ID, ToPort: 0,
	})

	return database, event.ID, inventory.ID
}

func seedItem(t *testing.T, database *sql.DB, inventoryID int64, name string) int64 {
	t.Helper()
	var categoryID int64
	err := database.QueryRow(`SELECT id FROM inventory_categories WHERE inventory_id = ?`, inventoryID).Scan(&categoryID)
	if err == sql.ErrNoRows {
		result, err := database.Exec(
			`INSERT INTO inventory_categories (inventory_id, name, category_type) VALUES (?, 'Audio', 'audio')`, inventoryID)
		if err != nil {
			t.Fatalf("insert category: %v", err)
		}
		categoryID, _ = result.LastInsertId()
	} else if err != nil {
		t.Fatalf("find category: %v", err)
	}
	result, err := database.Exec(
		`INSERT INTO inventory_items (inventory_id, category_id, name, description, quantity_available, price_ex_vat) VALUES (?, ?, ?, '', 10, 100)`,
		inventoryID, categoryID, name)
	if err != nil {
		t.Fatalf("insert item %s: %v", name, err)
	}
	id, _ := result.LastInsertId()
	return id
}

func mustCable(t *testing.T, database *sql.DB, cable domain.InputCable) {
	t.Helper()
	if _, err := db.CreateInputCable(database, cable); err != nil {
		t.Fatalf("create input cable: %v", err)
	}
}

func mustOutCable(t *testing.T, database *sql.DB, cable domain.OutputCable) {
	t.Helper()
	if _, err := db.CreateOutputCable(database, cable); err != nil {
		t.Fatalf("create output cable: %v", err)
	}
}

func TestLoadAudioGraphData(t *testing.T) {
	database, eventID, inventoryID := seedAudioEvent(t)

	data, err := loadAudioGraphData(database, eventID, inventoryID)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(data.sources) != 2 {
		t.Errorf("sources = %d, want 2", len(data.sources))
	}
	if len(data.channels) != 3 {
		t.Errorf("channels = %d, want 3", len(data.channels))
	}
	if len(data.inCables) != 6 {
		t.Errorf("input cables = %d, want 6", len(data.inCables))
	}
	if len(data.outCables) != 2 {
		t.Errorf("output cables = %d, want 2", len(data.outCables))
	}
	// A source's mic reference resolves to the catalogue name, and a nil
	// reference to the empty string rather than to a stale one.
	if got := data.itemName(data.sources[0].MicItemID); got != "Shure Beta 58A" {
		t.Errorf("mic item = %q, want Shure Beta 58A", got)
	}
	if got := data.itemName(nil); got != "" {
		t.Errorf("nil item = %q, want empty", got)
	}
}

func TestBuildInputGraphMirrorsTheCanvas(t *testing.T) {
	database, eventID, inventoryID := seedAudioEvent(t)
	data, err := loadAudioGraphData(database, eventID, inventoryID)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	graph := buildInputGraph(data)

	rail, ok := graph.Node("source:0")
	if !ok {
		t.Fatal("no sources rail")
	}
	// A stereo source contributes two independent ports, a mono source one.
	if len(rail.Outputs) != 3 {
		t.Errorf("sources rail ports = %d, want 3 (1 mono + 2 stereo)", len(rail.Outputs))
	}
	if rail.X != sourcesRailX || rail.Y != sourcesRailY {
		t.Errorf("sources rail at (%v,%v), want the canvas constant (%v,%v)", rail.X, rail.Y, sourcesRailX, sourcesRailY)
	}

	// The desk's channel rail sits at its stored input-graph position, and
	// lists its channels in console-number order.
	// Every event is born with an unnamed placeholder desk, so the rail under
	// test is the one that was actually filled in.
	var deskNode FlowNode
	for _, node := range graph.Nodes {
		if node.Desk && node.Title == "SD12" {
			deskNode = node
		}
	}
	if deskNode.Key == "" {
		t.Fatal("no SD12 rail")
	}
	if deskNode.X != 1500 || deskNode.Y != 40 {
		t.Errorf("desk rail at (%v,%v), want its stored (1500,40)", deskNode.X, deskNode.Y)
	}
	// Ch1 mono + Ch2 stereo + Ch3 mono = 4 ports.
	if len(deskNode.Inputs) != 4 {
		t.Fatalf("desk rail ports = %d, want 4", len(deskNode.Inputs))
	}
	if deskNode.Inputs[0].Label != "Lead Vox" {
		t.Errorf("first strip = %q, want Lead Vox", deskNode.Inputs[0].Label)
	}
	if deskNode.Inputs[1].Label != "Keys L" || deskNode.Inputs[2].Label != "Keys R" {
		t.Errorf("stereo strip labels = %q/%q, want Keys L/Keys R", deskNode.Inputs[1].Label, deskNode.Inputs[2].Label)
	}
	// Talkback has nothing patched into it, and the drawing must say so.
	if deskNode.Inputs[3].Patched {
		t.Error("Talkback drawn as patched, but no cable reaches it")
	}
	if !deskNode.Inputs[0].Patched {
		t.Error("Lead Vox drawn as unpatched, but a cable reaches it")
	}

	// A stagebox is sized by one count on both sides — InputCount here, its mic
	// jacks — the canvas's own convention, mirrored so the two drawings agree.
	box, ok := graph.Node("stagebox:1")
	if !ok {
		t.Fatal("no stagebox node")
	}
	if len(box.Inputs) != 32 || len(box.Outputs) != 32 {
		t.Errorf("stagebox ports = %d in / %d out, want 32/32 (InputCount)", len(box.Inputs), len(box.Outputs))
	}
	// The output graph sizes the same box by its returns.
	if outBox, ok := buildOutputGraph(data).Node("stagebox:1"); !ok || len(outBox.Inputs) != 24 {
		t.Errorf("output graph stagebox = %+v, want 24 ports (OutputCount)", outBox.Inputs)
	}

	// The desk's local panel is its own pass-through node.
	localKey := "console_local:" + deskNode.Key[len("channel:"):]
	if _, ok := graph.Node(localKey); !ok {
		t.Errorf("no %s node, but the desk declares 8 local inputs", localKey)
	}

	// Every cable is an edge, exactly once.
	if len(graph.Edges) != len(data.inCables) {
		t.Errorf("edges = %d, want one per cable (%d)", len(graph.Edges), len(data.inCables))
	}
}

func TestInputGraphEdgesLandOnTheRailRow(t *testing.T) {
	database, eventID, inventoryID := seedAudioEvent(t)
	data, _ := loadAudioGraphData(database, eventID, inventoryID)
	graph := buildInputGraph(data)

	// Keys R is channel 2 port 1, which is the desk rail's row 2 — not row 1.
	// Getting this wrong draws the cable into the wrong strip.
	var deskKey string
	for _, node := range graph.Nodes {
		if node.Title == "SD12" {
			deskKey = node.Key
		}
	}
	var found bool
	for _, edge := range graph.Edges {
		if edge.To.NodeKey == deskKey && edge.To.Port == 2 {
			found = true
		}
	}
	if !found {
		t.Error("no edge into the desk rail's row 2; a stereo channel's R port did not offset")
	}
}

func TestDerivedPortColorAgreesOrGoesNeutral(t *testing.T) {
	database, eventID, inventoryID := seedAudioEvent(t)
	data, _ := loadAudioGraphData(database, eventID, inventoryID)
	colors := deriveInputPortColors(data)

	// The stagebox jack the lead vocal lands on reaches exactly one channel,
	// so it takes that channel's colour.
	if got := colors[portKey{"stagebox:1", SideIn, 0}]; got != "#22d3ee" {
		t.Errorf("stagebox in 0 colour = %q, want the channel's #22d3ee", got)
	}
	// The source port feeding it agrees.
	if got := colors[portKey{"source:1", SideOut, 0}]; got != "#22d3ee" {
		t.Errorf("source out colour = %q, want #22d3ee", got)
	}
	// A jack no cable touches is neutral.
	if got := colors[portKey{"stagebox:1", SideIn, 20}]; got != "" {
		t.Errorf("untouched jack colour = %q, want neutral", got)
	}
}

func TestBuildRigDerivesEveryFigure(t *testing.T) {
	database, eventID, inventoryID := seedAudioEvent(t)
	data, _ := loadAudioGraphData(database, eventID, inventoryID)
	rig := buildRig(data)

	byName := map[string]rigRow{}
	for _, row := range rig.Rows {
		byName[row.Name] = row
	}

	box, ok := byName["Rio3224-D #1"]
	if !ok {
		t.Fatal("no stagebox row")
	}
	// Three jacks in (lead + keys L/R), three out.
	if box.InUsed != 3 || box.InInstalled != 32 {
		t.Errorf("stagebox in = %d / %d, want 3 / 32", box.InUsed, box.InInstalled)
	}
	if box.SpareIn() != 29 {
		t.Errorf("stagebox spare in = %d, want 29", box.SpareIn())
	}
	if box.Connection != "Dante" {
		t.Errorf("stagebox connection = %q, want Dante", box.Connection)
	}

	desk, ok := byName["SD12"]
	if !ok {
		t.Fatal("no console row")
	}
	if desk.Kind != "Console - FOH" {
		t.Errorf("console kind = %q, want Console - FOH", desk.Kind)
	}
	if desk.InUsed != 3 || desk.InInstalled != 96 {
		t.Errorf("console in = %d / %d, want 3 / 96", desk.InUsed, desk.InInstalled)
	}
	// The local panel is stated separately, never folded into the desk's own
	// figures.
	if desk.Note == "" {
		t.Error("console row has no local panel line, but the desk declares 8 local jacks")
	}

	multi, ok := byName["Stage multi A"]
	if !ok {
		t.Fatal("no stage multi row")
	}
	if multi.InInstalled != 16 || multi.OutInstalled != 16 {
		t.Errorf("multi = %d / %d pairs, want 16 / 16", multi.InInstalled, multi.OutInstalled)
	}

	if rig.TotalInInstalled == 0 || rig.TotalOutInstalled == 0 {
		t.Error("rig totals are zero")
	}
}

func TestBuildOutputGraphWalksToTheDestination(t *testing.T) {
	database, eventID, inventoryID := seedAudioEvent(t)
	data, _ := loadAudioGraphData(database, eventID, inventoryID)
	graph := buildOutputGraph(data)

	if len(graph.Edges) != len(data.outCables) {
		t.Errorf("edges = %d, want one per cable (%d)", len(graph.Edges), len(data.outCables))
	}
	if _, ok := graph.Node("device:1"); !ok {
		t.Error("the output device that terminates the run is not drawn")
	}
	// The output strip's colour reaches the speaker's jack.
	colors := deriveOutputPortColors(data)
	if got := colors[portKey{"device:1", SideIn, 0}]; got != "#38bdf8" {
		t.Errorf("speaker jack colour = %q, want the strip's #38bdf8", got)
	}
}

func TestBuildOutputGraphRespectsStageMultiVisibility(t *testing.T) {
	database, eventID, inventoryID := seedAudioEvent(t)

	// Neither multi below sets ShowInOutputGraph — proving the *default* is
	// hidden (Go's bool zero value), not just that explicitly hiding works.
	hiddenUncabled, err := db.CreateStageMulti(database, domain.StageMulti{
		EventID: eventID, Name: "Hidden uncabled", Channels: 8, ConnectorType: "XLR-3",
	})
	if err != nil {
		t.Fatalf("create hidden uncabled multi: %v", err)
	}
	hiddenCabled, err := db.CreateStageMulti(database, domain.StageMulti{
		EventID: eventID, Name: "Hidden but cabled", Channels: 8, ConnectorType: "XLR-3",
	})
	if err != nil {
		t.Fatalf("create hidden cabled multi: %v", err)
	}
	speaker, err := db.CreateOutputDevice(database, domain.OutputDevice{
		EventID: eventID, Name: "Fill speaker", InputPortCount: 1,
	})
	if err != nil {
		t.Fatalf("create output device: %v", err)
	}
	mustOutCable(t, database, domain.OutputCable{
		EventID: eventID, FromKind: "stage_multi", FromID: hiddenCabled.ID, FromPort: 0,
		ToKind: "device", ToID: speaker.ID, ToPort: 0,
	})

	data, err := loadAudioGraphData(database, eventID, inventoryID)
	if err != nil {
		t.Fatalf("load: %v", err)
	}

	output := buildOutputGraph(data)
	if _, ok := output.Node("stage_multi:" + itoa(hiddenUncabled.ID)); ok {
		t.Error("hidden, uncabled stage multi drawn in the output graph")
	}
	if _, ok := output.Node("stage_multi:" + itoa(hiddenCabled.ID)); !ok {
		t.Error("hidden but cabled stage multi omitted from the output graph")
	}

	input := buildInputGraph(data)
	if _, ok := input.Node("stage_multi:" + itoa(hiddenUncabled.ID)); !ok {
		t.Error("the visibility flag hid a stage multi from the input graph too")
	}
}

func TestEmptyEventStillBuildsGraphs(t *testing.T) {
	database := openTestDB(t)
	owner, _ := db.UpsertUserByGoogleSub(database, "empty-sub", "empty@example.com", "Empty", "")
	inventory, _ := db.CreateInventory(database, owner.ID, "Empty inventory")
	event, err := db.CreateEvent(database, domain.Event{Name: "Nothing planned", StartDate: "2026-09-01"}, owner.ID, inventory.ID)
	if err != nil {
		t.Fatalf("create event: %v", err)
	}

	data, err := loadAudioGraphData(database, event.ID, inventory.ID)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if got := buildInputGraph(data); len(got.Edges) != 0 {
		t.Errorf("empty event has %d edges", len(got.Edges))
	}
	// The placeholder desk every event is born with is not a box on the rig.
	if got := buildRig(data); len(got.Rows) != 0 {
		t.Errorf("empty event has %d rig rows, want none", len(got.Rows))
	}
	if !buildInputGraph(data).IsEmpty() {
		t.Error("empty event's input graph does not report itself empty")
	}
}

// D9: the rear aux sockets print as their own node at the canvas's position,
// counted apart from the local jacks; a model without sockets prints none.
func TestBuildInputGraphPrintsAuxSockets(t *testing.T) {
	foh := domain.Console{ID: 1, Name: "FOH", DeskModel: "x32", LocalInputCount: 32, AuxSocketCount: 6, AuxInputPositionX: 260, AuxInputPositionY: 960}
	core := domain.Console{ID: 2, Name: "Core", DeskModel: "x32core", AuxSocketCount: 0}
	data := audioGraphData{
		sources:  []domain.InputSource{{ID: 1, Name: "Playback", Width: "stereo"}, {ID: 2, Name: "Host mic RX", Width: "mono"}},
		consoles: []domain.Console{foh, core},
		inCables: []domain.InputCable{
			{FromKind: "source", FromID: 1, FromPort: 0, ToKind: "console_aux", ToID: 1, ToPort: 0},
			{FromKind: "source", FromID: 1, FromPort: 1, ToKind: "console_aux", ToID: 1, ToPort: 1},
			{FromKind: "source", FromID: 2, FromPort: 0, ToKind: "console_aux", ToID: 1, ToPort: 2},
		},
	}
	graph := buildInputGraph(data)
	aux, ok := graph.Node("console_aux:1")
	if !ok {
		t.Fatal("no aux node for the X32")
	}
	if aux.Title != "FOH aux" || aux.Badge != "AUX" || aux.X != 260 || aux.Y != 960 {
		t.Errorf("aux node = %q %q at (%v,%v)", aux.Title, aux.Badge, aux.X, aux.Y)
	}
	if len(aux.Inputs) != 6 || aux.Inputs[2].Label != "Aux in 3" || aux.Outputs[2].Label != "Aux to desk 3" {
		t.Errorf("aux rows = %+v / %+v", aux.Inputs, aux.Outputs)
	}
	if aux.Footer != "6 aux sockets - 3 used" {
		t.Errorf("footer = %q", aux.Footer)
	}
	if local, ok := graph.Node("console_local:1"); !ok || local.Footer != "32 local jacks - 0 used" {
		t.Errorf("local node = %+v, want its footer to count local jacks only", local)
	}
	if _, ok := graph.Node("console_aux:2"); ok {
		t.Error("X32 Core printed an aux node")
	}
	if len(graph.Edges) != 3 {
		t.Errorf("edges = %d, want 3", len(graph.Edges))
	}
}

// Aux strips sit below the channels on a desk rail, and a cable still lands on
// its own strip's row (user, 2026-10-21).
func TestDeskRailPutsAuxStripsLast(t *testing.T) {
	desk := int64(1)
	data := audioGraphData{
		sources:  []domain.InputSource{{ID: 1, Name: "Playback", Width: "mono"}},
		consoles: []domain.Console{{ID: 1, Name: "FOH", DeskModel: "x32"}},
		channels: []domain.InputChannel{
			{ID: 10, ConsoleID: &desk, ChannelNumber: 1, ChannelName: "Playback", StripPool: domain.PoolAux, Width: "mono"},
			{ID: 11, ConsoleID: &desk, ChannelNumber: 2, ChannelName: "Snare", StripPool: domain.PoolChannel, Width: "mono"},
			{ID: 12, ConsoleID: &desk, ChannelNumber: 1, ChannelName: "Kick", StripPool: domain.PoolChannel, Width: "mono"},
		},
		inCables: []domain.InputCable{{FromKind: "source", FromID: 1, ToKind: "channel", ToID: 10, ToPort: 0}},
	}
	graph := buildInputGraph(data)
	rail, ok := graph.Node("channel:1")
	if !ok {
		t.Fatal("no FOH rail")
	}
	var labels []string
	for _, port := range rail.Inputs {
		labels = append(labels, port.Label)
	}
	if strings.Join(labels, ",") != "Kick,Snare,Playback" {
		t.Fatalf("rail rows = %v, want Kick,Snare,Playback", labels)
	}
	if len(graph.Edges) != 1 || rail.Inputs[graph.Edges[0].To.Port].Label != "Playback" {
		t.Errorf("the cable to the aux strip lands on row %d", graph.Edges[0].To.Port)
	}
}
