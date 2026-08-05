package service

import (
	"fmt"
	"sort"
	"strings"

	"github.com/go-pdf/fpdf"
	"github.com/trionell/patchplanner/internal/domain"
)

// The four table sections and the two drawn ones.
//
// The Chain column is gone from both patch sheets. It held an entire signal
// path as an arrow-joined string, squeezed every other column to do it, and
// still could not be read. The space it gives up is what the source and
// destination columns needed all along, and the path itself is now drawn in
// sections 4 and 5.

// writeInputPatch is section 1: every channel with the source feeding it.
func (d *audioDoc) writeInputPatch(data audioGraphData) {
	channels := append([]domain.InputChannel(nil), data.channels...)
	sort.SliceStable(channels, func(i, j int) bool {
		return channels[i].ChannelNumber < channels[j].ChannelNumber
	})

	d.writeSectionHead(1, "Input patch", plural(len(channels), "channel", "channels"))
	if len(channels) == 0 {
		d.writeEmptySection("No input channels on this event.")
		return
	}

	d.writeTableHeader(inputColumns,
		[]string{"Ch", "Name", "W", "Source", "Microphone / DI", "Stand", "48 V", "Conn", "Buses"},
		[]string{"R", "L", "C", "L", "L", "L", "C", "L", "L"})

	sources := inputSourcesByChannel(data)

	for _, channel := range channels {
		feed := sources[channel.ID]
		d.writeStripe(channel.Color)

		width := "M"
		if channel.Width == "stereo" {
			width = "S"
		}
		cells := []string{
			fmt.Sprintf("%d", channel.ChannelNumber),
			channel.ChannelName,
			width,
			feed.name,
			feed.mic,
			feed.stand,
			"",
			feed.connector,
			busLabel(data, channel),
		}
		aligns := []string{"R", "L", "C", "L", "L", "L", "C", "L", "L"}

		d.pdf.SetFont("Helvetica", "", 7.5)
		for i, value := range cells {
			border := "B"
			// The channel number carries the colour stripe, so its own cell is
			// indented past it.
			if i == 0 {
				d.pdf.CellFormat(1.8, audioRowHeight, "", border, 0, "L", false, 0, "")
				d.pdf.CellFormat(inputColumns[i]-1.8, audioRowHeight,
					d.tr(value), border, 0, aligns[i], false, 0, "")
				continue
			}
			if i == 6 {
				// 48 V is a drawn square, never a character: a bullet that
				// cp1252 cannot represent comes out as a full stop, and a full
				// stop in this column would read as "no".
				x, y := d.pdf.GetX(), d.pdf.GetY()
				d.pdf.CellFormat(inputColumns[i], audioRowHeight, "", border, 0, "C", false, 0, "")
				if feed.phantom {
					d.pdf.SetFillColor(17, 17, 17)
					d.pdf.Rect(x+inputColumns[i]/2-0.8, y+audioRowHeight/2-0.8, 1.6, 1.6, "F")
				}
				continue
			}
			d.pdf.CellFormat(inputColumns[i], audioRowHeight,
				d.tr(truncatePDF(d.pdf, value, inputColumns[i]-1.6)),
				border, boolToInt(i == len(cells)-1), aligns[i], false, 0, "")
		}

		note := channel.Notes
		if !feed.found {
			// A gap is stated in words. Nine empty cells is not a statement.
			note = strings.TrimSpace("Nothing patched into this channel. " + note)
		}
		d.writeNoteLine(1.8, note)
	}

	d.writeLegend([]string{
		"W - M mono, S stereo",
		"Buses - groups upright, DCAs italic",
		"A filled square marks phantom power",
		"The colour bar repeats the channel strip colour",
	})
}

// writeOutputPatch is section 2: every output and where it ends up.
func (d *audioDoc) writeOutputPatch(data audioGraphData) {
	outputs := append([]domain.AudioPatchOutput(nil), data.outputs...)
	sort.SliceStable(outputs, func(i, j int) bool {
		return outputs[i].OutputNumber < outputs[j].OutputNumber
	})

	d.writeSectionHead(2, "Output patch", plural(len(outputs), "output", "outputs"))
	if len(outputs) == 0 {
		d.writeEmptySection("No outputs on this event.")
		return
	}

	d.writeTableHeader(outputColumns,
		[]string{"Out", "Name", "Type", "W", "Destination", "Via", "Conn"},
		[]string{"R", "L", "L", "C", "L", "L", "L"})

	ends := outputDestinations(data)

	for _, output := range outputs {
		end := ends[output.ID]
		d.writeStripe(output.Color)

		width := "M"
		if output.Width == "stereo" {
			width = "S"
		}
		cells := []string{
			fmt.Sprintf("%d", output.OutputNumber),
			output.OutputName,
			output.OutputType,
			width,
			end.destination,
			end.via,
			end.connector,
		}
		aligns := []string{"R", "L", "L", "C", "L", "L", "L"}

		d.pdf.SetFont("Helvetica", "", 7.5)
		for i, value := range cells {
			if i == 0 {
				d.pdf.CellFormat(1.8, audioRowHeight, "", "B", 0, "L", false, 0, "")
				d.pdf.CellFormat(outputColumns[i]-1.8, audioRowHeight, d.tr(value), "B", 0, aligns[i], false, 0, "")
				continue
			}
			d.pdf.CellFormat(outputColumns[i], audioRowHeight,
				d.tr(truncatePDF(d.pdf, value, outputColumns[i]-1.6)),
				"B", boolToInt(i == len(cells)-1), aligns[i], false, 0, "")
		}

		note := output.Notes
		if !end.found {
			note = strings.TrimSpace("Patched at the desk but no cable leaves it. " + note)
		}
		d.writeNoteLine(1.8, note)
	}

	d.writeLegend([]string{
		"W - M mono, S stereo",
		"Destination is the far end of the chain; Via is the box it leaves the desk through",
		"The colour bar repeats the output strip colour",
	})
}

// writeRig is section 3: the boxes the patch runs on, and how much of each is
// spoken for. It sits between the tables and the drawings because both refer to
// it — the Via column names these boxes, and so does every drawn node.
func (d *audioDoc) writeRig(data audioGraphData) {
	rig := buildRig(data)

	d.writeSectionHead(3, "Stage rig", plural(len(rig.Rows), "box", "boxes"))
	if len(rig.Rows) == 0 {
		d.writeEmptySection("No stageboxes, multis, devices or desks on this event.")
		return
	}

	d.writeTableHeader(rigColumns,
		[]string{"Box", "Catalogue item", "Kind", "Connection", "In", "Out", "Spare"},
		[]string{"L", "L", "L", "L", "R", "R", "R"})

	for _, row := range rig.Rows {
		cells := []string{
			row.Name,
			row.Item,
			row.Kind,
			row.Connection,
			fmt.Sprintf("%d / %d", row.InUsed, row.InInstalled),
			fmt.Sprintf("%d / %d", row.OutUsed, row.OutInstalled),
			fmt.Sprintf("%d in, %d out", row.SpareIn(), row.SpareOut()),
		}
		aligns := []string{"L", "L", "L", "L", "R", "R", "R"}
		d.pdf.SetFont("Helvetica", "", 7.5)
		for i, value := range cells {
			if i == 0 {
				d.pdf.SetFont("Helvetica", "B", 7.5)
			}
			d.pdf.CellFormat(rigColumns[i], audioRowHeight,
				d.tr(truncatePDF(d.pdf, value, rigColumns[i]-1.6)),
				"B", boolToInt(i == len(cells)-1), aligns[i], false, 0, "")
			if i == 0 {
				d.pdf.SetFont("Helvetica", "", 7.5)
			}
		}
		d.writeNoteLine(1.8, row.Note)
	}

	// The answer to the question a rig list provokes: does one more input fit?
	d.pdf.Ln(0.8)
	d.pdf.SetLineWidth(0.35)
	y := d.pdf.GetY()
	d.pdf.Line(audioMarginLeft, y, 210-audioMarginRight, y)
	d.pdf.SetLineWidth(0.2)
	d.pdf.Ln(1)
	d.pdf.SetFont("Helvetica", "", 7)
	d.pdf.CellFormat(0, 4, d.tr(fmt.Sprintf(
		"%s - %d of %d input jacks and %d of %d output jacks in use.",
		plural(len(rig.Rows), "box", "boxes"),
		rig.TotalInUsed, rig.TotalInInstalled,
		rig.TotalOutUsed, rig.TotalOutInstalled)), "", 1, "L", false, 0, "")

	d.writeLegend([]string{
		"In and Out are patched jacks over installed jacks",
		"A console's figures exclude its local panel, which is stated beneath it",
		"No location column - the application stores canvas placement, not where a box stands",
	})
}

// writeFlowSection is a drawing: its own landscape page, or several when the
// graph will not fit one legibly.
func (d *audioDoc) writeFlowSection(number int, title string, graph FlowGraph) {
	d.section = title
	d.repeatHeader = nil

	if graph.IsEmpty() {
		d.pdf.AddPage()
		d.writeSectionHead(number, title, "")
		d.writeEmptySection("Nothing is patched on this graph.")
		return
	}

	// The drawing changes orientation, which is the one reason a section starts
	// a fresh page anywhere in this document.
	blockH := 210.0 - audioMarginTop - audioMarginBottom - 14
	layout := LayoutFlow(graph, audioLandscapeBlockW, blockH)
	routing := RouteFlow(graph, layout)

	for index, tile := range layout.Tiles {
		// The size is given portrait-first whatever the orientation: fpdf
		// swaps Wd and Ht itself for "L". Passing 297x210 here produced a
		// 210 mm wide page, and every box past that fell off the edge.
		d.pdf.AddPageFormat("L", fpdf.SizeType{Wd: 210, Ht: 297})
		// No SetY here. fpdf has already run the header function, which drew
		// the running head; starting again at the top margin printed the
		// section title straight through it.
		drawFlowTitle(d.pdf, d.tr, number, title, layout, index, len(layout.Tiles))
		originY := d.pdf.GetY() + 2

		// A tile is a window onto the plane, so the drawing is clipped to it.
		// Without this every page draws the whole graph at its own offset and
		// boxes belonging to other sheets bleed in at the edges.
		d.pdf.ClipRect(audioMarginLeft, originY, audioLandscapeBlockW, blockH, false)
		drawFlowTile(d.pdf, d.tr, graph, layout, routing, audioMarginLeft, originY, tile)
		d.pdf.ClipEnd()

		drawFlowKey(d.pdf, d.tr, graph, 297-audioMarginRight-46, 210-audioMarginBottom-11)
	}
}

// inputFeed is what the input patch prints about the source reaching a channel.
type inputFeed struct {
	found     bool
	name      string
	mic       string
	stand     string
	connector string
	phantom   bool
}

// inputSourcesByChannel walks the cable graph backward from each channel to the
// source feeding it. A channel fed through a stagebox, a multi or a DI reaches
// the same source; only the path differs, and the path is section 4's job.
func inputSourcesByChannel(data audioGraphData) map[int64]inputFeed {
	// Cables arriving at each port, for the backward walk.
	incoming := map[portKey][]domain.InputCable{}
	for _, cable := range data.inCables {
		key := portKey{fmt.Sprintf("%s:%d", cable.ToKind, cable.ToID), SideIn, cable.ToPort}
		incoming[key] = append(incoming[key], cable)
	}
	sourceByID := map[int64]domain.InputSource{}
	for _, source := range data.sources {
		sourceByID[source.ID] = source
	}

	var walk func(node string, port int, guard map[portKey]bool) (domain.InputSource, bool)
	walk = func(node string, port int, guard map[portKey]bool) (domain.InputSource, bool) {
		key := portKey{node, SideIn, port}
		if guard[key] {
			return domain.InputSource{}, false
		}
		guard[key] = true
		for _, cable := range incoming[key] {
			if cable.FromKind == "source" {
				if source, ok := sourceByID[cable.FromID]; ok {
					return source, true
				}
				continue
			}
			// A pass-through box carries port N in to port N out.
			prev := fmt.Sprintf("%s:%d", cable.FromKind, cable.FromID)
			if source, ok := walk(prev, cable.FromPort, guard); ok {
				return source, true
			}
		}
		return domain.InputSource{}, false
	}

	feeds := map[int64]inputFeed{}
	for _, channel := range data.channels {
		source, ok := walk("channel:"+itoa(channel.ID), 0, map[portKey]bool{})
		if !ok {
			feeds[channel.ID] = inputFeed{name: "- no source"}
			continue
		}
		feed := inputFeed{
			found:     true,
			name:      source.Name,
			connector: source.ConnectorType,
			phantom:   source.PhantomPower,
		}
		if source.Kind == "mic" {
			feed.mic = data.itemName(source.MicItemID)
			feed.stand = data.itemName(source.StandItemID)
		}
		// A line source has no microphone and no stand, and the row says so
		// rather than leaving two cells that could be read as unknown.
		if feed.mic == "" {
			feed.mic = "-"
		}
		if feed.stand == "" {
			feed.stand = "-"
		}
		feeds[channel.ID] = feed
	}
	return feeds
}

// outputEnd is what the output patch prints about where a signal goes.
type outputEnd struct {
	found       bool
	destination string
	via         string
	connector   string
}

// outputDestinations walks forward from each output to the far end of its
// chain, remembering the first box it passed through on the way.
func outputDestinations(data audioGraphData) map[int64]outputEnd {
	outgoing := map[portKey][]domain.OutputCable{}
	for _, cable := range data.outCables {
		key := portKey{fmt.Sprintf("%s:%d", cable.FromKind, cable.FromID), SideOut, cable.FromPort}
		outgoing[key] = append(outgoing[key], cable)
	}
	deviceByID := map[int64]domain.OutputDevice{}
	for _, device := range data.outDevices {
		deviceByID[device.ID] = device
	}
	boxName := map[string]string{}
	for _, box := range data.stageboxes {
		boxName["stagebox:"+itoa(box.ID)] = box.Name
	}
	for _, multi := range data.stageMultis {
		boxName["stage_multi:"+itoa(multi.ID)] = multi.Name
	}
	for _, desk := range data.consoles {
		boxName["console_local:"+itoa(desk.ID)] = desk.Name + " local"
	}

	var walk func(node string, port int, via string, guard map[portKey]bool) (outputEnd, bool)
	walk = func(node string, port int, via string, guard map[portKey]bool) (outputEnd, bool) {
		key := portKey{node, SideOut, port}
		if guard[key] {
			return outputEnd{}, false
		}
		guard[key] = true
		for _, cable := range outgoing[key] {
			target := fmt.Sprintf("%s:%d", cable.ToKind, cable.ToID)
			if cable.ToKind == "device" {
				device, ok := deviceByID[cable.ToID]
				if !ok {
					continue
				}
				end := outputEnd{
					found:       true,
					destination: device.Name,
					via:         via,
					connector:   device.InputConnectorType,
				}
				if end.via == "" {
					end.via = "direct from the desk"
				}
				return end, true
			}
			// A box on the way. The first one is what the Via column names —
			// it is the one a tech needs to find on stage.
			nextVia := via
			if nextVia == "" {
				nextVia = fmt.Sprintf("%s, out %d", boxName[target], cable.ToPort+1)
			}
			if end, ok := walk(target, cable.ToPort, nextVia, guard); ok {
				return end, true
			}
		}
		return outputEnd{}, false
	}

	ends := map[int64]outputEnd{}
	for _, output := range data.outputs {
		end, ok := walk("mixer:"+itoa(output.ID), 0, "", map[portKey]bool{})
		if !ok {
			ends[output.ID] = outputEnd{destination: "- reaches nothing", via: "-", connector: "-"}
			continue
		}
		ends[output.ID] = end
	}
	return ends
}

// busLabel is a channel's group and DCA membership in one cell. Groups print
// upright and DCAs in brackets, so the two are told apart without colour.
func busLabel(data audioGraphData, channel domain.InputChannel) string {
	var groups, dcas []string
	for _, id := range channel.GroupIDs {
		for _, group := range data.groups {
			if group.ID == id {
				groups = append(groups, group.Name)
			}
		}
	}
	for _, id := range channel.DCAIDs {
		for _, dca := range data.dcas {
			if dca.ID == id {
				dcas = append(dcas, dca.Name)
			}
		}
	}
	parts := strings.Join(groups, ", ")
	if len(dcas) > 0 {
		if parts != "" {
			parts += ", "
		}
		parts += "(" + strings.Join(dcas, ", ") + ")"
	}
	return parts
}
