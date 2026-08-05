package service

import (
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
)

// Derived port colour, server-side.
//
// The rule is lib/inputGraph.ts's derivedPortColor, unchanged: a channel port
// shows its own stored colour; every other port traces forward to whichever
// channels it reaches and takes their colour when they all agree, neutral when
// none is reachable or they disagree. An 'in' port on a pass-through box
// resolves through its paired 'out' port, so both dots of one physical pair
// always match.
//
// On paper the colour is a swatch beside the jack and never the only thing
// saying anything, so a port that resolves to neutral loses nothing.

// deriveInputPortColors resolves every port on the input graph.
func deriveInputPortColors(data audioGraphData) map[portKey]string {
	channelColor := map[int64]string{}
	for _, channel := range data.channels {
		channelColor[channel.ID] = channel.Color
	}

	// Cables leaving each output port, indexed for the forward walk.
	outgoing := map[portKey][]domain.InputCable{}
	for _, cable := range data.inCables {
		key := portKey{fmt.Sprintf("%s:%d", cable.FromKind, cable.FromID), SideOut, cable.FromPort}
		outgoing[key] = append(outgoing[key], cable)
	}

	colors := map[portKey]string{}
	var resolveOut func(node string, port int, guard map[portKey]bool) []string

	resolveOut = func(node string, port int, guard map[portKey]bool) []string {
		key := portKey{node, SideOut, port}
		if guard[key] {
			return nil
		}
		guard[key] = true

		var reached []string
		for _, cable := range outgoing[key] {
			if cable.ToKind == "channel" {
				reached = append(reached, channelColor[cable.ToID])
				continue
			}
			// A pass-through box carries port N in to port N out.
			next := fmt.Sprintf("%s:%d", cable.ToKind, cable.ToID)
			reached = append(reached, resolveOut(next, cable.ToPort, guard)...)
		}
		return reached
	}

	// Every port that appears as either end of a cable, plus every port on a
	// box, needs an answer. Walking the cable ends alone is enough: a port no
	// cable touches is neutral, which is the map's zero value.
	seen := map[portKey]bool{}
	for _, cable := range data.inCables {
		seen[portKey{fmt.Sprintf("%s:%d", cable.FromKind, cable.FromID), SideOut, cable.FromPort}] = true
		seen[portKey{fmt.Sprintf("%s:%d", cable.ToKind, cable.ToID), SideIn, cable.ToPort}] = true
	}
	for key := range seen {
		if key.node == "" {
			continue
		}
		out := key
		out.side = SideOut
		if color, ok := agreedColor(resolveOut(out.node, out.port, map[portKey]bool{})); ok {
			colors[key] = color
		}
	}
	return colors
}

// deriveOutputPortColors is the same rule on the output graph, walking backward
// instead: an output strip's colour propagates forward along the cables that
// leave it, so every jack a signal passes through carries the strip's colour.
func deriveOutputPortColors(data audioGraphData) map[portKey]string {
	outputColor := map[int64]string{}
	for _, output := range data.outputs {
		outputColor[output.ID] = output.Color
	}

	incoming := map[portKey][]domain.OutputCable{}
	for _, cable := range data.outCables {
		key := portKey{fmt.Sprintf("%s:%d", cable.ToKind, cable.ToID), SideIn, cable.ToPort}
		incoming[key] = append(incoming[key], cable)
	}

	colors := map[portKey]string{}
	var resolveIn func(node string, port int, guard map[portKey]bool) []string

	resolveIn = func(node string, port int, guard map[portKey]bool) []string {
		key := portKey{node, SideIn, port}
		if guard[key] {
			return nil
		}
		guard[key] = true

		var reached []string
		for _, cable := range incoming[key] {
			if cable.FromKind == "mixer" {
				reached = append(reached, outputColor[cable.FromID])
				continue
			}
			prev := fmt.Sprintf("%s:%d", cable.FromKind, cable.FromID)
			reached = append(reached, resolveIn(prev, cable.FromPort, guard)...)
		}
		return reached
	}

	seen := map[portKey]bool{}
	for _, cable := range data.outCables {
		seen[portKey{fmt.Sprintf("%s:%d", cable.FromKind, cable.FromID), SideOut, cable.FromPort}] = true
		seen[portKey{fmt.Sprintf("%s:%d", cable.ToKind, cable.ToID), SideIn, cable.ToPort}] = true
	}
	for key := range seen {
		if key.node == "" {
			continue
		}
		in := key
		in.side = SideIn
		if color, ok := agreedColor(resolveIn(in.node, in.port, map[portKey]bool{})); ok {
			colors[key] = color
		}
	}
	return colors
}

// agreedColor is the agree-or-neutral rule: one colour when every reachable
// strip names the same one, nothing when none is reachable or they disagree.
func agreedColor(reached []string) (string, bool) {
	distinct := map[string]bool{}
	for _, color := range reached {
		if color != "" {
			distinct[color] = true
		}
	}
	if len(distinct) != 1 {
		return "", false
	}
	for color := range distinct {
		return color, true
	}
	return "", false
}
