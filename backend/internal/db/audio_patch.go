package db

import (
	"database/sql"
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
)

func ListStageboxes(db *sql.DB, eventID int64) ([]domain.Stagebox, error) {
	rows, err := db.Query(`SELECT id, event_id, name, COALESCE(model, ''), COALESCE(input_count, 0), COALESCE(output_count, 0), COALESCE(connection_type, 'analog'), inventory_item_id FROM stageboxes WHERE event_id = ? ORDER BY id ASC`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list stageboxes: %w", err)
	}
	defer rows.Close()
	items := make([]domain.Stagebox, 0)
	for rows.Next() {
		var item domain.Stagebox
		var invID sql.NullInt64
		if err := rows.Scan(&item.ID, &item.EventID, &item.Name, &item.Model, &item.InputCount, &item.OutputCount, &item.ConnectionType, &invID); err != nil {
			return nil, fmt.Errorf("scan stagebox: %w", err)
		}
		if invID.Valid {
			v := invID.Int64
			item.InventoryItemID = &v
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func GetStagebox(db *sql.DB, id int64) (domain.Stagebox, error) {
	row := db.QueryRow(`SELECT id, event_id, name, COALESCE(model, ''), COALESCE(input_count, 0), COALESCE(output_count, 0), COALESCE(connection_type, 'analog'), inventory_item_id FROM stageboxes WHERE id = ?`, id)
	var item domain.Stagebox
	var invID sql.NullInt64
	if err := row.Scan(&item.ID, &item.EventID, &item.Name, &item.Model, &item.InputCount, &item.OutputCount, &item.ConnectionType, &invID); err != nil {
		return domain.Stagebox{}, fmt.Errorf("get stagebox: %w", err)
	}
	if invID.Valid {
		v := invID.Int64
		item.InventoryItemID = &v
	}
	return item, nil
}

func CreateStagebox(db *sql.DB, sb domain.Stagebox) (domain.Stagebox, error) {
	result, err := db.Exec(`INSERT INTO stageboxes (event_id, name, model, input_count, output_count, connection_type, inventory_item_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		sb.EventID, sb.Name, nullString(sb.Model), sb.InputCount, sb.OutputCount, sb.ConnectionType, nullInt64(sb.InventoryItemID))
	if err != nil {
		return domain.Stagebox{}, fmt.Errorf("create stagebox: %w", err)
	}
	id, _ := result.LastInsertId()
	return GetStagebox(db, id)
}

func UpdateStagebox(db *sql.DB, id int64, sb domain.Stagebox) (domain.Stagebox, error) {
	_, err := db.Exec(`UPDATE stageboxes SET name = ?, model = ?, input_count = ?, output_count = ?, connection_type = ?, inventory_item_id = ? WHERE id = ?`,
		sb.Name, nullString(sb.Model), sb.InputCount, sb.OutputCount, sb.ConnectionType, nullInt64(sb.InventoryItemID), id)
	if err != nil {
		return domain.Stagebox{}, fmt.Errorf("update stagebox: %w", err)
	}
	return GetStagebox(db, id)
}

// DeleteStagebox clears every patch-row/cable reference to the stagebox
// before removing it, so the patch stays consistent and the FK constraint
// holds. A stagebox is output-only in the output signal-flow graph (it
// can only ever be a from_kind — FR-004), so only from-side output_cables
// rows need clearing there; audio_patch_inputs still has its own direct
// stagebox_id column (input-side patching, unrelated to this graph).
func DeleteStagebox(db *sql.DB, id int64) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("delete stagebox: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE audio_patch_inputs SET stagebox_id = NULL, stagebox_channel = NULL WHERE stagebox_id = ?`, id); err != nil {
		return fmt.Errorf("clear stagebox references: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM output_cables WHERE from_kind = 'stagebox' AND from_id = ?`, id); err != nil {
		return fmt.Errorf("clear output cable stagebox references: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM stageboxes WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete stagebox: %w", err)
	}
	return tx.Commit()
}

func ListStageMultis(db *sql.DB, eventID int64) ([]domain.StageMulti, error) {
	rows, err := db.Query(`SELECT id, event_id, name, COALESCE(length_m, 0), COALESCE(channels, 24), COALESCE(connector_type, 'xlr'), inventory_item_id FROM stage_multis WHERE event_id = ? ORDER BY id ASC`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list stage multis: %w", err)
	}
	defer rows.Close()
	items := make([]domain.StageMulti, 0)
	for rows.Next() {
		var item domain.StageMulti
		var invID sql.NullInt64
		if err := rows.Scan(&item.ID, &item.EventID, &item.Name, &item.LengthM, &item.Channels, &item.ConnectorType, &invID); err != nil {
			return nil, fmt.Errorf("scan stage multi: %w", err)
		}
		if invID.Valid {
			v := invID.Int64
			item.InventoryItemID = &v
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func GetStageMulti(db *sql.DB, id int64) (domain.StageMulti, error) {
	row := db.QueryRow(`SELECT id, event_id, name, COALESCE(length_m, 0), COALESCE(channels, 24), COALESCE(connector_type, 'xlr'), inventory_item_id FROM stage_multis WHERE id = ?`, id)
	var item domain.StageMulti
	var invID sql.NullInt64
	if err := row.Scan(&item.ID, &item.EventID, &item.Name, &item.LengthM, &item.Channels, &item.ConnectorType, &invID); err != nil {
		return domain.StageMulti{}, fmt.Errorf("get stage multi: %w", err)
	}
	if invID.Valid {
		v := invID.Int64
		item.InventoryItemID = &v
	}
	return item, nil
}

func CreateStageMulti(db *sql.DB, sm domain.StageMulti) (domain.StageMulti, error) {
	result, err := db.Exec(`INSERT INTO stage_multis (event_id, name, length_m, channels, connector_type, inventory_item_id) VALUES (?, ?, ?, ?, ?, ?)`,
		sm.EventID, sm.Name, sm.LengthM, sm.Channels, sm.ConnectorType, nullInt64(sm.InventoryItemID))
	if err != nil {
		return domain.StageMulti{}, fmt.Errorf("create stage multi: %w", err)
	}
	id, _ := result.LastInsertId()
	return GetStageMulti(db, id)
}

func UpdateStageMulti(db *sql.DB, id int64, sm domain.StageMulti) (domain.StageMulti, error) {
	_, err := db.Exec(`UPDATE stage_multis SET name = ?, length_m = ?, channels = ?, connector_type = ?, inventory_item_id = ? WHERE id = ?`,
		sm.Name, sm.LengthM, sm.Channels, sm.ConnectorType, nullInt64(sm.InventoryItemID), id)
	if err != nil {
		return domain.StageMulti{}, fmt.Errorf("update stage multi: %w", err)
	}
	return GetStageMulti(db, id)
}

// DeleteStageMulti clears every patch-row/cable reference to the
// multicore before removing it, so the patch stays consistent and the FK
// constraint holds. A stage multi is a full processing node in the output
// signal-flow graph (both a from_kind and a to_kind — FR-005), so both
// sides' output_cables rows need clearing; audio_patch_inputs still has
// its own direct stage_multi_id column (input-side patching, unrelated to
// this graph).
func DeleteStageMulti(db *sql.DB, id int64) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("delete stage multi: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE audio_patch_inputs SET stage_multi_id = NULL, stage_multi_channel = NULL WHERE stage_multi_id = ?`, id); err != nil {
		return fmt.Errorf("clear stage multi references: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM output_cables WHERE (from_kind = 'stage_multi' AND from_id = ?) OR (to_kind = 'stage_multi' AND to_id = ?)`, id, id); err != nil {
		return fmt.Errorf("clear output cable stage multi references: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM stage_multis WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete stage multi: %w", err)
	}
	return tx.Commit()
}

const audioInputColumns = `id, event_id, channel_number, COALESCE(channel_name, ''), COALESCE(signal_type, 'mic'), COALESCE(preamp_connector, 'xlr'), stagebox_id, stagebox_channel, stage_multi_id, stage_multi_channel, mic_item_id, COALESCE(mic_model, ''), cable_item_id, stand_item_id, COALESCE(cable_type, ''), COALESCE(cable_length_m, 0), COALESCE(mic_stand, ''), COALESCE(phantom_power, 0), COALESCE(color, ''), width, mixer_behavior, stagebox_id_b, stagebox_channel_b, stage_multi_id_b, stage_multi_channel_b, source_cable_item_id, source_cabling, COALESCE(notes, '')`

func ListAudioPatchInputs(db *sql.DB, eventID int64) ([]domain.AudioPatchInput, error) {
	rows, err := db.Query(`SELECT `+audioInputColumns+` FROM audio_patch_inputs WHERE event_id = ? ORDER BY channel_number ASC, id ASC`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list audio inputs: %w", err)
	}
	defer rows.Close()
	items := make([]domain.AudioPatchInput, 0)
	for rows.Next() {
		item, err := scanAudioInput(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	groupsByInput, err := loadInputGroupIDs(db, eventID)
	if err != nil {
		return nil, err
	}
	dcasByInput, err := loadInputDCAIDs(db, eventID)
	if err != nil {
		return nil, err
	}
	for i := range items {
		items[i].GroupIDs = nonNilIDs(groupsByInput[items[i].ID])
		items[i].DCAIDs = nonNilIDs(dcasByInput[items[i].ID])
	}
	return items, nil
}

func GetAudioPatchInput(db *sql.DB, id int64) (domain.AudioPatchInput, error) {
	row := db.QueryRow(`SELECT `+audioInputColumns+` FROM audio_patch_inputs WHERE id = ?`, id)
	input, err := scanAudioInput(row)
	if err != nil {
		return domain.AudioPatchInput{}, err
	}
	if input.GroupIDs, err = listOneInputBusIDs(db, `SELECT group_id FROM audio_input_groups WHERE input_id = ? ORDER BY group_id`, id); err != nil {
		return domain.AudioPatchInput{}, err
	}
	if input.DCAIDs, err = listOneInputBusIDs(db, `SELECT dca_id FROM audio_input_dcas WHERE input_id = ? ORDER BY dca_id`, id); err != nil {
		return domain.AudioPatchInput{}, err
	}
	return input, nil
}

func CreateAudioPatchInput(db *sql.DB, input domain.AudioPatchInput) (domain.AudioPatchInput, error) {
	tx, err := db.Begin()
	if err != nil {
		return domain.AudioPatchInput{}, fmt.Errorf("create audio input: %w", err)
	}
	defer tx.Rollback()

	// Legacy fields (mic_model, cable_type, cable_length_m, mic_stand) are
	// intentionally NULLed for new rows — cable_type carries a pre-019
	// column DEFAULT that must not leak into catalog-driven rows.
	result, err := tx.Exec(`INSERT INTO audio_patch_inputs (event_id, channel_number, channel_name, signal_type, preamp_connector, stagebox_id, stagebox_channel, stage_multi_id, stage_multi_channel, mic_item_id, cable_item_id, stand_item_id, cable_type, cable_length_m, mic_stand, phantom_power, color, width, mixer_behavior, stagebox_id_b, stagebox_channel_b, stage_multi_id_b, stage_multi_channel_b, source_cable_item_id, source_cabling, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, input.EventID, input.ChannelNumber, nullString(input.ChannelName), input.SignalType, input.PreampConnector, nullInt64(input.StageboxID), nullInt(input.StageboxChannel), nullInt64(input.StageMultiID), nullInt(input.StageMultiChannel), nullInt64(input.MicItemID), nullInt64(input.CableItemID), nullInt64(input.StandItemID), boolToInt(input.PhantomPower), nullString(input.Color), input.Width, input.MixerBehavior, nullInt64(input.StageboxIDB), nullInt(input.StageboxChannelB), nullInt64(input.StageMultiIDB), nullInt(input.StageMultiChannelB), nullInt64(input.SourceCableItemID), input.SourceCabling, nullString(input.Notes))
	if err != nil {
		return domain.AudioPatchInput{}, fmt.Errorf("create audio input: %w", err)
	}
	id, _ := result.LastInsertId()

	// Nil GroupIDs means the payload had no opinion: new channels default to
	// the event's built-in LR group. An explicit array (even empty) is kept.
	groupIDs := input.GroupIDs
	if groupIDs == nil {
		lr, err := lrGroupID(tx, input.EventID)
		if err != nil {
			return domain.AudioPatchInput{}, err
		}
		groupIDs = []int64{lr}
	}
	if err := replaceInputGroups(tx, id, groupIDs); err != nil {
		return domain.AudioPatchInput{}, err
	}
	if err := replaceInputDCAs(tx, id, input.DCAIDs); err != nil {
		return domain.AudioPatchInput{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.AudioPatchInput{}, fmt.Errorf("create audio input: %w", err)
	}
	return GetAudioPatchInput(db, id)
}

func UpdateAudioPatchInput(db *sql.DB, id int64, input domain.AudioPatchInput) (domain.AudioPatchInput, error) {
	tx, err := db.Begin()
	if err != nil {
		return domain.AudioPatchInput{}, fmt.Errorf("update audio input: %w", err)
	}
	defer tx.Rollback()

	// Legacy values (mic_model, cable_type + cable_length_m, mic_stand) are
	// preserved as-is until the row gets the corresponding catalog
	// reference, at which point they are cleared for good.
	_, err = tx.Exec(`UPDATE audio_patch_inputs SET channel_number = ?, channel_name = ?, signal_type = ?, preamp_connector = ?, stagebox_id = ?, stagebox_channel = ?, stage_multi_id = ?, stage_multi_channel = ?, mic_item_id = ?, mic_model = CASE WHEN ? IS NOT NULL THEN NULL ELSE mic_model END, cable_item_id = ?, cable_type = CASE WHEN ? IS NOT NULL THEN NULL ELSE cable_type END, cable_length_m = CASE WHEN ? IS NOT NULL THEN NULL ELSE cable_length_m END, stand_item_id = ?, mic_stand = CASE WHEN ? IS NOT NULL THEN NULL ELSE mic_stand END, phantom_power = ?, color = ?, width = ?, mixer_behavior = ?, stagebox_id_b = ?, stagebox_channel_b = ?, stage_multi_id_b = ?, stage_multi_channel_b = ?, source_cable_item_id = ?, source_cabling = ?, notes = ? WHERE id = ?`, input.ChannelNumber, nullString(input.ChannelName), input.SignalType, input.PreampConnector, nullInt64(input.StageboxID), nullInt(input.StageboxChannel), nullInt64(input.StageMultiID), nullInt(input.StageMultiChannel), nullInt64(input.MicItemID), nullInt64(input.MicItemID), nullInt64(input.CableItemID), nullInt64(input.CableItemID), nullInt64(input.CableItemID), nullInt64(input.StandItemID), nullInt64(input.StandItemID), boolToInt(input.PhantomPower), nullString(input.Color), input.Width, input.MixerBehavior, nullInt64(input.StageboxIDB), nullInt(input.StageboxChannelB), nullInt64(input.StageMultiIDB), nullInt(input.StageMultiChannelB), nullInt64(input.SourceCableItemID), input.SourceCabling, nullString(input.Notes), id)
	if err != nil {
		return domain.AudioPatchInput{}, fmt.Errorf("update audio input: %w", err)
	}
	// Updates replace the membership sets wholesale (nil clears too — the
	// row's full state travels with every PATCH, like all other fields).
	if err := replaceInputGroups(tx, id, input.GroupIDs); err != nil {
		return domain.AudioPatchInput{}, err
	}
	if err := replaceInputDCAs(tx, id, input.DCAIDs); err != nil {
		return domain.AudioPatchInput{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.AudioPatchInput{}, fmt.Errorf("update audio input: %w", err)
	}
	return GetAudioPatchInput(db, id)
}

func DeleteAudioPatchInput(db *sql.DB, id int64) error {
	_, err := db.Exec(`DELETE FROM audio_patch_inputs WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete audio input: %w", err)
	}
	return nil
}

const audioOutputColumns = `id, event_id, output_number, COALESCE(output_name, ''), COALESCE(output_type, 'foh'), COALESCE(color, ''), width, COALESCE(notes, '')`

func ListAudioPatchOutputs(db *sql.DB, eventID int64) ([]domain.AudioPatchOutput, error) {
	rows, err := db.Query(`SELECT `+audioOutputColumns+` FROM audio_patch_outputs WHERE event_id = ? ORDER BY output_number ASC, id ASC`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list audio outputs: %w", err)
	}
	defer rows.Close()
	items := make([]domain.AudioPatchOutput, 0)
	for rows.Next() {
		item, err := scanAudioOutput(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func GetAudioPatchOutput(db *sql.DB, id int64) (domain.AudioPatchOutput, error) {
	row := db.QueryRow(`SELECT `+audioOutputColumns+` FROM audio_patch_outputs WHERE id = ?`, id)
	return scanAudioOutput(row)
}

func CreateAudioPatchOutput(db *sql.DB, output domain.AudioPatchOutput) (domain.AudioPatchOutput, error) {
	result, err := db.Exec(`INSERT INTO audio_patch_outputs (event_id, output_number, output_name, output_type, color, width, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		output.EventID, output.OutputNumber, nullString(output.OutputName), output.OutputType, nullString(output.Color), output.Width, nullString(output.Notes))
	if err != nil {
		return domain.AudioPatchOutput{}, fmt.Errorf("create audio output: %w", err)
	}
	id, _ := result.LastInsertId()
	return GetAudioPatchOutput(db, id)
}

func UpdateAudioPatchOutput(db *sql.DB, id int64, output domain.AudioPatchOutput) (domain.AudioPatchOutput, error) {
	_, err := db.Exec(`UPDATE audio_patch_outputs SET output_number = ?, output_name = ?, output_type = ?, color = ?, width = ?, notes = ? WHERE id = ?`,
		output.OutputNumber, nullString(output.OutputName), output.OutputType, nullString(output.Color), output.Width, nullString(output.Notes), id)
	if err != nil {
		return domain.AudioPatchOutput{}, fmt.Errorf("update audio output: %w", err)
	}
	return GetAudioPatchOutput(db, id)
}

func DeleteAudioPatchOutput(db *sql.DB, id int64) error {
	_, err := db.Exec(`DELETE FROM audio_patch_outputs WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete audio output: %w", err)
	}
	return nil
}

const outputDeviceColumns = `id, event_id, name, inventory_item_id, owned_item_id, input_port_count, COALESCE(input_connector_type, ''), output_port_count, COALESCE(output_connector_type, ''), position_x, position_y`

func ListOutputDevices(db *sql.DB, eventID int64) ([]domain.OutputDevice, error) {
	rows, err := db.Query(`SELECT `+outputDeviceColumns+` FROM output_devices WHERE event_id = ? ORDER BY id ASC`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list output devices: %w", err)
	}
	defer rows.Close()
	items := make([]domain.OutputDevice, 0)
	for rows.Next() {
		item, err := scanOutputDevice(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func GetOutputDevice(db *sql.DB, id int64) (domain.OutputDevice, error) {
	row := db.QueryRow(`SELECT `+outputDeviceColumns+` FROM output_devices WHERE id = ?`, id)
	return scanOutputDevice(row)
}

func CreateOutputDevice(db *sql.DB, device domain.OutputDevice) (domain.OutputDevice, error) {
	result, err := db.Exec(`INSERT INTO output_devices (event_id, name, inventory_item_id, owned_item_id, input_port_count, input_connector_type, output_port_count, output_connector_type, position_x, position_y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		device.EventID, device.Name, nullInt64(device.InventoryItemID), nullInt64(device.OwnedItemID),
		device.InputPortCount, nullString(device.InputConnectorType), device.OutputPortCount, nullString(device.OutputConnectorType),
		device.PositionX, device.PositionY)
	if err != nil {
		return domain.OutputDevice{}, fmt.Errorf("create output device: %w", err)
	}
	id, _ := result.LastInsertId()
	return GetOutputDevice(db, id)
}

func UpdateOutputDevice(db *sql.DB, id int64, device domain.OutputDevice) (domain.OutputDevice, error) {
	_, err := db.Exec(`UPDATE output_devices SET name = ?, inventory_item_id = ?, owned_item_id = ?, input_port_count = ?, input_connector_type = ?, output_port_count = ?, output_connector_type = ?, position_x = ?, position_y = ? WHERE id = ?`,
		device.Name, nullInt64(device.InventoryItemID), nullInt64(device.OwnedItemID),
		device.InputPortCount, nullString(device.InputConnectorType), device.OutputPortCount, nullString(device.OutputConnectorType),
		device.PositionX, device.PositionY, id)
	if err != nil {
		return domain.OutputDevice{}, fmt.Errorf("update output device: %w", err)
	}
	return GetOutputDevice(db, id)
}

// DeleteOutputDevice deletes every output_cables row referencing this
// device as either end before removing the device itself — never
// blocks, matching how deleting a stagebox/stage-multi already clears the
// cables that referenced it (research.md R4, carried forward from Slice
// 10's identical rule for the old hop-based model).
func DeleteOutputDevice(db *sql.DB, id int64) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("delete output device: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM output_cables WHERE (from_kind = 'device' AND from_id = ?) OR (to_kind = 'device' AND to_id = ?)`, id, id); err != nil {
		return fmt.Errorf("clear output device cables: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM output_devices WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete output device: %w", err)
	}
	return tx.Commit()
}

func scanOutputDevice(row scanner) (domain.OutputDevice, error) {
	var item domain.OutputDevice
	var invID, ownedID sql.NullInt64
	if err := row.Scan(&item.ID, &item.EventID, &item.Name, &invID, &ownedID,
		&item.InputPortCount, &item.InputConnectorType, &item.OutputPortCount, &item.OutputConnectorType,
		&item.PositionX, &item.PositionY); err != nil {
		return domain.OutputDevice{}, fmt.Errorf("scan output device: %w", err)
	}
	item.InventoryItemID = int64PtrFromNull(invID)
	item.OwnedItemID = int64PtrFromNull(ownedID)
	return item, nil
}

const outputCableColumns = `id, event_id, from_kind, from_id, from_port, to_kind, to_id, to_port, cable_item_id`

func ListOutputCables(db *sql.DB, eventID int64) ([]domain.OutputCable, error) {
	rows, err := db.Query(`SELECT `+outputCableColumns+` FROM output_cables WHERE event_id = ? ORDER BY id ASC`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list output cables: %w", err)
	}
	defer rows.Close()
	items := make([]domain.OutputCable, 0)
	for rows.Next() {
		item, err := scanOutputCable(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func GetOutputCable(db *sql.DB, id int64) (domain.OutputCable, error) {
	row := db.QueryRow(`SELECT `+outputCableColumns+` FROM output_cables WHERE id = ?`, id)
	return scanOutputCable(row)
}

func CreateOutputCable(db *sql.DB, cable domain.OutputCable) (domain.OutputCable, error) {
	result, err := db.Exec(`INSERT INTO output_cables (event_id, from_kind, from_id, from_port, to_kind, to_id, to_port, cable_item_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		cable.EventID, cable.FromKind, cable.FromID, cable.FromPort, cable.ToKind, cable.ToID, cable.ToPort, nullInt64(cable.CableItemID))
	if err != nil {
		return domain.OutputCable{}, fmt.Errorf("create output cable: %w", err)
	}
	id, _ := result.LastInsertId()
	return GetOutputCable(db, id)
}

// UpdateOutputCable only ever changes the catalog cable pick — moving a
// cable to different ports is delete + create (contracts/output-graph-
// api.md), since ports are 1:1 and there's nothing meaningful to "move"
// partially.
func UpdateOutputCable(db *sql.DB, id int64, cableItemID *int64) (domain.OutputCable, error) {
	_, err := db.Exec(`UPDATE output_cables SET cable_item_id = ? WHERE id = ?`, nullInt64(cableItemID), id)
	if err != nil {
		return domain.OutputCable{}, fmt.Errorf("update output cable: %w", err)
	}
	return GetOutputCable(db, id)
}

func DeleteOutputCable(db *sql.DB, id int64) error {
	_, err := db.Exec(`DELETE FROM output_cables WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete output cable: %w", err)
	}
	return nil
}

func scanOutputCable(row scanner) (domain.OutputCable, error) {
	var item domain.OutputCable
	var cableItemID sql.NullInt64
	if err := row.Scan(&item.ID, &item.EventID, &item.FromKind, &item.FromID, &item.FromPort, &item.ToKind, &item.ToID, &item.ToPort, &cableItemID); err != nil {
		return domain.OutputCable{}, fmt.Errorf("scan output cable: %w", err)
	}
	item.CableItemID = int64PtrFromNull(cableItemID)
	return item, nil
}

// MixerPortCount is the number of ports an output channel's mixer node
// contributes to the graph — 1, or 2 independent ports when stereo
// (data-model.md's derived mixer ports).
func MixerPortCount(width string) int {
	if width == "stereo" {
		return 2
	}
	return 1
}

// StageboxOutputPortCount returns a stagebox's live output port count.
// This and the two functions below back the API layer's port-bounds
// validation (research.md R2/R7 — no DB FK/CHECK can enforce a
// polymorphic port index, so every cable write is validated in Go
// against whichever node's live count it resolves to).
func StageboxOutputPortCount(db *sql.DB, id int64) (int, error) {
	var count int
	err := db.QueryRow(`SELECT COALESCE(output_count, 0) FROM stageboxes WHERE id = ?`, id).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("stagebox output port count: %w", err)
	}
	return count, nil
}

// StageMultiChannelCount returns a stage multi's live channel count,
// which is also its live port count on each side.
func StageMultiChannelCount(db *sql.DB, id int64) (int, error) {
	var count int
	err := db.QueryRow(`SELECT COALESCE(channels, 0) FROM stage_multis WHERE id = ?`, id).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("stage multi channel count: %w", err)
	}
	return count, nil
}

// OutputDevicePortCounts returns a device's live input/output port counts.
func OutputDevicePortCounts(db *sql.DB, id int64) (inputCount, outputCount int, err error) {
	err = db.QueryRow(`SELECT input_port_count, output_port_count FROM output_devices WHERE id = ?`, id).Scan(&inputCount, &outputCount)
	if err != nil {
		return 0, 0, fmt.Errorf("output device port counts: %w", err)
	}
	return inputCount, outputCount, nil
}

func MixerOutputWidth(db *sql.DB, id int64) (string, error) {
	var width string
	err := db.QueryRow(`SELECT width FROM audio_patch_outputs WHERE id = ?`, id).Scan(&width)
	if err != nil {
		return "", fmt.Errorf("mixer output width: %w", err)
	}
	return width, nil
}

type scanner interface {
	Scan(dest ...any) error
}

// listOneInputBusIDs collects one input's membership ids from a join table.
func listOneInputBusIDs(db *sql.DB, query string, inputID int64) ([]int64, error) {
	rows, err := db.Query(query, inputID)
	if err != nil {
		return nil, fmt.Errorf("list input bus ids: %w", err)
	}
	defer rows.Close()
	ids := make([]int64, 0)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan input bus id: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// nonNilIDs keeps JSON responses at [] instead of null for empty sets.
func nonNilIDs(ids []int64) []int64 {
	if ids == nil {
		return []int64{}
	}
	return ids
}

func scanAudioInput(row scanner) (domain.AudioPatchInput, error) {
	var item domain.AudioPatchInput
	var stageboxID, stageboxChannel, stageMultiID, stageMultiChannel, micItemID, cableItemID, standItemID sql.NullInt64
	var stageboxIDB, stageboxChannelB, stageMultiIDB, stageMultiChannelB, sourceCableItemID sql.NullInt64
	var cableLength sql.NullFloat64
	var phantom int
	if err := row.Scan(&item.ID, &item.EventID, &item.ChannelNumber, &item.ChannelName, &item.SignalType, &item.PreampConnector, &stageboxID, &stageboxChannel, &stageMultiID, &stageMultiChannel, &micItemID, &item.MicLabel, &cableItemID, &standItemID, &item.CableType, &cableLength, &item.MicStand, &phantom, &item.Color, &item.Width, &item.MixerBehavior, &stageboxIDB, &stageboxChannelB, &stageMultiIDB, &stageMultiChannelB, &sourceCableItemID, &item.SourceCabling, &item.Notes); err != nil {
		return domain.AudioPatchInput{}, fmt.Errorf("scan audio input: %w", err)
	}
	if micItemID.Valid {
		v := micItemID.Int64
		item.MicItemID = &v
	}
	if cableItemID.Valid {
		v := cableItemID.Int64
		item.CableItemID = &v
	}
	if standItemID.Valid {
		v := standItemID.Int64
		item.StandItemID = &v
	}
	if stageboxID.Valid {
		v := stageboxID.Int64
		item.StageboxID = &v
	}
	if stageboxChannel.Valid {
		v := int(stageboxChannel.Int64)
		item.StageboxChannel = &v
	}
	if stageMultiID.Valid {
		v := stageMultiID.Int64
		item.StageMultiID = &v
	}
	if stageMultiChannel.Valid {
		v := int(stageMultiChannel.Int64)
		item.StageMultiChannel = &v
	}
	if stageboxIDB.Valid {
		v := stageboxIDB.Int64
		item.StageboxIDB = &v
	}
	if stageboxChannelB.Valid {
		v := int(stageboxChannelB.Int64)
		item.StageboxChannelB = &v
	}
	if stageMultiIDB.Valid {
		v := stageMultiIDB.Int64
		item.StageMultiIDB = &v
	}
	if stageMultiChannelB.Valid {
		v := int(stageMultiChannelB.Int64)
		item.StageMultiChannelB = &v
	}
	if sourceCableItemID.Valid {
		v := sourceCableItemID.Int64
		item.SourceCableItemID = &v
	}
	if cableLength.Valid {
		item.CableLengthM = cableLength.Float64
	}
	item.PhantomPower = phantom == 1
	return item, nil
}

func scanAudioOutput(row scanner) (domain.AudioPatchOutput, error) {
	var item domain.AudioPatchOutput
	if err := row.Scan(&item.ID, &item.EventID, &item.OutputNumber, &item.OutputName, &item.OutputType, &item.Color, &item.Width, &item.Notes); err != nil {
		return domain.AudioPatchOutput{}, fmt.Errorf("scan audio output: %w", err)
	}
	return item, nil
}
