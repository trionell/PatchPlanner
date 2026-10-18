package consolefile

import (
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	_ "modernc.org/sqlite"
)

//go:embed templates/lv1_clean_17.3.50.135.emo
var lv1Template []byte

//go:embed templates/lv1_sg4000.yaml
var lv1SG4000 string

//go:embed templates/lv1_sg1000.yaml
var lv1SG1000 string

//go:embed templates/lv1_classic.yaml
var lv1Classic string

// lv1Schema is the one session schema this writer has a mapping for (LV1 17.3).
// A new LV1 release is a new template and a new entry here (design: LV1).
const lv1SchemaMajor, lv1SchemaMinor = 5, 2

// LV1 cluster types (the `cluster_type` table).
const (
	lv1Input   = 0
	lv1Group   = 1
	lv1FXAux   = 2
	lv1Main    = 3
	lv1Center  = 4
	lv1Mono    = 5
	lv1Matrix  = 6
	lv1Inputs  = 10 // I/O side: a device's inputs
	lv1Outputs = 11 // I/O side: a device's outputs
	lv1DCA     = 12
	lv1Mute    = 13
	lv1Mon     = 25
)

// lv1DefaultColour is palette index 13, stored as no row (design: LV1).
const lv1DefaultColour = 13

var lv1Palette = []string{
	"5d99a0", "448aff", "66a038", "1a8d68", "91c2c9", "5e6f82", "f7bb42", "ee0175",
	"2a62fc", "39c9ff", "8ff7ff", "146981", "87a4d1", "0fa1ab", "01e777", "77f5b6",
	"8b52c0", "ee9a99", "f3fa1b", "fe4f4f", "e9e6ea", "a40000", "8dff00", "a0a0a0",
	"fb7a14", "ff00ff", "ce92db", "f16192", "857617", "946b7b", "a04282", "7d4dff",
}

type lv1Device struct {
	vendor, device         int
	in, out, maxIn, maxOut int
	chunk, phantomKey      string
	namePrefix             string
}

// The device models the writer knows, as read from saved sessions.
var lv1Devices = map[string]lv1Device{
	"SG4000":  {19, 0, 40, 28, 40, 28, lv1SG4000, "mic_phantom_map", "SG4000"},
	"SG1000":  {19, 1, 10, 10, 40, 28, lv1SG1000, "mic_phantom_map", "SG1000"},
	"Classic": {21, 4, 18, 18, 18, 18, lv1Classic, "line_in_phantom_map", "Classic"},
}

// ErrLV1Schema is a template the writer has no mapping for.
var ErrLV1Schema = errors.New("this LV1 session version has no mapping")

func lv1Colour(hex string) (int, bool) {
	hex = strings.TrimPrefix(strings.ToLower(hex), "#")
	v, err := strconv.ParseUint(hex, 16, 32)
	if err != nil || len(hex) != 6 {
		return 0, false
	}
	r, g, b := float64(v>>16&0xff), float64(v>>8&0xff), float64(v&0xff)
	best, bestD := lv1DefaultColour, math.MaxFloat64
	for i, swatch := range lv1Palette {
		p, _ := strconv.ParseUint(swatch, 16, 32)
		d := math.Pow(r-float64(p>>16&0xff), 2) + math.Pow(g-float64(p>>8&0xff), 2) + math.Pow(b-float64(p&0xff), 2)
		if d < bestD {
			best, bestD = i, d
		}
	}
	return best, true
}

// lv1Writer carries the open session and what it has learned about it.
type lv1Writer struct {
	tx      *sql.Tx
	objects map[[2]int]int64 // (cluster, index) → object id
	params  map[string]int64
	n       *notices
}

func (w *lv1Writer) obj(cluster, index int) (int64, bool) {
	id, ok := w.objects[[2]int{cluster, index}]
	return id, ok
}

func (w *lv1Writer) exec(query string, args ...any) error {
	_, err := w.tx.Exec(query, args...)
	return err
}

// auxParams are a send's two parameter ids: aux n is FX 1–8 at 0–7, Mon 1–24 at
// 8–31. LV1 names them in three families (…_n, …_2_n, …_3_n), so they are
// looked up by name, never by number — an id LV1 does not accept on a strip
// drops every parameter on it (design: Trap).
func (w *lv1Writer) auxParams(n int) (gain, on int64, ok bool) {
	suffix := strconv.Itoa(n)
	switch {
	case n >= 24:
		suffix = "3_" + strconv.Itoa(n-24)
	case n >= 16:
		suffix = "2_" + strconv.Itoa(n-16)
	}
	gain, okG := w.params["PARAM_AUX_SEND_GAIN_"+suffix]
	on, okO := w.params["PARAM_AUX_SEND_ONOFF_"+suffix]
	return gain, on, okG && okO
}

// WriteLV1 writes an LV1 17.3 session for the show and the preview of what it
// could not write. The template is copied to a temporary file, edited in one
// transaction, and vacuumed into a second; both are removed.
func WriteLV1(show Show) ([]byte, []Notice, error) {
	dir, err := os.MkdirTemp("", "pp-lv1-")
	if err != nil {
		return nil, nil, err
	}
	defer os.RemoveAll(dir)
	work := filepath.Join(dir, "work.emo")
	if err := os.WriteFile(work, lv1Template, 0o600); err != nil {
		return nil, nil, err
	}
	db, err := sql.Open("sqlite", "file:"+work)
	if err != nil {
		return nil, nil, err
	}
	defer db.Close()

	var major, minor int
	if err := db.QueryRow(`SELECT schema_version_major, schema_version_minor FROM info LIMIT 1`).Scan(&major, &minor); err != nil {
		return nil, nil, err
	}
	if major != lv1SchemaMajor || minor != lv1SchemaMinor {
		return nil, nil, fmt.Errorf("%w: %d.%d", ErrLV1Schema, major, minor)
	}

	tx, err := db.Begin()
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback()
	w := &lv1Writer{tx: tx, objects: map[[2]int]int64{}, params: map[string]int64{}, n: newNotices()}
	if err := w.load(); err != nil {
		return nil, nil, err
	}
	if err := w.write(show); err != nil {
		return nil, nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, nil, err
	}
	out := filepath.Join(dir, "out.emo")
	if _, err := db.Exec(`VACUUM INTO ?`, out); err != nil {
		return nil, nil, err
	}
	// LV1 saves its sessions in WAL mode; VACUUM INTO writes a rollback journal
	// header, so the copy is switched back before it is read (review 2026-10-18).
	final, err := sql.Open("sqlite", "file:"+out)
	if err != nil {
		return nil, nil, err
	}
	var mode string
	if err := final.QueryRow(`PRAGMA journal_mode=WAL`).Scan(&mode); err != nil {
		final.Close()
		return nil, nil, err
	}
	if err := final.Close(); err != nil {
		return nil, nil, err
	}
	bytes, err := os.ReadFile(out)
	if err != nil {
		return nil, nil, err
	}
	return bytes, w.n.list(), nil
}

func (w *lv1Writer) load() error {
	rows, err := w.tx.Query(`SELECT id, obj_type, obj_index FROM object`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id int64
		var cluster, index int
		if err := rows.Scan(&id, &cluster, &index); err != nil {
			rows.Close()
			return err
		}
		w.objects[[2]int{cluster, index}] = id
	}
	rows.Close()
	rows, err = w.tx.Query(`SELECT id, name FROM chainer_params`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return err
		}
		w.params[name] = id
	}
	return rows.Err()
}

// mixObject is a mix's strip object and its routing cluster.
func (w *lv1Writer) mixObject(mix Mix) (int64, int, int, bool) {
	var cluster int
	index := mix.Slot - 1
	switch mix.Kind {
	case "main":
		cluster, index = []int{0, lv1Main, lv1Center, lv1Mono}[min(max(mix.Slot, 1), 3)], 0
	case "subgroup":
		cluster = lv1Group
	case "monitor":
		cluster = lv1Mon
	case "fx":
		cluster = lv1FXAux
	case "matrix":
		cluster = lv1Matrix
	case "dca":
		cluster = lv1DCA
	case "mute":
		cluster = lv1Mute
	default:
		return 0, 0, 0, false
	}
	id, ok := w.obj(cluster, index)
	return id, cluster, index, ok
}

func (w *lv1Writer) nameAndColour(id int64, name, colour string) error {
	if err := w.exec(`UPDATE snapshot_chainer SET name = ? WHERE chainer_id = ? AND snapshot_id = -1`, name, id); err != nil {
		return err
	}
	index, ok := lv1Colour(colour)
	if !ok {
		return nil
	}
	param, known := w.params["PARAM_COLOR_VALUE"]
	if !known {
		// Never write an id LV1 does not know: it would drop every param on the strip.
		return nil
	}
	if index == lv1DefaultColour {
		return w.exec(`DELETE FROM snapshot_chainer_params WHERE chainer_id = ? AND snapshot_id = -1 AND param_id = ?`, id, param)
	}
	return w.exec(`INSERT OR REPLACE INTO snapshot_chainer_params (chainer_id, snapshot_id, param_id, param_value) VALUES (?, -1, ?, ?)`, id, param, float64(index))
}

func (w *lv1Writer) assign(src, dst int64, kind string) error {
	switch kind {
	case "bus": // main or group
		return w.exec(`INSERT OR IGNORE INTO snapshot_assignment (snapshot_id, src_id, src_section_type, src_section_index, src_channel_index, src_control_id, src_asgn_type, dst_id, dst_section_type, dst_section_index, dst_channel_index, dst_control_id, dst_asgn_type, status)
			VALUES (-1, ?, 7, -1, -1, 2, 1, ?, 0, -1, -1, -1, 0, 0)`, src, dst)
	case "link": // DCA or mute group
		return w.exec(`INSERT OR IGNORE INTO snapshot_assignment (snapshot_id, src_id, src_section_type, src_section_index, src_channel_index, src_control_id, src_asgn_type, dst_id, dst_section_type, dst_section_index, dst_channel_index, dst_control_id, dst_asgn_type, status)
			VALUES (-1, ?, -1, -1, -1, -1, -1, ?, 0, -1, -1, -1, 2, 0)`, src, dst)
	default: // matrix
		return w.exec(`INSERT OR IGNORE INTO snapshot_assignment (snapshot_id, src_id, src_section_type, src_section_index, src_channel_index, src_control_id, src_asgn_type, dst_id, dst_section_type, dst_section_index, dst_channel_index, dst_control_id, dst_asgn_type, status)
			VALUES (-1, ?, 7, -1, -1, 0, 1, ?, 0, 0, -1, -1, 0, 0)`, src, dst)
	}
}

func (w *lv1Writer) route(srcCluster, srcIndex, srcChannel, dstCluster, dstIndex, dstSection, dstSectionIndex, dstChannel, status int) error {
	return w.exec(`INSERT OR IGNORE INTO routes (src_cluster_type, src_cluster_type_index, src_section_type, src_section_index, src_channel_index, src_control_id, src_asgn_type, dst_cluster_type, dst_cluster_type_index, dst_section_type, dst_section_index, dst_channel_index, dst_control_id, dst_asgn_type, status)
		VALUES (?, ?, -1, -1, ?, -1, -1, ?, ?, ?, ?, ?, -1, 0, ?)`, srcCluster, srcIndex, srcChannel, dstCluster, dstIndex, dstSection, dstSectionIndex, dstChannel, status)
}

type lv1Slot struct{ bank, slot int }

func (s lv1Slot) index() int { return s.bank*8 + s.slot }

func (w *lv1Writer) write(show Show) error {
	n := w.n
	strips := map[int64]Strip{}
	stripObj := map[int64]int64{}
	for _, strip := range show.Strips {
		id, ok := w.obj(lv1Input, strip.Number-1)
		if strip.Aux || !ok {
			n.add(LeftOut, "%d strips an LV1 has not got, not in the session.", stripLabel(strip))
			continue
		}
		strips[strip.ID], stripObj[strip.ID] = strip, id
		if err := w.nameAndColour(id, strip.Name, strip.Color); err != nil {
			return err
		}
		if strip.Stereo {
			// A stereo input is a stereo chainer with the stereo plug-ins and their
			// default presets; the triggers keep the presets' ref counts.
			if err := w.exec(`UPDATE chainer SET num_inputs = 2 WHERE obj_id = ?`, id); err != nil {
				return err
			}
			for slot, pair := range [][2]string{{"CFLM", "CFLS"}, {"CDYM", "CDYS"}, {"MQ4M", "MQ4S"}} {
				if err := w.exec(`UPDATE plug SET plugin_4cc = ? WHERE chainer_id = ? AND slot = ? AND plugin_4cc = ?`, pair[1], id, slot, pair[0]); err != nil {
					return err
				}
				if err := w.exec(`UPDATE snapshot_plugin SET preset_id = ? WHERE plug_id = (SELECT id FROM plug WHERE chainer_id = ? AND slot = ?)`, 4+slot, id, slot); err != nil {
					return err
				}
			}
		}
	}

	mixes := map[int64]Mix{}
	mixObj := map[int64]int64{}
	for _, mix := range show.Mixes {
		id, _, _, ok := w.mixObject(mix)
		if !ok {
			n.add(LeftOut, "%d mixes past the desk's pools, not in the session.", mix.Name)
			continue
		}
		mixes[mix.ID], mixObj[mix.ID] = mix, id
		if mix.Kind != "mute" {
			if err := w.nameAndColour(id, mix.Name, mix.Color); err != nil {
				return err
			}
		}
		if mix.Stereo && (mix.Kind == "monitor" || mix.Kind == "fx" || mix.Kind == "matrix") {
			n.add(Changed, "%d stereo mixes are written as the template's; set them stereo on the desk.", mix.Name)
		}
	}

	// The template routes inputs and the first groups to Main; a written strip or
	// group is on Main only when the plan routes it there.
	for _, id := range append(values(stripObj), groupObjects(mixes, mixObj)...) {
		if err := w.exec(`DELETE FROM snapshot_assignment WHERE snapshot_id = -1 AND src_id = ? AND src_control_id = 2`, id); err != nil {
			return err
		}
	}
	for _, route := range show.Routes {
		to, ok := mixes[route.ToMix]
		if !ok {
			continue
		}
		dst := mixObj[route.ToMix]
		var src int64
		srcKind, srcSlot, label := "channel", 0, ""
		if strip, ok := strips[route.FromStrip]; ok && route.FromStrip != 0 {
			src, label = stripObj[route.FromStrip], strip.Name
		} else if from, ok := mixes[route.FromMix]; ok && route.FromMix != 0 {
			src, srcKind, srcSlot, label = mixObj[route.FromMix], from.Kind, from.Slot, from.Name
		} else {
			continue
		}
		refuse := func() { n.add(LeftOut, "%d routes an LV1 cannot make; kept in PatchPlanner.", label+" → "+to.Name) }
		switch to.Kind {
		case "main", "subgroup":
			if srcKind != "channel" && srcKind != "subgroup" || to.Kind == "subgroup" && srcKind == "subgroup" && srcSlot >= to.Slot {
				refuse()
				continue
			}
			if err := w.assign(src, dst, "bus"); err != nil {
				return err
			}
		case "matrix":
			if srcKind == "fx" || srcKind == "matrix" {
				refuse()
				continue
			}
			if err := w.assign(src, dst, "matrix"); err != nil {
				return err
			}
		case "dca", "mute":
			if to.Kind == "dca" && srcKind != "channel" {
				refuse()
				continue
			}
			if err := w.assign(src, dst, "link"); err != nil {
				return err
			}
		case "monitor", "fx":
			if srcKind != "channel" {
				refuse()
				continue
			}
			aux := to.Slot - 1
			if to.Kind == "monitor" {
				aux += 8
			}
			gain, on, ok := w.auxParams(aux)
			if !ok {
				refuse()
				continue
			}
			// Sends on at 0 dB (user, 2026-10-18).
			for _, p := range [][2]float64{{float64(gain), 0}, {float64(on), 1}} {
				if err := w.exec(`INSERT OR REPLACE INTO snapshot_chainer_params (chainer_id, snapshot_id, param_id, param_value) VALUES (?, -1, ?, ?)`, src, int64(p[0]), p[1]); err != nil {
					return err
				}
			}
		}
	}

	// Devices: one per mapped slot of a known model, with 48 V on the patched inputs that want it.
	phantom := map[lv1Slot]map[int]bool{}
	models := map[lv1Slot]string{}
	note := func(port *DeskPort) (lv1Slot, bool) {
		if port == nil || port.Socket != "device" {
			return lv1Slot{}, false
		}
		at := lv1Slot{port.Bank, port.Slot}
		models[at] = port.Device
		return at, true
	}
	for _, strip := range strips {
		for side, port := range []*DeskPort{strip.Input, strip.InputR} {
			at, ok := note(port)
			if !ok || side == 1 && !strip.Stereo {
				continue
			}
			if phantom[at] == nil {
				phantom[at] = map[int]bool{}
			}
			if strip.Phantom {
				phantom[at][port.Index] = true
			}
		}
	}
	for _, output := range show.Outputs {
		note(output.Port)
		note(output.PortR)
	}
	mac := 0
	counts := map[string]int{}
	// In slot order, so device names and macs are the same on every export.
	slots := make([]lv1Slot, 0, len(models))
	for at := range models {
		slots = append(slots, at)
	}
	sort.Slice(slots, func(i, j int) bool { return slots[i].index() < slots[j].index() })
	for _, at := range slots {
		model := models[at]
		device, known := lv1Devices[model]
		if !known {
			if len(phantom[at]) > 0 {
				n.add(Changed, "%d slots of unknown model: 48 V not set; switch it on at the device.", fmt.Sprintf("bank %d slot %d", at.bank+1, at.slot+1))
			}
			continue
		}
		mac++
		counts[model]++
		if mac == 1 {
			// LV1 clocks from the first device it is given, as its own sessions show.
			if err := w.exec(`UPDATE clock_source_master SET clock_type = 2, mac = 1 WHERE id = 0`); err != nil {
				return err
			}
		}
		if err := w.addDevice(at, mac, device, fmt.Sprintf("%s-%d", device.namePrefix, counts[model]), phantom[at]); err != nil {
			return err
		}
	}

	// The input patch: a device input into a strip's A input, L and R.
	for _, strip := range strips {
		for side, port := range []*DeskPort{strip.Input, strip.InputR} {
			if port == nil || port.Socket != "device" || side == 1 && !strip.Stereo {
				continue
			}
			if err := w.route(lv1Inputs, lv1Slot{port.Bank, port.Slot}.index(), port.Index, lv1Input, strip.Number-1, 0, 0, side, 0); err != nil {
				return err
			}
		}
		if strip.Input == nil {
			n.add(NoInput, "%d strips have no input patched.", strip.Name)
		}
	}
	// Outputs: a mix side or a direct out onto a device output.
	for _, output := range show.Outputs {
		for side, port := range []*DeskPort{output.Port, output.PortR} {
			if port == nil || port.Socket != "device" || side == 1 && !output.Stereo {
				continue
			}
			cluster, index, channel, ok := w.outputSource(output, side, mixes, strips)
			if !ok {
				n.add(LeftOut, "%d outputs fed by something not in the session.", output.Name)
				continue
			}
			if err := w.route(cluster, index, channel, lv1Outputs, lv1Slot{port.Bank, port.Slot}.index(), 0, -1, port.Index, 0); err != nil {
				return err
			}
		}
	}
	return w.writeRecorder(show, strips, mixes, models)
}

func (w *lv1Writer) outputSource(output Output, side int, mixes map[int64]Mix, strips map[int64]Strip) (cluster, index, channel int, ok bool) {
	if output.FedByStrip != 0 {
		strip, found := strips[output.FedByStrip]
		return lv1Input, strip.Number - 1, side, found
	}
	mix, found := mixes[output.FedByMix]
	if !found {
		return 0, 0, 0, false
	}
	_, cluster, index, ok = w.mixObject(mix)
	channel = output.FedBySide
	if output.Stereo && mix.Stereo {
		channel = side
	}
	return cluster, index, channel, ok
}

var phantomLine = regexp.MustCompile(`^(    )(\d+): \d+$`)

// phantomChunk sets the 48 V entries of a device's YAML for the given inputs,
// changing nothing else in the chunk read from the saved session.
func phantomChunk(chunk, key string, on map[int]bool) string {
	lines := strings.Split(chunk, "\n")
	inMap := false
	for i, line := range lines {
		if strings.TrimSpace(line) == key+":" {
			inMap = true
			continue
		}
		if !inMap {
			continue
		}
		m := phantomLine.FindStringSubmatch(line)
		if m == nil {
			inMap = false
			continue
		}
		port, _ := strconv.Atoi(m[2])
		value := "0"
		if on[port] {
			value = "1"
		}
		lines[i] = fmt.Sprintf("%s%d: %s", m[1], port, value)
	}
	return strings.Join(lines, "\n")
}

// addDevice creates the device LV1 would have — it does not create one for a
// patched empty slot (design: LV1) — and points the slot's I/O chunk at it.
func (w *lv1Writer) addDevice(at lv1Slot, mac int, device lv1Device, name string, phantom map[int]bool) error {
	result, err := w.tx.Exec(`INSERT INTO device (device_gender, mac, io_bank, assign, version, description, in_channel_count, out_channel_count, max_in_channel_count, max_out_channel_count, owner_uuid, ownership_level, is_share_preamp, is_golden_box, golden_box_id)
		VALUES (0, ?, ?, ?, '', '', ?, ?, ?, ?, '', 0, 0, 0, 0)`, mac, at.bank, at.slot, device.in, device.out, device.maxIn, device.maxOut)
	if err != nil {
		return fmt.Errorf("insert device: %w", err)
	}
	id, _ := result.LastInsertId()
	if err := w.exec(`INSERT INTO device_iobox (id, boot_version, device_id, vendor_id, emulation_mode, midi_capable, assigned_to_midi) VALUES (?, '', ?, ?, -1, 0, 0)`, id, device.device, device.vendor); err != nil {
		return fmt.Errorf("insert device_iobox: %w", err)
	}
	if err := w.exec(`INSERT INTO device_name (mac, gender, "key", name) VALUES (?, 0, ?, ?)`, mac, fmt.Sprintf("00:00:00:00:00:%02X#0", mac), name); err != nil {
		return fmt.Errorf("insert device_name: %w", err)
	}
	chunk, err := w.tx.Exec(`INSERT INTO iom_chunks (ref_count, device_id, vendor_id, iom_chunk) VALUES (0, ?, ?, ?)`, device.device, device.vendor, phantomChunk(device.chunk, device.phantomKey, phantom))
	if err != nil {
		return fmt.Errorf("insert iom chunk: %w", err)
	}
	chunkID, _ := chunk.LastInsertId()
	// The trigger moves the ref counts from the empty-slot chunk to this one.
	return w.exec(`UPDATE snapshot_iom SET iom_chunk_id = ? WHERE snapshot_id = -1 AND io_bank = ? AND io_slot = ?`, chunkID, at.bank, at.slot)
}

// writeRecorder writes the desk's recorder as a 64/64 SoundGrid DAW device in the
// first free slot. No saved session contains one, so it is inferred and the
// preview says so (user, 2026-10-18: check it on LV1).
func (w *lv1Writer) writeRecorder(show Show, strips map[int64]Strip, mixes map[int64]Mix, taken map[lv1Slot]string) error {
	if show.RecorderTracks == 0 || len(show.Tracks) == 0 {
		return nil
	}
	var at lv1Slot
	found := false
	for bank := 0; bank < 2 && !found; bank++ {
		for slot := 0; slot < 8 && !found; slot++ {
			if _, used := taken[lv1Slot{bank, slot}]; !used {
				at, found = lv1Slot{bank, slot}, true
			}
		}
	}
	if !found {
		w.n.add(LeftOut, "%d recorders with no free I/O slot.", "recorder")
		return nil
	}
	mac := 0x40
	result, err := w.tx.Exec(`INSERT INTO device (device_gender, mac, io_bank, assign, version, description, in_channel_count, out_channel_count, max_in_channel_count, max_out_channel_count, owner_uuid, ownership_level, is_share_preamp, is_golden_box, golden_box_id)
		VALUES (1, ?, ?, ?, '', 'PatchPlanner recorder', 64, 64, 64, 64, '', 0, 0, 0, 0)`, mac, at.bank, at.slot)
	if err != nil {
		return fmt.Errorf("insert recorder: %w", err)
	}
	id, _ := result.LastInsertId()
	if err := w.exec(`INSERT INTO device_daw (id, hostname, is_local) VALUES (?, 'Recorder', 0)`, id); err != nil {
		return err
	}
	if err := w.exec(`INSERT INTO device_name (mac, gender, "key", name) VALUES (?, 1, ?, 'Recorder')`, mac, fmt.Sprintf("00:00:00:00:00:%02X#1", mac)); err != nil {
		return err
	}
	w.n.add(Changed, "%d recorders written as a 64/64 SoundGrid device, unverified: check it on LV1.", fmt.Sprintf("bank %d slot %d", at.bank+1, at.slot+1))
	for _, track := range show.Tracks {
		if track.Number < 1 || track.Number > 64 {
			w.n.add(LeftOut, "%d recorder tracks past the recorder's 64.", fmt.Sprintf("track %d", track.Number))
			continue
		}
		port := track.Number - 1
		if strip, ok := strips[track.FromStrip]; ok && track.FromStrip != 0 && strip.Input != nil && strip.Input.Socket == "device" {
			// A preamp straight to the recorder, device to device.
			if err := w.route(lv1Inputs, lv1Slot{strip.Input.Bank, strip.Input.Slot}.index(), strip.Input.Index, lv1Outputs, at.index(), 0, -1, port, 0); err != nil {
				return err
			}
		} else if _, ok := strips[track.FromStrip]; ok && track.FromStrip != 0 {
			w.n.add(LeftOut, "%d recorder tracks record a preamp that is not on a device.", fmt.Sprintf("track %d", track.Number))
		} else if mix, ok := mixes[track.FromMix]; ok && track.FromMix != 0 {
			_, cluster, index, ok := w.mixObject(mix)
			if ok {
				if err := w.route(cluster, index, track.FromSide, lv1Outputs, at.index(), 0, -1, port, 0); err != nil {
					return err
				}
			}
		}
		if strip, ok := strips[track.PlayStrip]; ok && track.PlayStrip != 0 {
			// Soundcheck plays into the strip's B input; a source track into A.
			section, status := 0, 0
			if track.Soundcheck {
				section, status = 1, 1
			}
			if err := w.route(lv1Inputs, at.index(), port, lv1Input, strip.Number-1, 0, section, 0, status); err != nil {
				return err
			}
		}
	}
	return nil
}

func values(m map[int64]int64) []int64 {
	out := make([]int64, 0, len(m))
	for _, v := range m {
		out = append(out, v)
	}
	return out
}

func groupObjects(mixes map[int64]Mix, objs map[int64]int64) []int64 {
	var out []int64
	for id, mix := range mixes {
		if mix.Kind == "subgroup" {
			out = append(out, objs[id])
		}
	}
	return out
}
