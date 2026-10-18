package consolefile

import (
	_ "embed"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

//go:embed templates/m32_default.scn
var x32Template string

// X32 · M32 limits: the same node table on every model.
const (
	x32Channels  = 32
	x32Aux       = 8
	x32Buses     = 16
	x32Matrices  = 6
	x32DCAs      = 8
	x32Mutes     = 6
	x32NameChars = 12
	x32UserOuts  = 48
)

// scene is the template as ordered lines, addressed by their OSC path.
type scene struct {
	lines []string
	at    map[string]int
}

func parseScene(text string) *scene {
	s := &scene{lines: strings.Split(strings.TrimRight(text, "\n"), "\n"), at: map[string]int{}}
	for i, line := range s.lines {
		if path, _, ok := strings.Cut(line, " "); ok && strings.HasPrefix(path, "/") {
			s.at[path] = i
		}
	}
	return s
}

// tokens splits a line into its fields, keeping a quoted name whole, and
// remembers where each field sits so a field is replaced without disturbing
// the template's spacing.
type token struct{ start, end int }

func tokenize(line string) []token {
	var out []token
	for i := 0; i < len(line); {
		if line[i] == ' ' {
			i++
			continue
		}
		start := i
		if line[i] == '"' {
			i++
			for i < len(line) && line[i] != '"' {
				i++
			}
			i++
		} else {
			for i < len(line) && line[i] != ' ' {
				i++
			}
		}
		out = append(out, token{start, min(i, len(line))})
	}
	return out
}

// set replaces field n (0 is the path) of the line at path.
func (s *scene) set(path string, values map[int]string) {
	i, ok := s.at[path]
	if !ok {
		return
	}
	line := s.lines[i]
	fields := tokenize(line)
	// Right to left, so earlier offsets stay valid.
	keys := make([]int, 0, len(values))
	for k := range values {
		keys = append(keys, k)
	}
	sort.Sort(sort.Reverse(sort.IntSlice(keys)))
	for _, n := range keys {
		if n >= len(fields) {
			continue
		}
		f := fields[n]
		line = line[:f.start] + values[n] + line[f.end:]
	}
	s.lines[i] = line
}

func (s *scene) field(path string, n int) string {
	i, ok := s.at[path]
	if !ok {
		return ""
	}
	fields := tokenize(s.lines[i])
	if n >= len(fields) {
		return ""
	}
	return s.lines[i][fields[n].start:fields[n].end]
}

func (s *scene) bytes() []byte {
	return []byte(strings.Join(s.lines, "\n") + "\n")
}

func quote(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, "'") + `"`
}

func onOff(on bool) string {
	if on {
		return "ON"
	}
	return "OFF"
}

// The desk's eight colours. A plan colour lands on the nearest hue; a grey on
// white; no colour leaves the template's own.
var x32Hues = []struct {
	name string
	hue  float64
}{{"RD", 0}, {"YE", 60}, {"GN", 120}, {"CY", 180}, {"BL", 240}, {"MG", 300}}

func x32Colour(hex string) (string, bool) {
	hex = strings.TrimPrefix(hex, "#")
	if len(hex) != 6 {
		return "", false
	}
	v, err := strconv.ParseUint(hex, 16, 32)
	if err != nil {
		return "", false
	}
	r, g, b := float64(v>>16&0xff)/255, float64(v>>8&0xff)/255, float64(v&0xff)/255
	hi, lo := math.Max(r, math.Max(g, b)), math.Min(r, math.Min(g, b))
	if hi-lo < 0.16 {
		return "WH", true
	}
	var hue float64
	switch hi {
	case r:
		hue = math.Mod((g-b)/(hi-lo), 6) * 60
	case g:
		hue = ((b-r)/(hi-lo) + 2) * 60
	default:
		hue = ((r-g)/(hi-lo) + 4) * 60
	}
	if hue < 0 {
		hue += 360
	}
	best, bestD := "WH", math.MaxFloat64
	for _, c := range x32Hues {
		d := math.Abs(hue - c.hue)
		d = math.Min(d, 360-d)
		if d < bestD {
			best, bestD = c.name, d
		}
	}
	return best, true
}

func cut(name string) (string, bool) {
	runes := []rune(name)
	if len(runes) <= x32NameChars {
		return name, false
	}
	return string(runes[:x32NameChars]), true
}

// inputCode is a desk input as /config/userrout/in and /out number it.
func inputCode(port *DeskPort) int {
	if port == nil {
		return 0
	}
	switch port.Socket {
	case "local":
		return 1 + port.Index
	case "a":
		return 33 + port.Index
	case "b":
		return 81 + port.Index
	case "card":
		return 129 + port.Index
	}
	return 0
}

// headampIndex is the /headamp/NNN a desk input's preamp is, or -1 (the card).
func headampIndex(port *DeskPort) int {
	if port == nil {
		return -1
	}
	switch port.Socket {
	case "local":
		return port.Index
	case "a":
		return 32 + port.Index
	case "b":
		return 80 + port.Index
	}
	return -1
}

type notices struct {
	leftOut, changed map[string][]string
	order            []string
}

func newNotices() *notices {
	return &notices{leftOut: map[string][]string{}, changed: map[string][]string{}}
}

func (n *notices) add(word, text, item string) {
	bucket := n.leftOut
	if word == Changed {
		bucket = n.changed
	}
	if _, seen := bucket[text]; !seen {
		n.order = append(n.order, word+"\x00"+text)
	}
	if item != "" {
		bucket[text] = append(bucket[text], item)
	} else if bucket[text] == nil {
		bucket[text] = []string{}
	}
}

func (n *notices) list() []Notice {
	out := make([]Notice, 0, len(n.order))
	for _, key := range n.order {
		word, text, _ := strings.Cut(key, "\x00")
		items := n.leftOut[text]
		if word == Changed {
			items = n.changed[text]
		}
		out = append(out, Notice{Word: word, Text: fmt.Sprintf(text, len(items)), Items: items})
	}
	return out
}

// outSignal is one of the 38 output signals a mix or direct out reaches a socket
// through (design D3): Outputs 1–16, P16 1–16, Aux 1–6.
type outSignal struct {
	group string // main | p16 | aux
	n     int    // 1-based
}

func (o outSignal) userOutCode() int {
	switch o.group {
	case "main":
		return 168 + o.n
	case "p16":
		return 184 + o.n
	default:
		return 200 + o.n
	}
}

func (o outSignal) path() string {
	return fmt.Sprintf("/outputs/%s/%02d", o.group, o.n)
}

// WriteX32 writes a scene for the show: the full template with only the lines
// PatchPlanner owns replaced, and the preview of what it could not write.
func WriteX32(show Show) ([]byte, []Notice) {
	sc := parseScene(x32Template)
	n := newNotices()

	// The header names the scene after the event.
	if fields := tokenize(sc.lines[0]); len(fields) > 1 && strings.HasPrefix(sc.lines[0], "#4.0#") {
		title, _ := cut(ASCII(show.EventName))
		sc.lines[0] = sc.lines[0][:fields[1].start] + quote(title) + sc.lines[0][fields[1].end:]
	}

	colourOf := map[string]string{}
	colour := func(hex, owner string) string {
		c, ok := x32Colour(hex)
		if !ok {
			return ""
		}
		if prev, seen := colourOf[c]; seen && prev != strings.ToLower(hex) {
			n.add(Changed, "%d plan colours share a desk colour; X32 has eight.", owner)
		}
		colourOf[c] = strings.ToLower(hex)
		return c
	}
	name := func(full, owner string) string {
		spelled := ASCII(full)
		if spelled != full {
			n.add(Changed, "%d names respelled in English letters.", fmt.Sprintf("%s → %s", full, spelled))
		}
		short, didCut := cut(spelled)
		if didCut {
			n.add(Changed, "%d names cut to 12 characters.", fmt.Sprintf("%s → %s", full, short))
		}
		return quote(short)
	}

	// Strips: channels 1–32 and aux 1–8, their links, input patch and preamps.
	stripByID := map[int64]Strip{}
	chlink := strings.Fields(strings.TrimPrefix(sc.lines[sc.at["/config/chlink"]], "/config/chlink "))
	auxlink := strings.Fields(strings.TrimPrefix(sc.lines[sc.at["/config/auxlink"]], "/config/auxlink "))
	for i := range chlink {
		chlink[i] = "OFF"
	}
	for i := range auxlink {
		auxlink[i] = "OFF"
	}
	userIn := make([]int, x32Channels)
	headamps := map[int]bool{}
	for _, strip := range show.Strips {
		capacity, prefix := x32Channels, "ch"
		if strip.Aux {
			capacity, prefix = x32Aux, "auxin"
		}
		width := 1
		if strip.Stereo {
			width = 2
		}
		if strip.Number < 1 || strip.Number+width-1 > capacity {
			n.add(LeftOut, "%d strips past the desk's last, not in the scene.", stripLabel(strip))
			continue
		}
		stripByID[strip.ID] = strip
		path := fmt.Sprintf("/%s/%02d/config", prefix, strip.Number)
		values := map[int]string{1: name(strip.Name, strip.Name)}
		if c := colour(strip.Color, strip.Name); c != "" {
			values[3] = c
		}
		sc.set(path, values)
		if strip.Stereo {
			second := fmt.Sprintf("/%s/%02d/config", prefix, strip.Number+1)
			sc.set(second, values)
			if strip.Aux {
				auxlink[(strip.Number-1)/2] = "ON"
			} else {
				chlink[(strip.Number-1)/2] = "ON"
			}
		}
		if strip.Input == nil {
			n.add(NoInput, "%d strips have no input patched.", strip.Name)
		}
		if strip.Aux {
			if strip.Input != nil {
				n.add(Changed, "%d aux inputs keep the rear aux sockets; their stagebox patch is not written.", strip.Name)
			}
			continue
		}
		for side, port := range []*DeskPort{strip.Input, strip.InputR} {
			if side == 1 && !strip.Stereo {
				break
			}
			userIn[strip.Number-1+side] = inputCode(port)
			if idx := headampIndex(port); idx >= 0 {
				headamps[idx] = headamps[idx] || strip.Phantom
			}
		}
	}
	sc.set("/config/chlink", fieldsMap(chlink))
	sc.set("/config/auxlink", fieldsMap(auxlink))
	// Always user in (user, 2026-10-18): any patch exports as drawn, in or out of
	// blocks of 8.
	sc.set("/config/routing/IN", map[int]string{1: "UIN1-8", 2: "UIN9-16", 3: "UIN17-24", 4: "UIN25-32"})
	for idx, phantom := range headamps {
		sc.set(fmt.Sprintf("/headamp/%03d", idx), map[int]string{2: onOff(phantom)})
	}

	// Mixes in their slots.
	mixByID := map[int64]Mix{}
	busPair := make([]string, x32Buses/2)
	mtxPair := make([]string, x32Matrices/2)
	for i := range busPair {
		busPair[i] = "OFF"
	}
	for i := range mtxPair {
		mtxPair[i] = "OFF"
	}
	for _, mix := range show.Mixes {
		var path string
		capacity := 0
		switch mix.Kind {
		case "main":
			switch mix.Slot {
			case 1:
				path = "/main/st/config"
			case 2:
				path = "/main/m/config"
			default:
				n.add(LeftOut, "%d mains an X32 has not got.", mix.Name)
				continue
			}
		case "subgroup", "monitor", "fx":
			capacity, path = x32Buses, fmt.Sprintf("/bus/%02d/config", mix.Slot)
		case "matrix":
			capacity, path = x32Matrices, fmt.Sprintf("/mtx/%02d/config", mix.Slot)
		case "dca":
			capacity, path = x32DCAs, fmt.Sprintf("/dca/%d/config", mix.Slot)
		case "mute":
			capacity = x32Mutes
		}
		width := 1
		if mix.Stereo && mix.Kind != "main" && mix.Kind != "dca" && mix.Kind != "mute" {
			width = 2
		}
		if capacity > 0 && mix.Slot+width-1 > capacity {
			n.add(LeftOut, "%d mixes past the desk's pools, not in the scene.", mix.Name)
			continue
		}
		mixByID[mix.ID] = mix
		if path == "" {
			continue
		}
		values := map[int]string{1: name(mix.Name, mix.Name)}
		if c := colour(mix.Color, mix.Name); c != "" {
			values[3] = c
		}
		sc.set(path, values)
		if width == 2 {
			switch mix.Kind {
			case "matrix":
				mtxPair[(mix.Slot-1)/2] = "ON"
				sc.set(fmt.Sprintf("/mtx/%02d/config", mix.Slot+1), values)
			default:
				busPair[(mix.Slot-1)/2] = "ON"
				sc.set(fmt.Sprintf("/bus/%02d/config", mix.Slot+1), values)
			}
		}
	}
	sc.set("/config/buslink", fieldsMap(busPair))
	sc.set("/config/mtxlink", fieldsMap(mtxPair))

	// Routes: assigns and sends switched on at 0 dB (user, 2026-10-18).
	stripMix := map[string]map[int]string{} // "/ch/NN/mix" → field edits
	grpBits := map[string][2][]bool{}       // "/ch/NN/grp" → dca, mute bits
	touch := func(path string, field int, value string) {
		if stripMix[path] == nil {
			stripMix[path] = map[int]string{}
		}
		stripMix[path][field] = value
	}
	bits := func(path string) [2][]bool {
		if b, ok := grpBits[path]; ok {
			return b
		}
		b := [2][]bool{make([]bool, x32DCAs), make([]bool, x32Mutes)}
		grpBits[path] = b
		return b
	}
	stripPath := func(strip Strip) string {
		if strip.Aux {
			return fmt.Sprintf("/auxin/%02d", strip.Number)
		}
		return fmt.Sprintf("/ch/%02d", strip.Number)
	}
	mixPath := func(mix Mix) string {
		switch mix.Kind {
		case "main":
			if mix.Slot == 1 {
				return "/main/st"
			}
			return "/main/m"
		case "matrix":
			return fmt.Sprintf("/mtx/%02d", mix.Slot)
		}
		return fmt.Sprintf("/bus/%02d", mix.Slot)
	}
	// A linked pair is two strips in the scene: both carry the same assigns and
	// sends (Slice 49 review — the desk does not copy them across on load).
	stripPaths := func(strip Strip) []string {
		paths := []string{stripPath(strip)}
		if strip.Stereo {
			second := strip
			second.Number++
			paths = append(paths, stripPath(second))
		}
		return paths
	}
	// LR is on by default in the template; a strip or bus is on LR only when routed there.
	for _, strip := range stripByID {
		for _, path := range stripPaths(strip) {
			touch(path+"/mix", 3, "OFF")
			touch(path+"/mix", 5, "OFF")
		}
	}
	for _, mix := range mixByID {
		if mix.Kind == "subgroup" || mix.Kind == "monitor" || mix.Kind == "fx" {
			touch(mixPath(mix)+"/mix", 3, "OFF")
			touch(mixPath(mix)+"/mix", 5, "OFF")
		}
	}
	for _, route := range show.Routes {
		to, ok := mixByID[route.ToMix]
		if !ok {
			continue
		}
		var srcs []string
		var srcName string
		srcIsStrip := false
		if strip, ok := stripByID[route.FromStrip]; ok && route.FromStrip != 0 {
			srcs, srcIsStrip, srcName = stripPaths(strip), true, strip.Name
		} else if from, ok := mixByID[route.FromMix]; ok && route.FromMix != 0 {
			srcs, srcName = []string{mixPath(from)}, from.Name
			if from.Kind == "dca" || from.Kind == "mute" {
				continue
			}
		} else {
			continue
		}
		src := srcs[0]
		refuse := func() {
			n.add(LeftOut, "%d routes an X32 cannot make; kept in PatchPlanner.", fmt.Sprintf("%s → %s", srcName, to.Name))
		}
		switch to.Kind {
		case "main":
			if src == "/main/st" || src == "/main/m" || strings.HasPrefix(src, "/mtx/") {
				refuse()
				continue
			}
			for _, src := range srcs {
				if to.Slot == 1 {
					touch(src+"/mix", 3, "ON")
				} else {
					touch(src+"/mix", 5, "ON")
					touch(src+"/mix", 6, "+0.0")
				}
			}
		case "subgroup", "monitor", "fx":
			if !srcIsStrip {
				refuse()
				continue
			}
			for _, src := range srcs {
				for s := 0; s < widthOf(to); s++ {
					touch(fmt.Sprintf("%s/mix/%02d", src, to.Slot+s), 2, "+0.0")
				}
			}
		case "matrix":
			if srcIsStrip {
				refuse()
				continue
			}
			for s := 0; s < widthOf(to); s++ {
				touch(fmt.Sprintf("%s/mix/%02d", src, to.Slot+s), 2, "+0.0")
			}
		case "dca":
			if !srcIsStrip {
				refuse()
				continue
			}
			for _, src := range srcs {
				bits(src + "/grp")[0][to.Slot-1] = true
			}
		case "mute":
			for _, src := range srcs {
				bits(src + "/grp")[1][to.Slot-1] = true
			}
		}
	}
	// Monitor buses are tapped before the fader; subgroups and FX after.
	for _, mix := range mixByID {
		if mix.Kind != "monitor" && mix.Kind != "subgroup" && mix.Kind != "fx" {
			continue
		}
		tap := "POST"
		if mix.Kind == "monitor" {
			tap = "EQ->"
		}
		odd := mix.Slot
		if odd%2 == 0 {
			odd--
		}
		for _, strip := range stripByID {
			for _, path := range stripPaths(strip) {
				touch(fmt.Sprintf("%s/mix/%02d", path, odd), 4, tap)
			}
		}
	}
	for path, values := range stripMix {
		sc.set(path, values)
	}
	for path, b := range grpBits {
		sc.set(path, map[int]string{1: bitString(b[0]), 2: bitString(b[1])})
	}

	// Outputs: each distinct feed takes one output signal; a local out N is
	// Output N; every other socket reaches its signal through user out.
	signalFor := map[string]outSignal{}
	used := map[outSignal]bool{}
	signalPath := func(feed string) (outSignal, bool) {
		if sig, ok := signalFor[feed]; ok {
			return sig, true
		}
		for _, group := range []struct {
			name  string
			count int
		}{{"main", 16}, {"p16", 16}, {"aux", 6}} {
			for i := 1; i <= group.count; i++ {
				sig := outSignal{group.name, i}
				if !used[sig] {
					used[sig] = true
					signalFor[feed] = sig
					return sig, true
				}
			}
		}
		return outSignal{}, false
	}
	userOut := make([]int, x32UserOuts)
	userOutBlocks := map[string]int{} // "a:0" (socket:block) → 0-based UOUT block
	nextBlock := 0
	type patch struct {
		port *DeskPort
		feed string
		code int
		name string
	}
	var patches []patch
	for _, output := range show.Outputs {
		if output.Port == nil {
			continue
		}
		for side, port := range []*DeskPort{output.Port, output.PortR} {
			if port == nil || side == 1 && !output.Stereo {
				continue
			}
			code, feed := outputSource(output, side, mixByID, stripByID)
			if code < 0 {
				n.add(LeftOut, "%d outputs fed by something not in the scene.", output.Name)
				continue
			}
			patches = append(patches, patch{port, feed, code, output.Name})
		}
	}
	// Local outs first: they are their own Output signals.
	for _, p := range patches {
		if p.port.Socket == "local" && p.port.Index < 16 {
			sig := outSignal{"main", p.port.Index + 1}
			used[sig] = true
			signalFor[p.feed+fmt.Sprintf("@local%d", p.port.Index)] = sig
			sc.set(sig.path(), map[int]string{1: strconv.Itoa(p.code)})
		}
	}
	for _, p := range patches {
		if p.port.Socket == "local" && p.port.Index < 16 {
			continue
		}
		if p.port.Socket == "local" {
			// Checked before a signal is taken, so a refused output rewrites nothing.
			n.add(LeftOut, "%d outputs on a local out past 16, which an X32 has not got.", p.name)
			continue
		}
		sig, ok := signalPath(p.feed)
		if !ok {
			n.add(LeftOut, "%d output feeds past the desk's 38 output signals.", p.name)
			continue
		}
		sc.set(sig.path(), map[int]string{1: strconv.Itoa(p.code)})
		if !routeThroughUserOut(sc, p.port, sig.userOutCode(), userOut, userOutBlocks, &nextBlock) {
			n.add(LeftOut, "%d outputs past the desk's 48 user-out slots.", p.name)
		}
	}

	// The recorder: record tracks leave on the card through user out; a
	// soundcheck track plays back through the PLAY routing when it lines up with
	// its channel, and a source track feeds its channel through user in.
	for _, track := range show.Tracks {
		if track.Number < 1 || track.Number > 32 {
			n.add(LeftOut, "%d recorder tracks past the card's 32.", fmt.Sprintf("track %d", track.Number))
			continue
		}
		if track.FromStrip != 0 || track.FromMix != 0 {
			code := 0
			if strip, ok := stripByID[track.FromStrip]; ok {
				code = inputCode(strip.Input)
			} else if mix, ok := mixByID[track.FromMix]; ok {
				src, feed := mixSourceCode(mix, track.FromSide)
				if sig, ok := signalPath(feed); ok {
					sc.set(sig.path(), map[int]string{1: strconv.Itoa(src)})
					code = sig.userOutCode()
				} else {
					n.add(LeftOut, "%d output feeds past the desk's 38 output signals.", fmt.Sprintf("track %d", track.Number))
				}
			}
			if code > 0 && !routeThroughUserOut(sc, &DeskPort{Socket: "card", Index: track.Number - 1}, code, userOut, userOutBlocks, &nextBlock) {
				n.add(LeftOut, "%d outputs past the desk's 48 user-out slots.", fmt.Sprintf("track %d", track.Number))
			}
		}
		if strip, ok := stripByID[track.PlayStrip]; ok && track.PlayStrip != 0 && !strip.Aux {
			if track.Soundcheck {
				if strip.Number != track.Number {
					n.add(Changed, "%d soundcheck tracks play back by block: track N into channel N.", fmt.Sprintf("track %d → %s", track.Number, strip.Name))
				}
			} else {
				userIn[strip.Number-1] = 128 + track.Number
			}
		}
	}
	sc.set("/config/userrout/in", intsMap(userIn))
	sc.set("/config/userrout/out", intsMap(userOut))

	return sc.bytes(), n.list()
}

// routeThroughUserOut points a socket's block of 8 at a user-out block (the
// first time that block is used) and sets the socket's slot to code.
func routeThroughUserOut(sc *scene, port *DeskPort, code int, userOut []int, blocks map[string]int, next *int) bool {
	var path string
	var first int
	switch port.Socket {
	case "a":
		path, first = "/config/routing/AES50A", 1
	case "b":
		path, first = "/config/routing/AES50B", 1
	case "card":
		path, first = "/config/routing/CARD", 1
	default:
		// A local out past 16 has no output signal of its own; it is left out by the caller.
		return false
	}
	block := port.Index / 8
	key := fmt.Sprintf("%s:%d", port.Socket, block)
	u, ok := blocks[key]
	if !ok {
		if *next >= x32UserOuts/8 {
			return false
		}
		u = *next
		*next++
		blocks[key] = u
		sc.set(path, map[int]string{first + block: fmt.Sprintf("UOUT%d-%d", u*8+1, u*8+8)})
	}
	userOut[u*8+port.Index%8] = code
	return true
}

// outputSource is what an output's side plays, as an /outputs src code, and a
// key that two outputs playing the same thing share.
func outputSource(output Output, side int, mixes map[int64]Mix, strips map[int64]Strip) (int, string) {
	if output.FedByStrip != 0 {
		strip, ok := strips[output.FedByStrip]
		if !ok {
			return -1, ""
		}
		number := strip.Number + side
		if strip.Aux {
			return 57 + number, fmt.Sprintf("aux%d", number)
		}
		return 25 + number, fmt.Sprintf("ch%d", number)
	}
	if output.FedByMix == 0 {
		return 0, "off"
	}
	mix, ok := mixes[output.FedByMix]
	if !ok {
		return -1, ""
	}
	mixSide := output.FedBySide
	if output.Stereo && mix.Stereo {
		mixSide = side
	}
	code, feed := mixSourceCode(mix, mixSide)
	return code, feed
}

func mixSourceCode(mix Mix, side int) (int, string) {
	switch mix.Kind {
	case "main":
		if mix.Slot == 1 {
			return 1 + side, fmt.Sprintf("lr%d", side)
		}
		return 3, "mc"
	case "matrix":
		n := mix.Slot + min(side, widthOf(mix)-1)
		return 19 + n, fmt.Sprintf("mtx%d", n)
	}
	n := mix.Slot + min(side, widthOf(mix)-1)
	return 3 + n, fmt.Sprintf("bus%d", n)
}

func widthOf(mix Mix) int {
	if mix.Stereo && mix.Kind != "main" {
		return 2
	}
	return 1
}

func stripLabel(strip Strip) string {
	if strip.Aux {
		return fmt.Sprintf("Aux %d %s", strip.Number, strip.Name)
	}
	return fmt.Sprintf("Ch %d %s", strip.Number, strip.Name)
}

func bitString(on []bool) string {
	var b strings.Builder
	b.WriteByte('%')
	// Group 1 is the rightmost bit.
	for i := len(on) - 1; i >= 0; i-- {
		if on[i] {
			b.WriteByte('1')
		} else {
			b.WriteByte('0')
		}
	}
	return b.String()
}

func fieldsMap(values []string) map[int]string {
	m := make(map[int]string, len(values))
	for i, v := range values {
		m[i+1] = v
	}
	return m
}

func intsMap(values []int) map[int]string {
	m := make(map[int]string, len(values))
	for i, v := range values {
		m[i+1] = strconv.Itoa(v)
	}
	return m
}
