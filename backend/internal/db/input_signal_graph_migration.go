package db

import (
	"database/sql"
	"fmt"
	"log/slog"
)

// legacyInputChannelRow scans an input_channels row's not-yet-dropped
// Slice-0-through-9 legacy columns (migration 029 keeps them; 030 drops
// them once this file has read every row). Migration-only shape, kept
// local to this file rather than in the domain package — nothing else
// ever needs it, and it should be easy to delete in a later cleanup pass
// once every real database has converted (mirrors
// output_graph_migration.go's own note about OutputChainHop).
type legacyInputChannelRow struct {
	ID                 int64
	EventID            int64
	ChannelNumber      int
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

// convertLegacyInputChannels is the one-time conversion of the pre-Slice-12
// flat input_channels row shape (renamed in migration 029 from
// audio_patch_inputs, legacy columns still intact at this point) into the
// Slice 12 Source/Device/Cable graph (specs/012-input-signal-graph/
// research.md R7). Safe no-op once already run: guarded by whether
// input_channels still has its legacy signal_type column (dropped by
// migration 030 on any subsequent startup) and, per row, by whether a
// cable already targets it (a fresh pre-migration channel can never have
// one, since input_cables didn't exist before this conversion ran).
//
// mic_item_id is overloaded by signal_type (see rental.go's own note on
// the pre-Slice-12 query): a mic catalog pick for "mic" rows, an
// IEM/return-pack pick for "return" rows, a DI-box pick for "di" rows.
// Only "di" gets special handling here (a shared input_devices row) —
// every other signal_type's mic_item_id carries straight onto the new
// Source (kind "mic") since it is a real catalog item the rental order
// must keep counting, regardless of what the row happened to be labeled.
//
// A stereo row's two independent physical sides split into two separate
// InputChannel rows, matching the accepted mockup's design (mockup.html)
// rather than the legacy single-row-two-sides shape: side A keeps the
// old row's id (channel_number, name, color, notes, group/DCA
// memberships all untouched); side B is a brand-new row (channel_number
// + 1, everything else copied, its own group/DCA memberships copied
// across from side A's). A stereo DI's DI box is one shared 2-in/2-out
// input_devices row (a real stereo DI is one physical unit), not two
// one-off mono devices.
func convertLegacyInputChannels(db *sql.DB, logger *slog.Logger) error {
	var legacyColumnExists int
	if err := db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('input_channels') WHERE name = 'signal_type'`).Scan(&legacyColumnExists); err != nil {
		return fmt.Errorf("check input_channels legacy columns: %w", err)
	}
	if legacyColumnExists == 0 {
		return nil
	}

	rows, err := db.Query(`SELECT id FROM input_channels ORDER BY id`)
	if err != nil {
		return fmt.Errorf("list input channels: %w", err)
	}
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return fmt.Errorf("scan input channel id: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, id := range ids {
		if err := convertOneLegacyInputChannel(db, id, logger); err != nil {
			return fmt.Errorf("convert input channel %d: %w", id, err)
		}
	}
	return nil
}

func convertOneLegacyInputChannel(db *sql.DB, id int64, logger *slog.Logger) error {
	var alreadyConverted int
	if err := db.QueryRow(`SELECT COUNT(*) FROM input_cables WHERE to_kind = 'channel' AND to_id = ?`, id).Scan(&alreadyConverted); err != nil {
		return fmt.Errorf("check already converted: %w", err)
	}
	if alreadyConverted > 0 {
		return nil
	}

	legacy, err := loadLegacyInputChannelRow(db, id)
	if err != nil {
		return err
	}
	logDroppedLegacyText(logger, id, legacy)

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// A "stereo" legacy row's side B is normally synthesized from its own
	// *_b columns — but real data sometimes already has a wholly separate
	// row at channel_number+1 for that same physical side (this app's
	// actual working convention for a stereo pair, per data-model.md, is
	// two independent rows; the *_b columns turn out to be a vestigial/
	// stale duplicate in that case). Synthesizing one anyway would create
	// a colliding, duplicate channel_number — so only synthesize when
	// nothing already claims it, trusting the pre-existing row to convert
	// itself when the loop reaches it.
	synthesizeSideB := false
	if legacy.Width == "stereo" {
		exists, err := channelNumberExists(tx, legacy.EventID, legacy.ChannelNumber+1)
		if err != nil {
			return err
		}
		synthesizeSideB = !exists
		if exists {
			logger.Warn("input graph migration: stereo row's side B already exists as its own row, skipping synthesized duplicate", "channel_id", id, "channel_number", legacy.ChannelNumber)
		}
	}

	// A stereo row's DI box, if any, is one shared device used by both
	// sides — created once, sized for however many physical sides this
	// row actually has, so side B reuses it (port index 1) rather than
	// getting its own one-off device.
	var diDeviceID *int64
	if legacy.SignalType == "di" {
		ports := 1
		if synthesizeSideB {
			ports = 2
		}
		devID, err := createMigratedDIDevice(tx, legacy.EventID, legacy.MicItemID, ports)
		if err != nil {
			return err
		}
		diDeviceID = &devID
	}

	if err := convertLegacyChannelSide(tx, legacy, id, 0, diDeviceID, logger); err != nil {
		return err
	}
	if synthesizeSideB {
		sideBChannelID, err := createMigratedSideBChannel(tx, legacy, id)
		if err != nil {
			return err
		}
		if err := convertLegacyChannelSide(tx, legacy, sideBChannelID, 1, diDeviceID, logger); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// convertLegacyChannelSide converts one physical side (sideIndex 0 = A,
// 1 = B) of a legacy row into a Source (and, for a DI row, a cable into
// the shared DI device) plus the onward cable(s) into whatever the old
// row routed to — a Stagebox/Stage-Multi jack (real cable) followed by
// its cableless console-side hop into channelID (research.md R5), or
// directly into channelID if neither was set.
func convertLegacyChannelSide(tx *sql.Tx, legacy legacyInputChannelRow, channelID int64, sideIndex int, diDeviceID *int64, logger *slog.Logger) error {
	stageboxID, stageboxChannel := legacy.StageboxID, legacy.StageboxChannel
	stageMultiID, stageMultiChannel := legacy.StageMultiID, legacy.StageMultiChannel
	if sideIndex == 1 {
		stageboxID, stageboxChannel = legacy.StageboxIDB, legacy.StageboxChannelB
		stageMultiID, stageMultiChannel = legacy.StageMultiIDB, legacy.StageMultiChannelB
	}

	// Real legacy data sometimes double-books a jack — e.g. a stereo row's
	// side-B fields and a wholly separate mono row both pointing at the
	// same physical stagebox channel, a stale duplicate from the old UI.
	// input_cables enforces one cable per non-Source port, so converting
	// whichever row gets there second would otherwise abort the entire
	// migration; instead fall back to the next best routing this row's own
	// data still supports (stagebox -> stage multi -> direct), logging the
	// downgrade so it can be reconciled by hand later, rather than losing
	// the whole row.
	if stageboxID != nil {
		taken, err := inputToPortTaken(tx, "stagebox", *stageboxID, derefIntOrZero(stageboxChannel)-1)
		if err != nil {
			return err
		}
		if taken {
			logger.Warn("input graph migration: stagebox jack already claimed by another row, falling back", "channel_id", channelID, "side", sideIndex, "stagebox_id", *stageboxID, "stagebox_channel", derefIntOrZero(stageboxChannel))
			stageboxID = nil
		}
	}
	if stageboxID == nil && stageMultiID != nil {
		taken, err := inputToPortTaken(tx, "stage_multi", *stageMultiID, derefIntOrZero(stageMultiChannel)-1)
		if err != nil {
			return err
		}
		if taken {
			logger.Warn("input graph migration: stage multi jack already claimed by another row, falling back to a direct cable", "channel_id", channelID, "side", sideIndex, "stage_multi_id", *stageMultiID, "stage_multi_channel", derefIntOrZero(stageMultiChannel))
			stageMultiID = nil
		}
	}

	kind := "line"
	if legacy.SignalType != "di" && (legacy.SignalType == "mic" || legacy.MicItemID != nil || legacy.PhantomPower) {
		kind = "mic"
	}
	var micItemID, standItemID *int64
	var phantomPower bool
	if kind == "mic" {
		micItemID, standItemID, phantomPower = legacy.MicItemID, legacy.StandItemID, legacy.PhantomPower
	}
	sourceResult, err := tx.Exec(`INSERT INTO input_sources (event_id, name, kind, mic_item_id, stand_item_id, phantom_power, connector_type, width, position_x, position_y) VALUES (?, 'Migrated source', ?, ?, ?, ?, ?, 'mono', 0, 0)`,
		legacy.EventID, kind, nullInt64(micItemID), nullInt64(standItemID), boolToInt(phantomPower), legacy.PreampConnector)
	if err != nil {
		return fmt.Errorf("create migrated source: %w", err)
	}
	sourceID, _ := sourceResult.LastInsertId()

	originKind, originID, originPort := "source", sourceID, 0

	if diDeviceID != nil {
		sourceCableItemID := legacy.SourceCableItemID
		if sideIndex == 1 && legacy.SourceCabling == "splitter" {
			sourceCableItemID = nil
		}
		if _, err := tx.Exec(`INSERT INTO input_cables (event_id, from_kind, from_id, from_port, to_kind, to_id, to_port, cable_item_id) VALUES (?, ?, ?, ?, 'device', ?, ?, ?)`,
			legacy.EventID, originKind, originID, originPort, *diDeviceID, sideIndex, nullInt64(sourceCableItemID)); err != nil {
			return fmt.Errorf("insert source-to-di cable: %w", err)
		}
		originKind, originID, originPort = "device", *diDeviceID, sideIndex
	}

	switch {
	case stageboxID != nil:
		toPort := derefIntOrZero(stageboxChannel) - 1
		if _, err := tx.Exec(`INSERT INTO input_cables (event_id, from_kind, from_id, from_port, to_kind, to_id, to_port, cable_item_id) VALUES (?, ?, ?, ?, 'stagebox', ?, ?, ?)`,
			legacy.EventID, originKind, originID, originPort, *stageboxID, toPort, nullInt64(legacy.CableItemID)); err != nil {
			return fmt.Errorf("insert cable into stagebox: %w", err)
		}
		if _, err := tx.Exec(`INSERT INTO input_cables (event_id, from_kind, from_id, from_port, to_kind, to_id, to_port, cable_item_id) VALUES (?, 'stagebox', ?, ?, 'channel', ?, 0, NULL)`,
			legacy.EventID, *stageboxID, toPort, channelID); err != nil {
			return fmt.Errorf("insert cableless stagebox-to-channel hop: %w", err)
		}
	case stageMultiID != nil:
		toPort := derefIntOrZero(stageMultiChannel) - 1
		if _, err := tx.Exec(`INSERT INTO input_cables (event_id, from_kind, from_id, from_port, to_kind, to_id, to_port, cable_item_id) VALUES (?, ?, ?, ?, 'stage_multi', ?, ?, ?)`,
			legacy.EventID, originKind, originID, originPort, *stageMultiID, toPort, nullInt64(legacy.CableItemID)); err != nil {
			return fmt.Errorf("insert cable into stage multi: %w", err)
		}
		if _, err := tx.Exec(`INSERT INTO input_cables (event_id, from_kind, from_id, from_port, to_kind, to_id, to_port, cable_item_id) VALUES (?, 'stage_multi', ?, ?, 'channel', ?, 0, NULL)`,
			legacy.EventID, *stageMultiID, toPort, channelID); err != nil {
			return fmt.Errorf("insert cableless stage-multi-to-channel hop: %w", err)
		}
	default:
		if _, err := tx.Exec(`INSERT INTO input_cables (event_id, from_kind, from_id, from_port, to_kind, to_id, to_port, cable_item_id) VALUES (?, ?, ?, ?, 'channel', ?, 0, ?)`,
			legacy.EventID, originKind, originID, originPort, channelID, nullInt64(legacy.CableItemID)); err != nil {
			return fmt.Errorf("insert direct cable to channel: %w", err)
		}
	}
	return nil
}

// channelNumberExists reports whether some input_channels row already
// claims channelNumber for eventID — used only to detect a stereo legacy
// row's side B already existing as its own separate row (see
// convertOneLegacyInputChannel).
func channelNumberExists(tx *sql.Tx, eventID int64, channelNumber int) (bool, error) {
	var count int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM input_channels WHERE event_id = ? AND channel_number = ?`, eventID, channelNumber).Scan(&count); err != nil {
		return false, fmt.Errorf("check channel number exists: %w", err)
	}
	return count > 0, nil
}

// inputToPortTaken reports whether a to-port already carries a cable —
// used only to detect a legacy row's routing colliding with another row's
// already-converted jack (see convertLegacyChannelSide); the live API's
// own uniqueness check (validInputCable) is the authoritative guard for
// everything created after this one-time conversion runs.
func inputToPortTaken(tx *sql.Tx, toKind string, toID int64, toPort int) (bool, error) {
	var count int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM input_cables WHERE to_kind = ? AND to_id = ? AND to_port = ?`, toKind, toID, toPort).Scan(&count); err != nil {
		return false, fmt.Errorf("check input cable to-port: %w", err)
	}
	return count > 0, nil
}

// createMigratedDIDevice creates the shared DI-box device for a legacy DI
// row — 1 in/1 out for mono, 2 in/2 out for stereo (one physical stereo
// DI unit, not two mono ones). inventoryItemID is the row's mic_item_id,
// which for a "di" signal_type actually holds the DI box's catalog item
// (rental.go's overloaded-column note).
func createMigratedDIDevice(tx *sql.Tx, eventID int64, inventoryItemID *int64, ports int) (int64, error) {
	result, err := tx.Exec(`INSERT INTO input_devices (event_id, name, inventory_item_id, input_port_count, input_connector_type, output_port_count, output_connector_type) VALUES (?, 'Migrated DI', ?, ?, 'jack_ts', ?, 'xlr')`,
		eventID, nullInt64(inventoryItemID), ports, ports)
	if err != nil {
		return 0, fmt.Errorf("create migrated DI device: %w", err)
	}
	return result.LastInsertId()
}

// createMigratedSideBChannel inserts side B's brand-new input_channels
// row (channel_number + 1, everything else copied from side A) and
// copies side A's group/DCA memberships onto it, since a fresh row starts
// with none.
func createMigratedSideBChannel(tx *sql.Tx, legacy legacyInputChannelRow, sideAChannelID int64) (int64, error) {
	var channelNumber int
	var channelName, color, notes, mixerBehavior string
	err := tx.QueryRow(`SELECT channel_number, COALESCE(channel_name, ''), COALESCE(color, ''), COALESCE(notes, ''), mixer_behavior FROM input_channels WHERE id = ?`, sideAChannelID).
		Scan(&channelNumber, &channelName, &color, &notes, &mixerBehavior)
	if err != nil {
		return 0, fmt.Errorf("load side A channel: %w", err)
	}

	result, err := tx.Exec(`INSERT INTO input_channels (event_id, channel_number, channel_name, color, width, mixer_behavior, notes) VALUES (?, ?, ?, ?, 'stereo', ?, ?)`,
		legacy.EventID, channelNumber+1, nullString(channelName), nullString(color), mixerBehavior, nullString(notes))
	if err != nil {
		return 0, fmt.Errorf("create side B channel: %w", err)
	}
	sideBChannelID, _ := result.LastInsertId()

	if _, err := tx.Exec(`INSERT INTO audio_input_groups (input_id, group_id) SELECT ?, group_id FROM audio_input_groups WHERE input_id = ?`, sideBChannelID, sideAChannelID); err != nil {
		return 0, fmt.Errorf("copy side B group memberships: %w", err)
	}
	if _, err := tx.Exec(`INSERT INTO audio_input_dcas (input_id, dca_id) SELECT ?, dca_id FROM audio_input_dcas WHERE input_id = ?`, sideBChannelID, sideAChannelID); err != nil {
		return 0, fmt.Errorf("copy side B DCA memberships: %w", err)
	}
	return sideBChannelID, nil
}

// logDroppedLegacyText reports any non-empty legacy free-text fallback
// (mic_label, cable_type/cable_length_m, mic_stand) that has no
// equivalent slot in the new Source/Cable model and is therefore not
// carried forward — same "never silently touch real data" discipline as
// the Slice 11 output-graph migration.
func logDroppedLegacyText(logger *slog.Logger, id int64, legacy legacyInputChannelRow) {
	if legacy.MicLabel != "" {
		logger.Warn("input graph migration: dropped legacy unlinked mic label text (no catalog mic was ever picked)", "channel_id", id, "mic_label", legacy.MicLabel)
	}
	if legacy.CableType != "" || legacy.CableLengthM != 0 {
		logger.Warn("input graph migration: dropped legacy unlinked cable type/length text (no catalog cable was ever picked)", "channel_id", id, "cable_type", legacy.CableType, "cable_length_m", legacy.CableLengthM)
	}
	if legacy.MicStand != "" {
		logger.Warn("input graph migration: dropped legacy unlinked mic stand text (no catalog stand was ever picked)", "channel_id", id, "mic_stand", legacy.MicStand)
	}
}

const legacyInputChannelColumns = `id, event_id, channel_number, width, COALESCE(signal_type, 'mic'), COALESCE(preamp_connector, 'xlr'), stagebox_id, stagebox_channel, stage_multi_id, stage_multi_channel, mic_item_id, COALESCE(mic_model, ''), cable_item_id, stand_item_id, COALESCE(cable_type, ''), COALESCE(cable_length_m, 0), COALESCE(mic_stand, ''), COALESCE(phantom_power, 0), stagebox_id_b, stagebox_channel_b, stage_multi_id_b, stage_multi_channel_b, source_cable_item_id, source_cabling`

// loadLegacyInputChannelRow scans one input_channels row's not-yet-dropped
// legacy columns — self-contained here rather than reusing anything from
// audio_patch.go, since this whole file is migration-only code that
// should be easy to delete in a later cleanup pass once every real
// database has converted (mirrors output_graph_migration.go's own note).
func loadLegacyInputChannelRow(db *sql.DB, id int64) (legacyInputChannelRow, error) {
	row := db.QueryRow(`SELECT `+legacyInputChannelColumns+` FROM input_channels WHERE id = ?`, id)
	var legacy legacyInputChannelRow
	var stageboxID, stageboxChannel, stageMultiID, stageMultiChannel, micItemID, cableItemID, standItemID sql.NullInt64
	var stageboxIDB, stageboxChannelB, stageMultiIDB, stageMultiChannelB, sourceCableItemID sql.NullInt64
	var phantom int
	if err := row.Scan(&legacy.ID, &legacy.EventID, &legacy.ChannelNumber, &legacy.Width, &legacy.SignalType, &legacy.PreampConnector,
		&stageboxID, &stageboxChannel, &stageMultiID, &stageMultiChannel,
		&micItemID, &legacy.MicLabel, &cableItemID, &standItemID, &legacy.CableType, &legacy.CableLengthM, &legacy.MicStand, &phantom,
		&stageboxIDB, &stageboxChannelB, &stageMultiIDB, &stageMultiChannelB, &sourceCableItemID, &legacy.SourceCabling); err != nil {
		return legacyInputChannelRow{}, fmt.Errorf("scan legacy input channel: %w", err)
	}
	legacy.StageboxID = int64PtrFromNull(stageboxID)
	legacy.StageboxChannel = intPtrFromNull(stageboxChannel)
	legacy.StageMultiID = int64PtrFromNull(stageMultiID)
	legacy.StageMultiChannel = intPtrFromNull(stageMultiChannel)
	legacy.MicItemID = int64PtrFromNull(micItemID)
	legacy.CableItemID = int64PtrFromNull(cableItemID)
	legacy.StandItemID = int64PtrFromNull(standItemID)
	legacy.StageboxIDB = int64PtrFromNull(stageboxIDB)
	legacy.StageboxChannelB = intPtrFromNull(stageboxChannelB)
	legacy.StageMultiIDB = int64PtrFromNull(stageMultiIDB)
	legacy.StageMultiChannelB = intPtrFromNull(stageMultiChannelB)
	legacy.SourceCableItemID = int64PtrFromNull(sourceCableItemID)
	legacy.PhantomPower = phantom == 1
	return legacy, nil
}
