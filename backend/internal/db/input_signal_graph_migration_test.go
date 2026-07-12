package db

import (
	"bytes"
	"database/sql"
	"log/slog"
	"testing"
)

// TestConvertLegacyInputChannels seeds every legacy row shape called out in
// quickstart.md's "Automated coverage" section directly against a
// pre-030-and-below schema (input_channels' legacy columns still present,
// not yet dropped by migration 030) and asserts the migrated Source/
// Device/Cable graph, per research.md R7.
func TestConvertLegacyInputChannels(t *testing.T) {
	database := openMigratedTo(t, 29)
	logBuf := &bytes.Buffer{}
	logger := slog.New(slog.NewTextHandler(logBuf, nil))

	eventID := migrationTestEvent(t, database)
	micItem := migrationInventoryItem(t, database, "Shure SM58")
	standItem := migrationInventoryItem(t, database, "Boom stand")
	diBoxItem := migrationInventoryItem(t, database, "Radial J48")
	cable1 := migrationInventoryItem(t, database, "Cable 1")
	cable2 := migrationInventoryItem(t, database, "Cable 2")
	sourceCable := migrationInventoryItem(t, database, "Instrument cable")

	// (a) mic direct-to-channel: no stagebox/multi, a mic + stand + phantom.
	chA := insertLegacyInputChannel(t, database, eventID, legacyInputChannelSeed{
		ChannelNumber: 1, ChannelName: "Lead Vox", SignalType: "mic",
		MicItemID: &micItem, StandItemID: &standItem, PhantomPower: true, CableItemID: &cable1,
	})

	// (b) mic via a stagebox.
	stageboxID := migrationStagebox(t, database, eventID, "SB1")
	stageboxChannel := 5
	chB := insertLegacyInputChannel(t, database, eventID, legacyInputChannelSeed{
		ChannelNumber: 2, SignalType: "mic", MicItemID: &micItem,
		StageboxID: &stageboxID, StageboxChannel: &stageboxChannel, CableItemID: &cable2,
	})

	// (c) mic via a stage multi.
	stageMultiID := migrationStageMulti(t, database, eventID, "Multi 1")
	stageMultiChannel := 3
	chC := insertLegacyInputChannel(t, database, eventID, legacyInputChannelSeed{
		ChannelNumber: 3, SignalType: "mic", MicItemID: &micItem,
		StageMultiID: &stageMultiID, StageMultiChannel: &stageMultiChannel,
	})

	// (d) line/DI via a one-off device — mic_item_id holds the DI box item
	// (rental.go's overloaded-column convention), source_cable_item_id the
	// source->DI instrument cable.
	chD := insertLegacyInputChannel(t, database, eventID, legacyInputChannelSeed{
		ChannelNumber: 4, ChannelName: "Bass", SignalType: "di",
		MicItemID: &diBoxItem, SourceCableItemID: &sourceCable, CableItemID: &cable1,
	})

	// (e) stereo with two_cables: both sides independently routed via a
	// stage multi, sharing the same mic/cable picks (the old model's only
	// option), each side's own multi channel.
	stageMultiChannelE, stageMultiChannelEB := 10, 11
	chE := insertLegacyInputChannel(t, database, eventID, legacyInputChannelSeed{
		ChannelNumber: 9, ChannelName: "Overheads", Width: "stereo", SignalType: "mic", MicItemID: &micItem, CableItemID: &cable2,
		StageMultiID: &stageMultiID, StageMultiChannel: &stageMultiChannelE,
		StageMultiIDB: &stageMultiID, StageMultiChannelB: &stageMultiChannelEB,
	})

	// (f) stereo DI with splitter cabling: side B's source->DI cable must
	// come back NULL (billed once, research.md R6), and the DI device must
	// be one shared 2-in/2-out row, not two one-offs.
	chF := insertLegacyInputChannel(t, database, eventID, legacyInputChannelSeed{
		ChannelNumber: 20, ChannelName: "Playback", Width: "stereo", SignalType: "di",
		MicItemID: &diBoxItem, SourceCableItemID: &sourceCable, SourceCabling: "splitter", CableItemID: &cable1,
	})

	// (g) a row with only legacy free-text fallback fields set (no catalog
	// picks at all) — must be logged as dropped, not silently discarded.
	chG := insertLegacyInputChannel(t, database, eventID, legacyInputChannelSeed{
		ChannelNumber: 30, SignalType: "mic", MicLabel: "Some old mic", CableType: "xlr", CableLengthM: 10, MicStand: "boom",
	})

	if err := convertLegacyInputChannels(database, logger); err != nil {
		t.Fatalf("convert: %v", err)
	}

	// (a) assertions: one source, direct real cable to the channel.
	cablesToA := inputCablesTo(t, database, "channel", chA)
	if len(cablesToA) != 1 || cablesToA[0].FromKind != "source" || cablesToA[0].CableItemID == nil || *cablesToA[0].CableItemID != cable1 {
		t.Fatalf("channel A cable unexpected: %+v", cablesToA)
	}
	sourceA := getInputSource(t, database, cablesToA[0].FromID)
	if sourceA.Kind != "mic" || sourceA.MicItemID == nil || *sourceA.MicItemID != micItem || sourceA.StandItemID == nil || *sourceA.StandItemID != standItem || !sourceA.PhantomPower {
		t.Fatalf("source A unexpected: %+v", sourceA)
	}

	// (b) assertions: real cable into the stagebox jack, cableless hop onward.
	cablesToStagebox := inputCablesTo(t, database, "stagebox", stageboxID)
	var foundB bool
	for _, c := range cablesToStagebox {
		if c.ToPort == stageboxChannel-1 {
			foundB = true
			if c.FromKind != "source" || c.CableItemID == nil || *c.CableItemID != cable2 {
				t.Fatalf("channel B cable into stagebox unexpected: %+v", c)
			}
		}
	}
	if !foundB {
		t.Fatalf("expected a cable into stagebox port %d for channel B", stageboxChannel-1)
	}
	cablesFromStageboxToB := inputCablesTo(t, database, "channel", chB)
	if len(cablesFromStageboxToB) != 1 || cablesFromStageboxToB[0].FromKind != "stagebox" || cablesFromStageboxToB[0].CableItemID != nil {
		t.Fatalf("channel B cableless hop unexpected: %+v", cablesFromStageboxToB)
	}

	// (c) assertions: same shape via stage multi.
	cablesFromMultiToC := inputCablesTo(t, database, "channel", chC)
	if len(cablesFromMultiToC) != 1 || cablesFromMultiToC[0].FromKind != "stage_multi" || cablesFromMultiToC[0].CableItemID != nil {
		t.Fatalf("channel C cableless hop unexpected: %+v", cablesFromMultiToC)
	}

	// (d) assertions: source -> DI device -> channel, DI device sized 1/1
	// with the DI box's own catalog item, source's own kind is "line".
	cablesToD := inputCablesTo(t, database, "channel", chD)
	if len(cablesToD) != 1 || cablesToD[0].FromKind != "device" || cablesToD[0].CableItemID == nil || *cablesToD[0].CableItemID != cable1 {
		t.Fatalf("channel D cable unexpected: %+v", cablesToD)
	}
	diDeviceD := cablesToD[0].FromID
	assertInputDevicePorts(t, database, diDeviceD, 1, 1)
	var diItemD sql.NullInt64
	if err := database.QueryRow(`SELECT inventory_item_id FROM input_devices WHERE id = ?`, diDeviceD).Scan(&diItemD); err != nil {
		t.Fatalf("load DI device D: %v", err)
	}
	if !diItemD.Valid || diItemD.Int64 != diBoxItem {
		t.Fatalf("DI device D expected inventory item %d, got %+v", diBoxItem, diItemD)
	}
	cablesIntoD := inputCablesTo(t, database, "device", diDeviceD)
	if len(cablesIntoD) != 1 || cablesIntoD[0].CableItemID == nil || *cablesIntoD[0].CableItemID != sourceCable {
		t.Fatalf("source->DI cable D unexpected: %+v", cablesIntoD)
	}
	sourceD := getInputSource(t, database, cablesIntoD[0].FromID)
	if sourceD.Kind != "line" || sourceD.MicItemID != nil {
		t.Fatalf("source D expected line kind with no mic item, got %+v", sourceD)
	}

	// (e) assertions: two independent sources/channels, sharing the same
	// mic+cable catalog picks (only option the old model had), each with
	// its own stage-multi channel.
	cablesFromMultiToSideA := inputCablesTo(t, database, "channel", chE)
	if len(cablesFromMultiToSideA) != 1 || cablesFromMultiToSideA[0].FromID != stageMultiID {
		t.Fatalf("side A channel E cableless hop unexpected: %+v", cablesFromMultiToSideA)
	}
	cablesToMultiChanE := inputCablesTo(t, database, "stage_multi", stageMultiID)
	var sideACable, sideBCable *inputCableRow
	for i, c := range cablesToMultiChanE {
		if c.ToPort == stageMultiChannelE-1 {
			sideACable = &cablesToMultiChanE[i]
		}
		if c.ToPort == stageMultiChannelEB-1 {
			sideBCable = &cablesToMultiChanE[i]
		}
	}
	if sideACable == nil || sideBCable == nil {
		t.Fatalf("expected cables at both stage-multi channels for E, got %+v", cablesToMultiChanE)
	}
	if sideACable.CableItemID == nil || *sideACable.CableItemID != cable2 || sideBCable.CableItemID == nil || *sideBCable.CableItemID != cable2 {
		t.Fatalf("channel E both sides expected cable2 (only option in old model): A=%+v B=%+v", sideACable, sideBCable)
	}
	if sideACable.FromID == sideBCable.FromID {
		t.Fatalf("channel E sides must be independent Source rows, both got %d", sideACable.FromID)
	}
	var sideBChannelIDE int64
	if err := database.QueryRow(`SELECT id FROM input_channels WHERE event_id = ? AND channel_number = ?`, eventID, 10).Scan(&sideBChannelIDE); err != nil {
		t.Fatalf("expected a new side-B channel numbered 10 for E: %v", err)
	}
	cablesFromMultiToSideB := inputCablesTo(t, database, "channel", sideBChannelIDE)
	if len(cablesFromMultiToSideB) != 1 || cablesFromMultiToSideB[0].FromID != stageMultiID {
		t.Fatalf("side B channel E cableless hop unexpected: %+v", cablesFromMultiToSideB)
	}

	// (f) assertions: one shared 2-in/2-out DI device, side B's source->DI
	// cable is NULL (splitter, billed once).
	var sideBChannelIDF int64
	if err := database.QueryRow(`SELECT id FROM input_channels WHERE event_id = ? AND channel_number = ?`, eventID, 21).Scan(&sideBChannelIDF); err != nil {
		t.Fatalf("expected a new side-B channel numbered 21 for F: %v", err)
	}
	cablesToF := inputCablesTo(t, database, "channel", chF)
	cablesToSideBF := inputCablesTo(t, database, "channel", sideBChannelIDF)
	if len(cablesToF) != 1 || len(cablesToSideBF) != 1 {
		t.Fatalf("channel F expected one cable per side, got A=%+v B=%+v", cablesToF, cablesToSideBF)
	}
	diDeviceF := cablesToF[0].FromID
	if cablesToSideBF[0].FromID != diDeviceF {
		t.Fatalf("channel F both sides must share the same DI device, got %d and %d", diDeviceF, cablesToSideBF[0].FromID)
	}
	assertInputDevicePorts(t, database, diDeviceF, 2, 2)
	cablesIntoDIF := inputCablesTo(t, database, "device", diDeviceF)
	if len(cablesIntoDIF) != 2 {
		t.Fatalf("expected 2 source->DI cables for channel F, got %+v", cablesIntoDIF)
	}
	var sideACableF, sideBCableF *inputCableRow
	for i, c := range cablesIntoDIF {
		switch c.ToPort {
		case 0:
			sideACableF = &cablesIntoDIF[i]
		case 1:
			sideBCableF = &cablesIntoDIF[i]
		}
	}
	if sideACableF == nil || sideACableF.CableItemID == nil || *sideACableF.CableItemID != sourceCable {
		t.Fatalf("channel F side A source->DI cable expected sourceCable, got %+v", sideACableF)
	}
	if sideBCableF == nil || sideBCableF.CableItemID != nil {
		t.Fatalf("channel F side B source->DI cable expected NULL (splitter), got %+v", sideBCableF)
	}

	// (g) assertions: dropped legacy text logged, source/cable still created.
	cablesToG := inputCablesTo(t, database, "channel", chG)
	if len(cablesToG) != 1 {
		t.Fatalf("channel G expected one direct cable, got %+v", cablesToG)
	}
	if !bytes.Contains(logBuf.Bytes(), []byte("Some old mic")) {
		t.Fatalf("expected dropped legacy mic label to be logged, got: %s", logBuf.String())
	}

	// Idempotency: calling again must be a safe no-op.
	var cablesBefore, sourcesBefore, devicesBefore, channelsBefore int
	database.QueryRow(`SELECT COUNT(*) FROM input_cables`).Scan(&cablesBefore)     //nolint:errcheck
	database.QueryRow(`SELECT COUNT(*) FROM input_sources`).Scan(&sourcesBefore)   //nolint:errcheck
	database.QueryRow(`SELECT COUNT(*) FROM input_devices`).Scan(&devicesBefore)   //nolint:errcheck
	database.QueryRow(`SELECT COUNT(*) FROM input_channels`).Scan(&channelsBefore) //nolint:errcheck
	if err := convertLegacyInputChannels(database, logger); err != nil {
		t.Fatalf("second convert call: %v", err)
	}
	var cablesAfter, sourcesAfter, devicesAfter, channelsAfter int
	database.QueryRow(`SELECT COUNT(*) FROM input_cables`).Scan(&cablesAfter)     //nolint:errcheck
	database.QueryRow(`SELECT COUNT(*) FROM input_sources`).Scan(&sourcesAfter)   //nolint:errcheck
	database.QueryRow(`SELECT COUNT(*) FROM input_devices`).Scan(&devicesAfter)   //nolint:errcheck
	database.QueryRow(`SELECT COUNT(*) FROM input_channels`).Scan(&channelsAfter) //nolint:errcheck
	if cablesAfter != cablesBefore || sourcesAfter != sourcesBefore || devicesAfter != devicesBefore || channelsAfter != channelsBefore {
		t.Fatalf("second convert call was not a no-op: cables %d->%d, sources %d->%d, devices %d->%d, channels %d->%d",
			cablesBefore, cablesAfter, sourcesBefore, sourcesAfter, devicesBefore, devicesAfter, channelsBefore, channelsAfter)
	}
}

// TestConvertLegacyInputChannelsSideBCollision covers a real production
// data pattern (found via specs/012-input-signal-graph/quickstart.md's
// manual verification against a copy of the dev DB): a "stereo" row whose
// side-B *_b columns duplicate a jack that a wholly separate row already
// owns — the old UI apparently left stale side-B fields set even once the
// user had created the R side as its own independent row. Naively
// synthesizing a side-B channel here would either collide on
// channel_number (both claiming channel_number+1) or crash on a
// UNIQUE-constrained jack (both claiming the same stagebox port).
// Instead this row's side B must be skipped, the pre-existing row left to
// convert itself, and the conflicting jack it briefly no longer needs
// dropped in favor of a direct-to-channel cable — not a migration abort.
func TestConvertLegacyInputChannelsSideBCollision(t *testing.T) {
	database := openMigratedTo(t, 29)
	logBuf := &bytes.Buffer{}
	logger := slog.New(slog.NewTextHandler(logBuf, nil))

	eventID := migrationTestEvent(t, database)
	micItem := migrationInventoryItem(t, database, "Overhead mic")
	stageboxID := migrationStagebox(t, database, eventID, "SB1")

	ohLChannel, ohRChannel := 3, 4
	// OH L: marked stereo, side-B fields point at the exact same stagebox
	// jack (channel 4) that OH R's own separate row also claims.
	stageboxChanL, stageboxChanLB := 3, 4
	chL := insertLegacyInputChannel(t, database, eventID, legacyInputChannelSeed{
		ChannelNumber: ohLChannel, ChannelName: "OH L", Width: "stereo", SignalType: "mic", MicItemID: &micItem,
		StageboxID: &stageboxID, StageboxChannel: &stageboxChanL,
		StageboxIDB: &stageboxID, StageboxChannelB: &stageboxChanLB,
	})
	// OH R: its own independent mono row, genuinely at stagebox channel 4.
	stageboxChanR := 4
	chR := insertLegacyInputChannel(t, database, eventID, legacyInputChannelSeed{
		ChannelNumber: ohRChannel, ChannelName: "OH R", Width: "mono", SignalType: "mic", MicItemID: &micItem,
		StageboxID: &stageboxID, StageboxChannel: &stageboxChanR,
	})

	if err := convertLegacyInputChannels(database, logger); err != nil {
		t.Fatalf("convert: %v", err)
	}

	// No phantom side-B row was synthesized for OH L (channel_number 4
	// belongs solely to OH R's own pre-existing row).
	var channelCount int
	if err := database.QueryRow(`SELECT COUNT(*) FROM input_channels WHERE event_id = ? AND channel_number = ?`, eventID, ohRChannel).Scan(&channelCount); err != nil {
		t.Fatalf("count channel_number %d: %v", ohRChannel, err)
	}
	if channelCount != 1 {
		t.Fatalf("expected exactly 1 row at channel_number %d, got %d (side B must not duplicate it)", ohRChannel, channelCount)
	}

	// Both real rows still converted successfully, each with its own real
	// mic Source (no crash, no data silently dropped).
	cablesToL := inputCablesTo(t, database, "channel", chL)
	if len(cablesToL) != 1 {
		t.Fatalf("channel L expected exactly one feed, got %+v", cablesToL)
	}
	cablesToR := inputCablesTo(t, database, "channel", chR)
	if len(cablesToR) != 1 {
		t.Fatalf("channel R expected exactly one feed, got %+v", cablesToR)
	}
	if !bytes.Contains(logBuf.Bytes(), []byte("skipping synthesized duplicate")) {
		t.Fatalf("expected the side-B collision to be logged, got: %s", logBuf.String())
	}
}

// TestConvertLegacyInputChannelsJackFallback covers the other half of the
// same real-world discovery: when a legacy row's stagebox jack is already
// claimed (here, by processing order rather than a channel_number clash),
// the conversion falls back to a direct cable instead of failing outright
// on the UNIQUE constraint.
func TestConvertLegacyInputChannelsJackFallback(t *testing.T) {
	database := openMigratedTo(t, 29)
	logBuf := &bytes.Buffer{}
	logger := slog.New(slog.NewTextHandler(logBuf, nil))

	eventID := migrationTestEvent(t, database)
	micItem := migrationInventoryItem(t, database, "Mic")
	stageboxID := migrationStagebox(t, database, eventID, "SB1")

	// Row 1 (processed first) legitimately claims stagebox channel 1.
	stageboxChan1 := 1
	ch1 := insertLegacyInputChannel(t, database, eventID, legacyInputChannelSeed{
		ChannelNumber: 1, SignalType: "mic", MicItemID: &micItem,
		StageboxID: &stageboxID, StageboxChannel: &stageboxChan1,
	})
	// Row 2 (processed second) mistakenly claims the same jack — a stale
	// duplicate assignment, not resolvable via channel_number since these
	// are unrelated single-sided rows.
	stageboxChan2 := 1
	ch2 := insertLegacyInputChannel(t, database, eventID, legacyInputChannelSeed{
		ChannelNumber: 2, SignalType: "mic", MicItemID: &micItem,
		StageboxID: &stageboxID, StageboxChannel: &stageboxChan2,
	})

	if err := convertLegacyInputChannels(database, logger); err != nil {
		t.Fatalf("convert: %v", err)
	}

	cablesTo1 := inputCablesTo(t, database, "channel", ch1)
	if len(cablesTo1) != 1 || cablesTo1[0].FromKind != "stagebox" {
		t.Fatalf("channel 1 expected to route via the stagebox, got %+v", cablesTo1)
	}
	cablesTo2 := inputCablesTo(t, database, "channel", ch2)
	if len(cablesTo2) != 1 || cablesTo2[0].FromKind != "source" {
		t.Fatalf("channel 2 expected a direct fallback cable (stagebox jack already taken), got %+v", cablesTo2)
	}
	if !bytes.Contains(logBuf.Bytes(), []byte("already claimed by another row")) {
		t.Fatalf("expected the jack collision to be logged, got: %s", logBuf.String())
	}
}

type legacyInputChannelSeed struct {
	ChannelNumber      int
	ChannelName        string
	Width              string
	SignalType         string
	PreampConnector    string
	StageboxID         *int64
	StageboxChannel    *int
	StageMultiID       *int64
	StageMultiChannel  *int
	MicItemID          *int64
	MicLabel           string
	CableItemID        *int64
	StandItemID        *int64
	CableType          string
	CableLengthM       float64
	MicStand           string
	PhantomPower       bool
	StageboxIDB        *int64
	StageboxChannelB   *int
	StageMultiIDB      *int64
	StageMultiChannelB *int
	SourceCableItemID  *int64
	SourceCabling      string
}

func insertLegacyInputChannel(t *testing.T, database *sql.DB, eventID int64, seed legacyInputChannelSeed) int64 {
	t.Helper()
	if seed.Width == "" {
		seed.Width = "mono"
	}
	if seed.SignalType == "" {
		seed.SignalType = "mic"
	}
	if seed.PreampConnector == "" {
		seed.PreampConnector = "xlr"
	}
	if seed.SourceCabling == "" {
		seed.SourceCabling = "two_cables"
	}
	return mustInsertID(t, database, `INSERT INTO input_channels
		(event_id, channel_number, channel_name, width, mixer_behavior, signal_type, preamp_connector,
		 stagebox_id, stagebox_channel, stage_multi_id, stage_multi_channel,
		 mic_item_id, mic_model, cable_item_id, stand_item_id, cable_type, cable_length_m, mic_stand, phantom_power,
		 stagebox_id_b, stagebox_channel_b, stage_multi_id_b, stage_multi_channel_b,
		 source_cable_item_id, source_cabling)
		VALUES (?, ?, ?, ?, 'stereo_channel', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		eventID, seed.ChannelNumber, nullString(seed.ChannelName), seed.Width, seed.SignalType, seed.PreampConnector,
		nullInt64(seed.StageboxID), nullInt(seed.StageboxChannel), nullInt64(seed.StageMultiID), nullInt(seed.StageMultiChannel),
		nullInt64(seed.MicItemID), nullString(seed.MicLabel), nullInt64(seed.CableItemID), nullInt64(seed.StandItemID),
		nullString(seed.CableType), seed.CableLengthM, nullString(seed.MicStand), boolToInt(seed.PhantomPower),
		nullInt64(seed.StageboxIDB), nullInt(seed.StageboxChannelB), nullInt64(seed.StageMultiIDB), nullInt(seed.StageMultiChannelB),
		nullInt64(seed.SourceCableItemID), seed.SourceCabling)
}

type inputCableRow struct {
	FromKind    string
	FromID      int64
	FromPort    int
	ToKind      string
	ToID        int64
	ToPort      int
	CableItemID *int64
}

func inputCablesTo(t *testing.T, database *sql.DB, toKind string, toID int64) []inputCableRow {
	t.Helper()
	return queryInputCables(t, database, `SELECT from_kind, from_id, from_port, to_kind, to_id, to_port, cable_item_id FROM input_cables WHERE to_kind = ? AND to_id = ? ORDER BY to_port`, toKind, toID)
}

func queryInputCables(t *testing.T, database *sql.DB, query string, args ...any) []inputCableRow {
	t.Helper()
	rows, err := database.Query(query, args...)
	if err != nil {
		t.Fatalf("query input cables: %v", err)
	}
	defer rows.Close()
	var result []inputCableRow
	for rows.Next() {
		var row inputCableRow
		var cableItemID sql.NullInt64
		if err := rows.Scan(&row.FromKind, &row.FromID, &row.FromPort, &row.ToKind, &row.ToID, &row.ToPort, &cableItemID); err != nil {
			t.Fatalf("scan input cable: %v", err)
		}
		row.CableItemID = int64PtrFromNull(cableItemID)
		result = append(result, row)
	}
	return result
}

func assertInputDevicePorts(t *testing.T, database *sql.DB, deviceID int64, wantInput, wantOutput int) {
	t.Helper()
	var gotInput, gotOutput int
	if err := database.QueryRow(`SELECT input_port_count, output_port_count FROM input_devices WHERE id = ?`, deviceID).Scan(&gotInput, &gotOutput); err != nil {
		t.Fatalf("load input device %d ports: %v", deviceID, err)
	}
	if gotInput != wantInput || gotOutput != wantOutput {
		t.Fatalf("input device %d ports = (%d in, %d out), want (%d in, %d out)", deviceID, gotInput, gotOutput, wantInput, wantOutput)
	}
}

func getInputSource(t *testing.T, database *sql.DB, id int64) sourceRow {
	t.Helper()
	var row sourceRow
	var micItemID, standItemID sql.NullInt64
	var phantom int
	err := database.QueryRow(`SELECT kind, mic_item_id, stand_item_id, phantom_power, connector_type, width FROM input_sources WHERE id = ?`, id).
		Scan(&row.Kind, &micItemID, &standItemID, &phantom, &row.ConnectorType, &row.Width)
	if err != nil {
		t.Fatalf("load input source %d: %v", id, err)
	}
	row.MicItemID = int64PtrFromNull(micItemID)
	row.StandItemID = int64PtrFromNull(standItemID)
	row.PhantomPower = phantom == 1
	return row
}

type sourceRow struct {
	Kind          string
	MicItemID     *int64
	StandItemID   *int64
	PhantomPower  bool
	ConnectorType string
	Width         string
}
