package service

import (
	"fmt"
	"sort"

	"github.com/trionell/patchplanner/internal/domain"
)

// The stage rig section: what boxes the patch runs on, how much of each is in
// use, and what is left. Every figure is derived — installed counts come off the
// box's own row, patched counts off the cable graph, spare by subtraction.
//
// There is deliberately no location. A box's stored position is its placement in
// a signal-flow graph, not where it stands on stage, and a column filled from it
// would be a confident lie. A real field is a schema change and a different
// slice.

// rigRow is one box in the stage rig table.
type rigRow struct {
	Name       string
	Item       string
	Kind       string
	Connection string

	InUsed       int
	InInstalled  int
	OutUsed      int
	OutInstalled int

	// Note is the continuation line beneath the row — a console's local panel
	// is the only thing that currently uses it.
	Note string
}

// SpareIn and SpareOut are what is left, which is the figure anyone reading a
// rig list is actually after: whether one more input fits.
func (r rigRow) SpareIn() int  { return max0(r.InInstalled - r.InUsed) }
func (r rigRow) SpareOut() int { return max0(r.OutInstalled - r.OutUsed) }

// rigSummary is the whole rig plus its totals.
type rigSummary struct {
	Rows []rigRow

	TotalInUsed       int
	TotalInInstalled  int
	TotalOutUsed      int
	TotalOutInstalled int
}

// buildRig derives the rig section from the loaded graph data. Patched counts
// come from both cable graphs at once: a stagebox carries input signal on one
// graph and output signal on the other, and a jack in use on either is a jack in
// use.
func buildRig(data audioGraphData) rigSummary {
	// Distinct jacks touched by any cable, per box and side.
	used := map[portKey]bool{}
	for _, cable := range data.inCables {
		used[portKey{fmt.Sprintf("%s:%d", cable.FromKind, cable.FromID), SideOut, cable.FromPort}] = true
		used[portKey{fmt.Sprintf("%s:%d", cable.ToKind, cable.ToID), SideIn, cable.ToPort}] = true
	}
	for _, cable := range data.outCables {
		used[portKey{fmt.Sprintf("%s:%d", cable.FromKind, cable.FromID), SideOut, cable.FromPort}] = true
		used[portKey{fmt.Sprintf("%s:%d", cable.ToKind, cable.ToID), SideIn, cable.ToPort}] = true
	}
	count := func(node string, side FlowSide) int {
		total := 0
		for key := range used {
			if key.node == node && key.side == side {
				total++
			}
		}
		return total
	}

	summary := rigSummary{}

	// Desks first — the box every other box is arranged around.
	consoles := append([]domain.Console(nil), data.consoles...)
	sort.SliceStable(consoles, func(i, j int) bool { return consoles[i].Name < consoles[j].Name })
	for _, desk := range consoles {
		// Every event is born with an unnamed desk of no declared capacity
		// (db/events.go). It adds no rental line and raises no capacity
		// warning until someone fills it in, and it is not a box on the rig
		// either — listing it would put a nameless 0 / 0 row on every
		// document ever generated.
		if desk.Name == "" && desk.InputCount == 0 && desk.OutputCount == 0 &&
			desk.LocalInputCount == 0 && desk.LocalOutputCount == 0 {
			continue
		}
		key := "mixer:" + itoa(desk.ID)
		row := rigRow{
			Name:         desk.Name,
			Item:         data.itemName(desk.InventoryItemID),
			Kind:         "Console - " + deskRoleLabel(desk.Role),
			InUsed:       countChannelsOn(data.channels, desk.ID),
			InInstalled:  desk.InputCount,
			OutUsed:      count(key, SideOut),
			OutInstalled: desk.OutputCount,
		}
		// The local panel is stated separately rather than folded in: it is a
		// different set of sockets, in a different place, and adding them
		// together would misstate both.
		if desk.LocalInputCount > 0 || desk.LocalOutputCount > 0 {
			localKey := "console_local:" + itoa(desk.ID)
			row.Note = fmt.Sprintf("Local panel %d in / %d out - %d in, %d out used.",
				desk.LocalInputCount, desk.LocalOutputCount,
				count(localKey, SideIn), count(localKey, SideOut))
		}
		summary.Rows = append(summary.Rows, row)
	}

	stageboxes := append([]domain.Stagebox(nil), data.stageboxes...)
	sort.SliceStable(stageboxes, func(i, j int) bool { return stageboxes[i].Name < stageboxes[j].Name })
	for _, box := range stageboxes {
		key := "stagebox:" + itoa(box.ID)
		summary.Rows = append(summary.Rows, rigRow{
			Name:         box.Name,
			Item:         rigItemLabel(data.itemName(box.InventoryItemID), box.Model),
			Kind:         "Stagebox",
			Connection:   box.ConnectionType,
			InUsed:       count(key, SideIn),
			InInstalled:  box.InputCount,
			OutUsed:      count(key, SideOut),
			OutInstalled: box.OutputCount,
		})
	}

	multis := append([]domain.StageMulti(nil), data.stageMultis...)
	sort.SliceStable(multis, func(i, j int) bool { return multis[i].Name < multis[j].Name })
	for _, multi := range multis {
		key := "stage_multi:" + itoa(multi.ID)
		item := data.itemName(multi.InventoryItemID)
		if item == "" && multi.LengthM > 0 {
			item = fmt.Sprintf("%g m %d-pair loom", multi.LengthM, multi.Channels)
		}
		summary.Rows = append(summary.Rows, rigRow{
			Name:         multi.Name,
			Item:         item,
			Kind:         "Stage multi",
			Connection:   multi.ConnectorType,
			InUsed:       count(key, SideIn),
			InInstalled:  multi.Channels,
			OutUsed:      count(key, SideOut),
			OutInstalled: multi.Channels,
		})
	}

	// Devices from both graphs. They are separate tables and never share a row,
	// so a device on each graph is two boxes on stage.
	inDevices := append([]domain.InputDevice(nil), data.inDevices...)
	sort.SliceStable(inDevices, func(i, j int) bool { return inDevices[i].Name < inDevices[j].Name })
	for _, device := range inDevices {
		key := "device:" + itoa(device.ID)
		summary.Rows = append(summary.Rows, rigRow{
			Name:         device.Name,
			Item:         data.itemName(device.InventoryItemID),
			Kind:         "Input device",
			Connection:   connectorPair(device.InputConnectorType, device.OutputConnectorType),
			InUsed:       count(key, SideIn),
			InInstalled:  device.InputPortCount,
			OutUsed:      count(key, SideOut),
			OutInstalled: device.OutputPortCount,
		})
	}

	outDevices := append([]domain.OutputDevice(nil), data.outDevices...)
	sort.SliceStable(outDevices, func(i, j int) bool { return outDevices[i].Name < outDevices[j].Name })
	for _, device := range outDevices {
		key := "device:" + itoa(device.ID)
		summary.Rows = append(summary.Rows, rigRow{
			Name:         device.Name,
			Item:         data.itemName(device.InventoryItemID),
			Kind:         "Output device",
			Connection:   connectorPair(device.InputConnectorType, device.OutputConnectorType),
			InUsed:       count(key, SideIn),
			InInstalled:  device.InputPortCount,
			OutUsed:      count(key, SideOut),
			OutInstalled: device.OutputPortCount,
		})
	}

	for _, row := range summary.Rows {
		summary.TotalInUsed += row.InUsed
		summary.TotalInInstalled += row.InInstalled
		summary.TotalOutUsed += row.OutUsed
		summary.TotalOutInstalled += row.OutInstalled
	}
	return summary
}

// countChannelsOn is a desk's input figure: strips defined on it, which is what
// "in use" means for a console. Its networked inputs are not jacks a cable
// lands on in this model.
func countChannelsOn(channels []domain.InputChannel, deskID int64) int {
	total := 0
	for _, channel := range channels {
		if channel.ConsoleID != nil && *channel.ConsoleID == deskID {
			total++
		}
	}
	return total
}

func deskRoleLabel(role string) string {
	switch role {
	case "foh":
		return "FOH"
	case "monitor":
		return "Monitor"
	case "broadcast":
		return "Broadcast"
	}
	return role
}

// rigItemLabel prefers the catalogue name and falls back to the free-text model
// a stagebox may carry instead.
func rigItemLabel(item, model string) string {
	if item != "" {
		return item
	}
	return model
}

func connectorPair(in, out string) string {
	switch {
	case in == "" && out == "":
		return ""
	case in == out || out == "":
		return in
	case in == "":
		return out
	}
	return in + " / " + out
}

func max0(v int) int {
	if v < 0 {
		return 0
	}
	return v
}
