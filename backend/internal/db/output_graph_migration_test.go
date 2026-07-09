package db

import (
	"bytes"
	"database/sql"
	"log/slog"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// TestConvertOutputChainHopsToGraph seeds every hop shape called out in
// quickstart.md's "Automated coverage" section directly against a
// pre-025-and-below schema (output_chain_hops still present, not yet
// dropped by migration 026) and asserts the migrated graph, per
// research.md R5.
func TestConvertOutputChainHopsToGraph(t *testing.T) {
	database := openMigratedTo(t, 25)
	logBuf := &bytes.Buffer{}
	logger := slog.New(slog.NewTextHandler(logBuf, nil))

	eventID := migrationTestEvent(t, database)

	cableItem := func(name string) int64 { return migrationInventoryItem(t, database, name) }
	cable1 := cableItem("Cable 1")
	cable2 := cableItem("Cable 2")
	cable3 := cableItem("Cable 3")
	cable4 := cableItem("Cable 4 (dropped)")
	cable5a := cableItem("Cable 5a")
	cable5b := cableItem("Cable 5b")
	cableF1 := cableItem("Cable F1")
	cableF2 := cableItem("Cable F2")
	cableF3 := cableItem("Cable F3")
	speakerItem := cableItem("Speaker")
	monitorItem := cableItem("Monitor")
	stereoAmpItem := cableItem("Stereo Amp")
	stereoSpeakerItem := cableItem("Stereo Speaker")

	// (a) plain linear mono device chain: shared device, then a one-off
	// inventory device.
	sharedAmpID := migrationOutputDevice(t, database, eventID, "LR amplifier")
	outputA := migrationOutput(t, database, eventID, 1, "mono")
	insertLegacyHop(t, database, outputA, domain.OutputChainHop{
		Position: 0, HopKind: "device", DeviceSource: "shared", OutputDeviceID: &sharedAmpID, CableItemID: &cable1,
	})
	insertLegacyHop(t, database, outputA, domain.OutputChainHop{
		Position: 1, HopKind: "device", DeviceSource: "inventory", InventoryItemID: &speakerItem, CableItemID: &cable2,
	})

	// (b) route-to-stagebox as the terminal hop.
	stageboxID := migrationStagebox(t, database, eventID, "SB1")
	outputB := migrationOutput(t, database, eventID, 2, "mono")
	stageboxChannelB := 3
	insertLegacyHop(t, database, outputB, domain.OutputChainHop{
		Position: 0, HopKind: "route", StageboxID: &stageboxID, StageboxChannel: &stageboxChannelB,
	})

	// (c) route-to-stagebox mid-chain, followed by more device hops.
	outputC := migrationOutput(t, database, eventID, 3, "mono")
	stageboxChannelC := 5
	insertLegacyHop(t, database, outputC, domain.OutputChainHop{
		Position: 0, HopKind: "route", StageboxID: &stageboxID, StageboxChannel: &stageboxChannelC,
	})
	insertLegacyHop(t, database, outputC, domain.OutputChainHop{
		Position: 1, HopKind: "device", DeviceSource: "inventory", InventoryItemID: &monitorItem, CableItemID: &cable3,
	})

	// (d) route-to-stage-multi with an old cable_item_id set — must be
	// forced to NULL (FR-013).
	stageMultiID := migrationStageMulti(t, database, eventID, "Multi 1")
	outputD := migrationOutput(t, database, eventID, 4, "mono")
	stageMultiChannelD := 2
	insertLegacyHop(t, database, outputD, domain.OutputChainHop{
		Position: 0, HopKind: "route", StageMultiID: &stageMultiID, StageMultiChannel: &stageMultiChannelD, CableItemID: &cable4,
	})

	// (e) a shared device referenced by two different output rows.
	sharedMonitorID := migrationOutputDevice(t, database, eventID, "Shared monitor")
	outputE1 := migrationOutput(t, database, eventID, 5, "mono")
	insertLegacyHop(t, database, outputE1, domain.OutputChainHop{
		Position: 0, HopKind: "device", DeviceSource: "shared", OutputDeviceID: &sharedMonitorID, CableItemID: &cable5a,
	})
	outputE2 := migrationOutput(t, database, eventID, 6, "mono")
	insertLegacyHop(t, database, outputE2, domain.OutputChainHop{
		Position: 0, HopKind: "device", DeviceSource: "shared", OutputDeviceID: &sharedMonitorID, CableItemID: &cable5b,
	})

	// (f) a stereo channel: cable_item_id_b set on one hop, unset on
	// another (falls back to cable_item_id).
	outputF := migrationOutput(t, database, eventID, 7, "stereo")
	insertLegacyHop(t, database, outputF, domain.OutputChainHop{
		Position: 0, HopKind: "device", DeviceSource: "inventory", InventoryItemID: &stereoAmpItem, CableItemID: &cableF1, CableItemIDB: &cableF2,
	})
	insertLegacyHop(t, database, outputF, domain.OutputChainHop{
		Position: 1, HopKind: "device", DeviceSource: "inventory", InventoryItemID: &stereoSpeakerItem, CableItemID: &cableF3,
	})

	if err := convertOutputChainHopsToGraph(database, logger); err != nil {
		t.Fatalf("convert: %v", err)
	}

	// (a) assertions.
	cablesFromMixer := cablesFrom(t, database, "mixer", outputA)
	if len(cablesFromMixer) != 1 || cablesFromMixer[0].ToKind != "device" || cablesFromMixer[0].ToID != sharedAmpID || cablesFromMixer[0].ToPort != 0 || *cablesFromMixer[0].CableItemID != cable1 {
		t.Fatalf("output A mixer cable unexpected: %+v", cablesFromMixer)
	}
	cablesFromAmp := cablesFrom(t, database, "device", sharedAmpID)
	if len(cablesFromAmp) != 1 || cablesFromAmp[0].ToKind != "device" || *cablesFromAmp[0].CableItemID != cable2 {
		t.Fatalf("output A amp->speaker cable unexpected: %+v", cablesFromAmp)
	}
	oneOffSpeakerID := cablesFromAmp[0].ToID
	assertDevicePorts(t, database, sharedAmpID, 1, 1)
	assertDevicePorts(t, database, oneOffSpeakerID, 1, 0)

	// (b) assertions: no cable anywhere, mixer port unconnected, and
	// specifically no cable out of the stagebox port output B's hop
	// resolved to (the stagebox is shared with output C below, which does
	// legitimately have a cable out of its own different port).
	if got := cablesFrom(t, database, "mixer", outputB); len(got) != 0 {
		t.Fatalf("output B expected no mixer cable, got %+v", got)
	}
	for _, c := range cablesFrom(t, database, "stagebox", stageboxID) {
		if c.FromPort == stageboxChannelB-1 {
			t.Fatalf("output B expected no cable out of stagebox port %d, got %+v", stageboxChannelB-1, c)
		}
	}

	// (c) assertions: downstream hop sourced from the stagebox at
	// channel 5 (port index 4).
	cablesFromStagebox := cablesFrom(t, database, "stagebox", stageboxID)
	found := false
	for _, c := range cablesFromStagebox {
		if c.FromPort == stageboxChannelC-1 {
			found = true
			if c.CableItemID == nil || *c.CableItemID != cable3 {
				t.Fatalf("output C cable from stagebox has wrong cable item: %+v", c)
			}
		}
	}
	if !found {
		t.Fatalf("output C expected a cable out of stagebox port %d, got %+v", stageboxChannelC-1, cablesFromStagebox)
	}

	// (d) assertions: cable into the stage multi with cable_item_id
	// forced NULL.
	cablesFromMixerD := cablesFrom(t, database, "mixer", outputD)
	if len(cablesFromMixerD) != 1 || cablesFromMixerD[0].ToKind != "stage_multi" || cablesFromMixerD[0].ToID != stageMultiID || cablesFromMixerD[0].ToPort != stageMultiChannelD-1 {
		t.Fatalf("output D cable into stage multi unexpected: %+v", cablesFromMixerD)
	}
	if cablesFromMixerD[0].CableItemID != nil {
		t.Fatalf("output D cable_item_id should be forced NULL (FR-013), got %v", *cablesFromMixerD[0].CableItemID)
	}
	if !bytes.Contains(logBuf.Bytes(), []byte("dropped")) {
		t.Fatalf("expected a dropped-link/cable warning to be logged, got: %s", logBuf.String())
	}

	// (e) assertions: one shared device row, two cables, ports sized to 2.
	cablesToSharedMonitor := cablesTo(t, database, "device", sharedMonitorID)
	if len(cablesToSharedMonitor) != 2 {
		t.Fatalf("expected 2 cables into the shared monitor, got %+v", cablesToSharedMonitor)
	}
	ports := map[int]bool{}
	for _, c := range cablesToSharedMonitor {
		ports[c.ToPort] = true
	}
	if !ports[0] || !ports[1] {
		t.Fatalf("expected shared monitor cables at ports 0 and 1, got %+v", cablesToSharedMonitor)
	}
	assertDevicePorts(t, database, sharedMonitorID, 2, 0)
	var sharedDeviceCount int
	if err := database.QueryRow(`SELECT COUNT(*) FROM output_devices WHERE id = ?`, sharedMonitorID).Scan(&sharedDeviceCount); err != nil {
		t.Fatalf("count shared device rows: %v", err)
	}
	if sharedDeviceCount != 1 {
		t.Fatalf("expected exactly 1 output_devices row for the shared monitor, got %d", sharedDeviceCount)
	}

	// (f) assertions: independent per-side devices and cable picks.
	cablesFromMixerF := cablesFrom(t, database, "mixer", outputF)
	if len(cablesFromMixerF) != 2 {
		t.Fatalf("expected 2 mixer cables for the stereo channel, got %+v", cablesFromMixerF)
	}
	var sideA, sideB outputCableRow
	for _, c := range cablesFromMixerF {
		switch c.FromPort {
		case 0:
			sideA = c
		case 1:
			sideB = c
		default:
			t.Fatalf("unexpected mixer port on stereo output: %+v", c)
		}
	}
	if sideA.CableItemID == nil || *sideA.CableItemID != cableF1 {
		t.Fatalf("side A cable expected cableF1, got %+v", sideA)
	}
	if sideB.CableItemID == nil || *sideB.CableItemID != cableF2 {
		t.Fatalf("side B cable expected cableF2 (its own pick), got %+v", sideB)
	}
	if sideA.ToID == sideB.ToID {
		t.Fatalf("side A and side B must resolve to independent one-off devices, both got device %d", sideA.ToID)
	}
	sideADownstream := cablesFrom(t, database, "device", sideA.ToID)
	sideBDownstream := cablesFrom(t, database, "device", sideB.ToID)
	if len(sideADownstream) != 1 || sideADownstream[0].CableItemID == nil || *sideADownstream[0].CableItemID != cableF3 {
		t.Fatalf("side A downstream cable expected cableF3 fallback, got %+v", sideADownstream)
	}
	if len(sideBDownstream) != 1 || sideBDownstream[0].CableItemID == nil || *sideBDownstream[0].CableItemID != cableF3 {
		t.Fatalf("side B downstream cable expected cableF3 fallback (cable_item_id_b unset on hop 1), got %+v", sideBDownstream)
	}

	// output_chain_hops must be fully cleared, but the table itself must
	// still exist (026 hasn't run in this test).
	var remaining int
	if err := database.QueryRow(`SELECT COUNT(*) FROM output_chain_hops`).Scan(&remaining); err != nil {
		t.Fatalf("count remaining hops: %v", err)
	}
	if remaining != 0 {
		t.Fatalf("expected output_chain_hops to be empty after conversion, got %d rows", remaining)
	}

	// Idempotency: calling again must be a safe no-op.
	var cablesBefore, devicesBefore int
	if err := database.QueryRow(`SELECT COUNT(*) FROM output_cables`).Scan(&cablesBefore); err != nil {
		t.Fatalf("count cables before: %v", err)
	}
	if err := database.QueryRow(`SELECT COUNT(*) FROM output_devices`).Scan(&devicesBefore); err != nil {
		t.Fatalf("count devices before: %v", err)
	}
	if err := convertOutputChainHopsToGraph(database, logger); err != nil {
		t.Fatalf("second convert call: %v", err)
	}
	var cablesAfter, devicesAfter int
	if err := database.QueryRow(`SELECT COUNT(*) FROM output_cables`).Scan(&cablesAfter); err != nil {
		t.Fatalf("count cables after: %v", err)
	}
	if err := database.QueryRow(`SELECT COUNT(*) FROM output_devices`).Scan(&devicesAfter); err != nil {
		t.Fatalf("count devices after: %v", err)
	}
	if cablesAfter != cablesBefore || devicesAfter != devicesBefore {
		t.Fatalf("second convert call was not a no-op: cables %d -> %d, devices %d -> %d", cablesBefore, cablesAfter, devicesBefore, devicesAfter)
	}
}

type outputCableRow struct {
	FromKind    string
	FromID      int64
	FromPort    int
	ToKind      string
	ToID        int64
	ToPort      int
	CableItemID *int64
}

func cablesFrom(t *testing.T, database *sql.DB, fromKind string, fromID int64) []outputCableRow {
	t.Helper()
	return queryCables(t, database, `SELECT from_kind, from_id, from_port, to_kind, to_id, to_port, cable_item_id FROM output_cables WHERE from_kind = ? AND from_id = ? ORDER BY from_port`, fromKind, fromID)
}

func cablesTo(t *testing.T, database *sql.DB, toKind string, toID int64) []outputCableRow {
	t.Helper()
	return queryCables(t, database, `SELECT from_kind, from_id, from_port, to_kind, to_id, to_port, cable_item_id FROM output_cables WHERE to_kind = ? AND to_id = ? ORDER BY to_port`, toKind, toID)
}

func queryCables(t *testing.T, database *sql.DB, query string, args ...any) []outputCableRow {
	t.Helper()
	rows, err := database.Query(query, args...)
	if err != nil {
		t.Fatalf("query cables: %v", err)
	}
	defer rows.Close()
	var result []outputCableRow
	for rows.Next() {
		var row outputCableRow
		var cableItemID sql.NullInt64
		if err := rows.Scan(&row.FromKind, &row.FromID, &row.FromPort, &row.ToKind, &row.ToID, &row.ToPort, &cableItemID); err != nil {
			t.Fatalf("scan cable: %v", err)
		}
		row.CableItemID = int64PtrFromNull(cableItemID)
		result = append(result, row)
	}
	return result
}

func assertDevicePorts(t *testing.T, database *sql.DB, deviceID int64, wantInput, wantOutput int) {
	t.Helper()
	var gotInput, gotOutput int
	if err := database.QueryRow(`SELECT input_port_count, output_port_count FROM output_devices WHERE id = ?`, deviceID).Scan(&gotInput, &gotOutput); err != nil {
		t.Fatalf("load device %d ports: %v", deviceID, err)
	}
	if gotInput != wantInput || gotOutput != wantOutput {
		t.Fatalf("device %d ports = (%d in, %d out), want (%d in, %d out)", deviceID, gotInput, gotOutput, wantInput, wantOutput)
	}
}

func insertLegacyHop(t *testing.T, database *sql.DB, outputID int64, hop domain.OutputChainHop) {
	t.Helper()
	mustExec(t, database, `INSERT INTO output_chain_hops
		(output_id, position, hop_kind, cable_item_id, cable_item_id_b, device_source, inventory_item_id, owned_item_id, output_device_id,
		 stagebox_id, stagebox_channel, stagebox_id_b, stagebox_channel_b, stage_multi_id, stage_multi_channel, stage_multi_id_b, stage_multi_channel_b)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		outputID, hop.Position, hop.HopKind, nullInt64(hop.CableItemID), nullInt64(hop.CableItemIDB), nullString(hop.DeviceSource),
		nullInt64(hop.InventoryItemID), nullInt64(hop.OwnedItemID), nullInt64(hop.OutputDeviceID),
		nullInt64(hop.StageboxID), nullInt(hop.StageboxChannel), nullInt64(hop.StageboxIDB), nullInt(hop.StageboxChannelB),
		nullInt64(hop.StageMultiID), nullInt(hop.StageMultiChannel), nullInt64(hop.StageMultiIDB), nullInt(hop.StageMultiChannelB))
}

func migrationTestEvent(t *testing.T, database *sql.DB) int64 {
	t.Helper()
	return mustInsertID(t, database, `INSERT INTO events (name) VALUES (?)`, "Migration test event")
}

func migrationInventoryItem(t *testing.T, database *sql.DB, name string) int64 {
	t.Helper()
	return mustInsertID(t, database, `INSERT INTO inventory_items (name) VALUES (?)`, name)
}

func migrationOutput(t *testing.T, database *sql.DB, eventID int64, outputNumber int, width string) int64 {
	t.Helper()
	return mustInsertID(t, database, `INSERT INTO audio_patch_outputs (event_id, output_number, output_type, width) VALUES (?, ?, 'foh', ?)`, eventID, outputNumber, width)
}

func migrationStagebox(t *testing.T, database *sql.DB, eventID int64, name string) int64 {
	t.Helper()
	return mustInsertID(t, database, `INSERT INTO stageboxes (event_id, name) VALUES (?, ?)`, eventID, name)
}

func migrationStageMulti(t *testing.T, database *sql.DB, eventID int64, name string) int64 {
	t.Helper()
	return mustInsertID(t, database, `INSERT INTO stage_multis (event_id, name) VALUES (?, ?)`, eventID, name)
}

func migrationOutputDevice(t *testing.T, database *sql.DB, eventID int64, name string) int64 {
	t.Helper()
	return mustInsertID(t, database, `INSERT INTO output_devices (event_id, name) VALUES (?, ?)`, eventID, name)
}

func mustInsertID(t *testing.T, database *sql.DB, query string, args ...any) int64 {
	t.Helper()
	res, err := database.Exec(query, args...)
	if err != nil {
		t.Fatalf("exec %s: %v", query, err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		t.Fatalf("last insert id: %v", err)
	}
	return id
}
