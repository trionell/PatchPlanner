package service

import (
	"database/sql"
	"fmt"
	"sort"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

// The audio document draws two signal-flow graphs, and everything downstream of
// this file — layout, routing, drawing — works on the neutral shapes below
// rather than on InputCable/OutputCable directly. That is what lets one renderer
// serve both graphs, and what lets the routing tests build a graph by hand
// without touching the database.
//
// The node set and the port derivation here mirror the canvas exactly, because
// the document's claim is that it draws the picture the planner arranged:
//   - a Sources rail standing for every source (frontend InputGraphCanvas.tsx:335)
//   - one channel rail per desk, plus one for deskless channels
//   - a desk's local jack panel as its own pass-through node
//   - stageboxes, stage multis and devices at the positions they hold
//
// Ports follow lib/inputGraph.ts and lib/outputGraph.ts: a stagebox is sized by
// OutputCount on *both* sides on either graph (domain.Stagebox's own note says
// why), a stage multi by Channels, a stereo source or channel contributes two
// independent ports.

// FlowSide is which column of a box a port sits in.
type FlowSide string

const (
	SideIn  FlowSide = "in"
	SideOut FlowSide = "out"
)

// FlowPort is one jack on one side of one box.
type FlowPort struct {
	Label string
	// Patched is whether any cable reaches this jack. Drawn as a filled or
	// hollow mark — never by colour alone.
	Patched bool
	// Color is the derived channel/output strip colour, empty when the port
	// derives none. Never carries meaning on its own.
	Color string
}

// FlowNode is one box on a drawn graph.
type FlowNode struct {
	// Key is "<kind>:<id>", the same identity the canvas uses for a node.
	Key   string
	Title string
	// Badge is the short kind marker in the header — SB, SM, DEV, DESK, SRC.
	Badge string
	// X and Y are the stored canvas coordinates. Positions are scaled to the
	// page; they are never read as millimetres.
	X, Y float64
	// Desk marks the box every other box is arranged around, drawn heavier.
	Desk bool

	Inputs  []FlowPort
	Outputs []FlowPort
	// Footer states the box's capacity, e.g. "32 in / 24 out - 8 used".
	Footer string
}

// FlowEndpoint identifies one end of a cable.
type FlowEndpoint struct {
	NodeKey string
	Side    FlowSide
	Port    int
}

// FlowEdge is one cable.
type FlowEdge struct {
	From FlowEndpoint
	To   FlowEndpoint
	// Color is the derived strip colour of the signal on this cable, empty
	// when none is derivable.
	Color string
}

// FlowGraph is one whole drawing's worth of boxes and cables.
type FlowGraph struct {
	Title string
	Nodes []FlowNode
	Edges []FlowEdge
}

// Node returns the node with this key, and whether it was found.
func (g FlowGraph) Node(key string) (FlowNode, bool) {
	for _, node := range g.Nodes {
		if node.Key == key {
			return node, true
		}
	}
	return FlowNode{}, false
}

// IsEmpty is whether this graph has anything worth drawing. An event is born
// with a desk node carrying no jacks, so "has nodes" is not the same question.
func (g FlowGraph) IsEmpty() bool {
	if len(g.Edges) > 0 {
		return false
	}
	for _, node := range g.Nodes {
		if len(node.Inputs) > 0 || len(node.Outputs) > 0 {
			return false
		}
	}
	return true
}

// PortCount is how many jacks this node has on one side.
func (n FlowNode) PortCount(side FlowSide) int {
	if side == SideIn {
		return len(n.Inputs)
	}
	return len(n.Outputs)
}

// Rows is the number of port rows the box is drawn with — the taller of its two
// sides, since the sides are drawn beside each other.
func (n FlowNode) Rows() int {
	if len(n.Inputs) > len(n.Outputs) {
		return len(n.Inputs)
	}
	return len(n.Outputs)
}

// The two nodes on the input graph with nowhere to store a position: the Sources
// rail, which stands for every source at once, and the rail for channels
// belonging to no desk. The canvas opens both at these constants
// (InputGraphCanvas.tsx:79-80) and only moves them for the session, so these are
// what a planner sees every time the tab is opened — and therefore what the
// document draws.
const (
	sourcesRailX  = 24.0
	sourcesRailY  = 24.0
	channelRailX  = 1400.0
	deskRailStepY = 220.0
)

// audioGraphData is everything both graph loaders read, fetched once.
type audioGraphData struct {
	sources     []domain.InputSource
	channels    []domain.InputChannel
	inDevices   []domain.InputDevice
	outputs     []domain.AudioPatchOutput
	outDevices  []domain.OutputDevice
	stageboxes  []domain.Stagebox
	stageMultis []domain.StageMulti
	consoles    []domain.Console
	inCables    []domain.InputCable
	outCables   []domain.OutputCable
	groups      []domain.MixerGroup
	dcas        []domain.MixerDCA
	itemLabel   map[int64]string
}

// loadAudioGraphData fetches every row the document needs, once. The document
// draws two graphs and three tables off the same data, so fetching per section
// would read the same tables five times.
func loadAudioGraphData(database *sql.DB, eventID int64, inventoryID int64) (audioGraphData, error) {
	var data audioGraphData
	var err error

	if data.sources, err = db.ListInputSources(database, eventID); err != nil {
		return data, fmt.Errorf("list input sources: %w", err)
	}
	if data.channels, err = db.ListInputChannels(database, eventID); err != nil {
		return data, fmt.Errorf("list input channels: %w", err)
	}
	if data.inDevices, err = db.ListInputDevices(database, eventID); err != nil {
		return data, fmt.Errorf("list input devices: %w", err)
	}
	if data.outputs, err = db.ListAudioPatchOutputs(database, eventID); err != nil {
		return data, fmt.Errorf("list outputs: %w", err)
	}
	if data.outDevices, err = db.ListOutputDevices(database, eventID); err != nil {
		return data, fmt.Errorf("list output devices: %w", err)
	}
	if data.stageboxes, err = db.ListStageboxes(database, eventID); err != nil {
		return data, fmt.Errorf("list stageboxes: %w", err)
	}
	if data.stageMultis, err = db.ListStageMultis(database, eventID); err != nil {
		return data, fmt.Errorf("list stage multis: %w", err)
	}
	if data.consoles, err = db.ListConsoles(database, eventID); err != nil {
		return data, fmt.Errorf("list consoles: %w", err)
	}
	if data.inCables, err = db.ListInputCables(database, eventID); err != nil {
		return data, fmt.Errorf("list input cables: %w", err)
	}
	if data.outCables, err = db.ListOutputCables(database, eventID); err != nil {
		return data, fmt.Errorf("list output cables: %w", err)
	}
	if data.groups, err = db.ListMixerGroups(database, eventID); err != nil {
		return data, fmt.Errorf("list groups: %w", err)
	}
	if data.dcas, err = db.ListMixerDCAs(database, eventID); err != nil {
		return data, fmt.Errorf("list dcas: %w", err)
	}

	data.itemLabel = map[int64]string{}
	items, err := db.ListInventoryItems(database, inventoryID, nil, "", "", true)
	if err != nil {
		return data, fmt.Errorf("list inventory items: %w", err)
	}
	for _, item := range items {
		data.itemLabel[item.ID] = item.Name
	}
	return data, nil
}

// itemName is the catalogue name for an optional item reference, or "" when
// there is none. A reference to an item that is no longer in the catalogue
// resolves to "" rather than to a stale string.
func (d audioGraphData) itemName(id *int64) string {
	if id == nil {
		return ""
	}
	return d.itemLabel[*id]
}

// portKey identifies one jack across a whole graph.
type portKey struct {
	node string
	side FlowSide
	port int
}

// buildInputGraph assembles the input signal-flow graph as it is arranged on the
// canvas. Node kinds, their order and their port derivation mirror
// InputGraphCanvas.tsx and lib/inputGraph.ts.
func buildInputGraph(data audioGraphData) FlowGraph {
	patched := map[portKey]bool{}
	for _, cable := range data.inCables {
		patched[portKey{fmt.Sprintf("%s:%d", cable.FromKind, cable.FromID), SideOut, cable.FromPort}] = true
		patched[portKey{fmt.Sprintf("%s:%d", cable.ToKind, cable.ToID), SideIn, cable.ToPort}] = true
	}
	colors := deriveInputPortColors(data)

	graph := FlowGraph{Title: "Signal flow - inputs"}

	// The Sources rail: one node standing for every source, output side only.
	sources := append([]domain.InputSource(nil), data.sources...)
	sort.SliceStable(sources, func(i, j int) bool { return sources[i].ID < sources[j].ID })
	rail := FlowNode{
		Key:   "source:0",
		Title: "Sources",
		Badge: "SRC",
		X:     sourcesRailX,
		Y:     sourcesRailY,
	}
	phantom := 0
	for _, source := range sources {
		if source.PhantomPower {
			phantom++
		}
		for _, port := range sourcePortLabels(source) {
			key := portKey{"source:" + itoa(source.ID), SideOut, port.index}
			rail.Outputs = append(rail.Outputs, FlowPort{
				Label:   port.label,
				Patched: patched[key],
				Color:   colors[key],
			})
		}
	}
	rail.Footer = fmt.Sprintf("%s - %d with 48 V", plural(len(sources), "source", "sources"), phantom)
	if len(sources) > 0 {
		graph.Nodes = append(graph.Nodes, rail)
	}

	// One channel rail per desk, in the order the canvas places them, then the
	// rail for channels belonging to no desk.
	consoles := append([]domain.Console(nil), data.consoles...)
	sort.SliceStable(consoles, func(i, j int) bool { return consoles[i].ID < consoles[j].ID })
	nextY := sourcesRailY
	for _, desk := range consoles {
		deskChannels := channelsOfDesk(data.channels, &desk.ID)
		y := desk.InputPositionY
		if y == 0 {
			y = nextY
		}
		node := FlowNode{
			Key:   "channel:" + itoa(desk.ID),
			Title: desk.Name,
			Badge: "DESK",
			X:     desk.InputPositionX,
			Y:     y,
			Desk:  true,
		}
		for _, channel := range deskChannels {
			for _, port := range channelPortLabels(channel) {
				key := portKey{"channel:" + itoa(channel.ID), SideIn, port.index}
				node.Inputs = append(node.Inputs, FlowPort{
					Label:   port.label,
					Patched: patched[key],
					Color:   channel.Color,
				})
			}
		}
		node.Footer = fmt.Sprintf("%d / %d patched", countPatched(node.Inputs), desk.InputCount)
		// A desk with no channels on it is not drawn. Every event is born with
		// an unnamed placeholder desk, and drawing its rail put an empty box
		// on every graph — the canvas keeps it because it is somewhere to
		// patch to, and paper has nothing to patch.
		if len(node.Inputs) > 0 {
			graph.Nodes = append(graph.Nodes, node)
		}
		if y+deskRailStepY > nextY+deskRailStepY {
			nextY = y + deskRailStepY
		} else {
			nextY += deskRailStepY
		}

		// The desk's own jack panel is a second node — a pass-through, the same
		// shape a stagebox has here. No jacks declared, no node.
		if desk.LocalInputCount > 0 {
			local := FlowNode{
				Key:   "console_local:" + itoa(desk.ID),
				Title: desk.Name + " local",
				Badge: "JACKS",
				X:     desk.LocalInputPositionX,
				Y:     desk.LocalInputPositionY,
			}
			for i := 0; i < desk.LocalInputCount; i++ {
				inKey := portKey{"console_local:" + itoa(desk.ID), SideIn, i}
				outKey := portKey{"console_local:" + itoa(desk.ID), SideOut, i}
				local.Inputs = append(local.Inputs, FlowPort{
					Label:   fmt.Sprintf("Local in %d", i+1),
					Patched: patched[inKey],
					Color:   colors[inKey],
				})
				local.Outputs = append(local.Outputs, FlowPort{
					Label:   fmt.Sprintf("To desk %d", i+1),
					Patched: patched[outKey],
					Color:   colors[outKey],
				})
			}
			local.Footer = fmt.Sprintf("%d local jacks - %d used", desk.LocalInputCount, countPatched(local.Inputs))
			graph.Nodes = append(graph.Nodes, local)
		}
	}

	orphans := channelsOfDesk(data.channels, nil)
	if len(orphans) > 0 || len(consoles) == 0 {
		node := FlowNode{
			Key:   "channel:0",
			Title: "Channels",
			Badge: "CH",
			X:     channelRailX,
			Y:     nextY,
		}
		for _, channel := range orphans {
			for _, port := range channelPortLabels(channel) {
				key := portKey{"channel:" + itoa(channel.ID), SideIn, port.index}
				node.Inputs = append(node.Inputs, FlowPort{
					Label:   port.label,
					Patched: patched[key],
					Color:   channel.Color,
				})
			}
		}
		node.Footer = plural(len(orphans), "channel", "channels") + " on no desk"
		if len(node.Inputs) > 0 {
			graph.Nodes = append(graph.Nodes, node)
		}
	}

	graph.Nodes = append(graph.Nodes, passThroughNodes(data, patched, colors, true)...)
	graph.Edges = inputEdges(data, colors)
	return graph
}

// buildOutputGraph assembles the output signal-flow graph. Its node set is the
// mixer's bus rail, the same pass-through boxes, and the output devices that
// terminate a run.
func buildOutputGraph(data audioGraphData) FlowGraph {
	patched := map[portKey]bool{}
	for _, cable := range data.outCables {
		patched[portKey{fmt.Sprintf("%s:%d", cable.FromKind, cable.FromID), SideOut, cable.FromPort}] = true
		patched[portKey{fmt.Sprintf("%s:%d", cable.ToKind, cable.ToID), SideIn, cable.ToPort}] = true
	}
	colors := deriveOutputPortColors(data)

	graph := FlowGraph{Title: "Signal flow - outputs"}

	outputs := append([]domain.AudioPatchOutput(nil), data.outputs...)
	sort.SliceStable(outputs, func(i, j int) bool { return outputs[i].OutputNumber < outputs[j].OutputNumber })

	// One rail per desk carrying the outputs that come off it, mirroring the
	// output canvas. Outputs on no desk keep a rail of their own.
	consoles := append([]domain.Console(nil), data.consoles...)
	sort.SliceStable(consoles, func(i, j int) bool { return consoles[i].ID < consoles[j].ID })
	nextY := sourcesRailY
	rails := append([]*domain.Console(nil), nil) // index 0 is the deskless rail
	for i := range consoles {
		rails = append(rails, &consoles[i])
	}
	for _, desk := range rails {
		var deskOutputs []domain.AudioPatchOutput
		for _, output := range outputs {
			if (desk == nil && output.ConsoleID == nil) || (desk != nil && output.ConsoleID != nil && *output.ConsoleID == desk.ID) {
				deskOutputs = append(deskOutputs, output)
			}
		}
		if len(deskOutputs) == 0 {
			continue
		}
		node := FlowNode{Badge: "DESK", Desk: desk != nil}
		if desk != nil {
			node.Key = "mixer:" + itoa(desk.ID)
			node.Title = desk.Name
			node.X = desk.PositionX
			node.Y = desk.PositionY
			if node.Y == 0 {
				node.Y = nextY
			}
			nextY = node.Y + deskRailStepY
		} else {
			node.Key = "mixer:0"
			node.Title = "Outputs"
			node.Badge = "OUT"
			node.X = sourcesRailX
			node.Y = nextY
			nextY += deskRailStepY
		}
		for _, output := range deskOutputs {
			for _, port := range outputPortLabels(output) {
				key := portKey{"mixer:" + itoa(output.ID), SideOut, port.index}
				node.Outputs = append(node.Outputs, FlowPort{
					Label:   port.label,
					Patched: patched[key],
					Color:   output.Color,
				})
			}
		}
		node.Footer = fmt.Sprintf("%d / %d patched", countPatched(node.Outputs), len(node.Outputs))
		if len(node.Outputs) > 0 {
			graph.Nodes = append(graph.Nodes, node)
		}
	}

	// The desk's local jack panel is a node on this graph too, mirrored: an
	// output arrives on the in side from the desk's own routing, and a real
	// cable leaves the out side. Leaving it out dropped every run that goes
	// straight out of the desk's own sockets — six of eight cables on the
	// first real event this was run against.
	for _, desk := range consoles {
		if desk.LocalOutputCount == 0 {
			continue
		}
		key := "console_local:" + itoa(desk.ID)
		local := FlowNode{
			Key:   key,
			Title: desk.Name + " local",
			Badge: "JACKS",
			X:     desk.LocalPositionX,
			Y:     desk.LocalPositionY,
		}
		for i := 0; i < desk.LocalOutputCount; i++ {
			local.Inputs = append(local.Inputs, portAt(key, SideIn, i, fmt.Sprintf("From desk %d", i+1), patched, colors))
			local.Outputs = append(local.Outputs, portAt(key, SideOut, i, fmt.Sprintf("Local out %d", i+1), patched, colors))
		}
		local.Footer = fmt.Sprintf("%d local jacks - %d used", desk.LocalOutputCount, countPatched(local.Outputs))
		graph.Nodes = append(graph.Nodes, local)
	}

	graph.Nodes = append(graph.Nodes, passThroughNodes(data, patched, colors, false)...)

	for _, device := range data.outDevices {
		node := FlowNode{
			Key:   "device:" + itoa(device.ID),
			Title: device.Name,
			Badge: "DEV",
			X:     device.PositionX,
			Y:     device.PositionY,
		}
		for i := 0; i < device.InputPortCount; i++ {
			key := portKey{"device:" + itoa(device.ID), SideIn, i}
			node.Inputs = append(node.Inputs, FlowPort{
				Label:   fmt.Sprintf("In %d", i+1),
				Patched: patched[key],
				Color:   colors[key],
			})
		}
		for i := 0; i < device.OutputPortCount; i++ {
			key := portKey{"device:" + itoa(device.ID), SideOut, i}
			node.Outputs = append(node.Outputs, FlowPort{
				Label:   fmt.Sprintf("Out %d", i+1),
				Patched: patched[key],
				Color:   colors[key],
			})
		}
		// Link-out ports daisy-chain one destination device to the next
		// (sub -> sub -> top). They are their own from_kind and are never
		// counted toward OutputPortCount, so they follow the ordinary
		// outputs on the same side of the box.
		for i := 0; i < device.LinkPortCount; i++ {
			key := portKey{"device_link:" + itoa(device.ID), SideOut, i}
			node.Outputs = append(node.Outputs, FlowPort{
				Label:   fmt.Sprintf("Link %d", i+1),
				Patched: patched[key],
				Color:   colors[key],
			})
		}
		node.Footer = fmt.Sprintf("%d in / %d out", device.InputPortCount, device.OutputPortCount)
		if device.LinkPortCount > 0 {
			node.Footer += fmt.Sprintf(" / %d link", device.LinkPortCount)
		}
		graph.Nodes = append(graph.Nodes, node)
	}

	graph.Edges = outputEdges(data, colors)
	return graph
}

// passThroughNodes builds the boxes signal passes through — stageboxes, stage
// multis, and (on the input graph only) input devices. `input` selects which
// graph's stored position pair to read, since a box holds an independent
// position on each.
func passThroughNodes(data audioGraphData, patched map[portKey]bool, colors map[portKey]string, input bool) []FlowNode {
	var nodes []FlowNode

	for _, box := range data.stageboxes {
		key := "stagebox:" + itoa(box.ID)
		node := FlowNode{Key: key, Title: box.Name, Badge: "SB"}
		if input {
			node.X, node.Y = box.InputPositionX, box.InputPositionY
		} else {
			node.X, node.Y = box.PositionX, box.PositionY
		}
		// OutputCount sizes both sides — domain.Stagebox's own note says why.
		for i := 0; i < box.OutputCount; i++ {
			node.Inputs = append(node.Inputs, portAt(key, SideIn, i, fmt.Sprintf("In %d", i+1), patched, colors))
			node.Outputs = append(node.Outputs, portAt(key, SideOut, i, fmt.Sprintf("Out %d", i+1), patched, colors))
		}
		node.Footer = fmt.Sprintf("%d in / %d out - %d used", box.InputCount, box.OutputCount, countPatched(node.Inputs))
		nodes = append(nodes, node)
	}

	for _, multi := range data.stageMultis {
		if !input && !multi.ShowInOutputGraph && !stageMultiHasOutputCable(data, multi.ID) {
			continue
		}
		key := "stage_multi:" + itoa(multi.ID)
		node := FlowNode{Key: key, Title: multi.Name, Badge: "SM"}
		if input {
			node.X, node.Y = multi.InputPositionX, multi.InputPositionY
		} else {
			node.X, node.Y = multi.PositionX, multi.PositionY
		}
		for i := 0; i < multi.Channels; i++ {
			node.Inputs = append(node.Inputs, portAt(key, SideIn, i, itoa(int64(i+1)), patched, colors))
			node.Outputs = append(node.Outputs, portAt(key, SideOut, i, itoa(int64(i+1)), patched, colors))
		}
		node.Footer = fmt.Sprintf("%s - %d used", plural(multi.Channels, "pair", "pairs"), countPatched(node.Inputs))
		nodes = append(nodes, node)
	}

	if input {
		for _, device := range data.inDevices {
			key := "device:" + itoa(device.ID)
			node := FlowNode{Key: key, Title: device.Name, Badge: "DEV", X: device.PositionX, Y: device.PositionY}
			for i := 0; i < device.InputPortCount; i++ {
				node.Inputs = append(node.Inputs, portAt(key, SideIn, i, fmt.Sprintf("In %d", i+1), patched, colors))
			}
			for i := 0; i < device.OutputPortCount; i++ {
				node.Outputs = append(node.Outputs, portAt(key, SideOut, i, fmt.Sprintf("Out %d", i+1), patched, colors))
			}
			node.Footer = fmt.Sprintf("%d in / %d out", device.InputPortCount, device.OutputPortCount)
			nodes = append(nodes, node)
		}
	}

	return nodes
}

// stageMultiHasOutputCable reports whether an output cable runs to or from this
// stage multi — the connector-adapter use that forces it to stay visible on
// the output graph regardless of its ShowInOutputGraph flag.
func stageMultiHasOutputCable(data audioGraphData, multiID int64) bool {
	for _, cable := range data.outCables {
		if (cable.FromKind == "stage_multi" && cable.FromID == multiID) || (cable.ToKind == "stage_multi" && cable.ToID == multiID) {
			return true
		}
	}
	return false
}

func portAt(node string, side FlowSide, index int, label string, patched map[portKey]bool, colors map[portKey]string) FlowPort {
	key := portKey{node, side, index}
	return FlowPort{Label: label, Patched: patched[key], Color: colors[key]}
}

// inputEdges maps every input cable onto the node keys the graph uses. A cable
// whose endpoint names a node that is not drawn — a channel on a desk with no
// rail, say — is dropped, because a line to nowhere is worse than a missing one.
func inputEdges(data audioGraphData, colors map[portKey]string) []FlowEdge {
	channelNode := map[int64]string{}
	for _, channel := range data.channels {
		if channel.ConsoleID != nil {
			channelNode[channel.ID] = "channel:" + itoa(*channel.ConsoleID)
		} else {
			channelNode[channel.ID] = "channel:0"
		}
	}
	// A channel rail lists its desk's channels in order, so a cable to
	// channel 7 port 1 lands on the rail's Nth row, not on row 1.
	offset := channelPortOffsets(data.channels)

	var edges []FlowEdge
	for _, cable := range data.inCables {
		from := FlowEndpoint{Side: SideOut, Port: cable.FromPort}
		switch cable.FromKind {
		case "source":
			from.NodeKey = "source:0"
			from.Port = sourcePortOffset(data.sources, cable.FromID) + cable.FromPort
		default:
			from.NodeKey = fmt.Sprintf("%s:%d", cable.FromKind, cable.FromID)
		}

		to := FlowEndpoint{Side: SideIn, Port: cable.ToPort}
		switch cable.ToKind {
		case "channel":
			to.NodeKey = channelNode[cable.ToID]
			to.Port = offset[cable.ToID] + cable.ToPort
		default:
			to.NodeKey = fmt.Sprintf("%s:%d", cable.ToKind, cable.ToID)
		}

		if from.NodeKey == "" || to.NodeKey == "" {
			continue
		}
		edges = append(edges, FlowEdge{From: from, To: to, Color: colors[portKey{from.NodeKey, SideOut, from.Port}]})
	}
	return edges
}

// outputEdges is the same mapping on the output graph, where the mixer end is a
// per-desk rail listing that desk's outputs.
func outputEdges(data audioGraphData, colors map[portKey]string) []FlowEdge {
	outputNode := map[int64]string{}
	for _, output := range data.outputs {
		if output.ConsoleID != nil {
			outputNode[output.ID] = "mixer:" + itoa(*output.ConsoleID)
		} else {
			outputNode[output.ID] = "mixer:0"
		}
	}
	offset := outputPortOffsets(data.outputs)

	// A device's link-out ports live on the same box as its ordinary outputs,
	// after them.
	linkOffset := map[int64]int{}
	for _, device := range data.outDevices {
		linkOffset[device.ID] = device.OutputPortCount
	}

	var edges []FlowEdge
	for _, cable := range data.outCables {
		from := FlowEndpoint{Side: SideOut, Port: cable.FromPort}
		switch cable.FromKind {
		case "mixer":
			from.NodeKey = outputNode[cable.FromID]
			from.Port = offset[cable.FromID] + cable.FromPort
		case "device_link":
			from.NodeKey = "device:" + itoa(cable.FromID)
			from.Port = linkOffset[cable.FromID] + cable.FromPort
		default:
			from.NodeKey = fmt.Sprintf("%s:%d", cable.FromKind, cable.FromID)
		}
		to := FlowEndpoint{
			NodeKey: fmt.Sprintf("%s:%d", cable.ToKind, cable.ToID),
			Side:    SideIn,
			Port:    cable.ToPort,
		}
		if from.NodeKey == "" || to.NodeKey == "" {
			continue
		}
		edges = append(edges, FlowEdge{From: from, To: to, Color: colors[portKey{from.NodeKey, SideOut, from.Port}]})
	}
	return edges
}

// portLabel pairs a port's index within its node with the text drawn beside it.
type portLabel struct {
	index int
	label string
}

// sourcePortLabels mirrors lib/inputGraph.ts sourcePorts: a stereo source is two
// independent ports, suffixed L and R.
func sourcePortLabels(source domain.InputSource) []portLabel {
	if source.Width == "stereo" {
		return []portLabel{{0, source.Name + " L"}, {1, source.Name + " R"}}
	}
	return []portLabel{{0, source.Name}}
}

// channelPortLabels mirrors lib/inputGraph.ts channelPorts.
func channelPortLabels(channel domain.InputChannel) []portLabel {
	name := channel.ChannelName
	if name == "" {
		name = fmt.Sprintf("Ch %d", channel.ChannelNumber)
	}
	if channel.Width == "stereo" {
		return []portLabel{{0, name + " L"}, {1, name + " R"}}
	}
	return []portLabel{{0, name}}
}

// outputPortLabels mirrors lib/outputGraph.ts mixerPorts.
func outputPortLabels(output domain.AudioPatchOutput) []portLabel {
	name := output.OutputName
	if name == "" {
		name = fmt.Sprintf("Out %d", output.OutputNumber)
	}
	if output.Width == "stereo" {
		return []portLabel{{0, name + " L"}, {1, name + " R"}}
	}
	return []portLabel{{0, name}}
}

// sourcePortOffset is where a source's ports start within the Sources rail.
func sourcePortOffset(sources []domain.InputSource, id int64) int {
	ordered := append([]domain.InputSource(nil), sources...)
	sort.SliceStable(ordered, func(i, j int) bool { return ordered[i].ID < ordered[j].ID })
	offset := 0
	for _, source := range ordered {
		if source.ID == id {
			return offset
		}
		offset += len(sourcePortLabels(source))
	}
	return 0
}

// channelPortOffsets is where each channel's ports start within its desk's rail.
func channelPortOffsets(channels []domain.InputChannel) map[int64]int {
	offsets := map[int64]int{}
	byDesk := map[int64][]domain.InputChannel{}
	for _, channel := range channels {
		var desk int64
		if channel.ConsoleID != nil {
			desk = *channel.ConsoleID
		}
		byDesk[desk] = append(byDesk[desk], channel)
	}
	for _, group := range byDesk {
		sort.SliceStable(group, func(i, j int) bool { return group[i].ChannelNumber < group[j].ChannelNumber })
		offset := 0
		for _, channel := range group {
			offsets[channel.ID] = offset
			offset += len(channelPortLabels(channel))
		}
	}
	return offsets
}

// outputPortOffsets is the output graph's equivalent.
func outputPortOffsets(outputs []domain.AudioPatchOutput) map[int64]int {
	offsets := map[int64]int{}
	byDesk := map[int64][]domain.AudioPatchOutput{}
	for _, output := range outputs {
		var desk int64
		if output.ConsoleID != nil {
			desk = *output.ConsoleID
		}
		byDesk[desk] = append(byDesk[desk], output)
	}
	for _, group := range byDesk {
		sort.SliceStable(group, func(i, j int) bool { return group[i].OutputNumber < group[j].OutputNumber })
		offset := 0
		for _, output := range group {
			offsets[output.ID] = offset
			offset += len(outputPortLabels(output))
		}
	}
	return offsets
}

// channelsOfDesk returns a desk's channels in console-number order. A nil desk
// selects the channels belonging to none.
func channelsOfDesk(channels []domain.InputChannel, desk *int64) []domain.InputChannel {
	var picked []domain.InputChannel
	for _, channel := range channels {
		switch {
		case desk == nil && channel.ConsoleID == nil:
			picked = append(picked, channel)
		case desk != nil && channel.ConsoleID != nil && *channel.ConsoleID == *desk:
			picked = append(picked, channel)
		}
	}
	sort.SliceStable(picked, func(i, j int) bool { return picked[i].ChannelNumber < picked[j].ChannelNumber })
	return picked
}

func countPatched(ports []FlowPort) int {
	count := 0
	for _, port := range ports {
		if port.Patched {
			count++
		}
	}
	return count
}

func itoa(v int64) string { return fmt.Sprintf("%d", v) }
