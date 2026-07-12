package db

import (
	"database/sql"
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
)

const stageboxColumns = `id, event_id, name, COALESCE(model, ''), COALESCE(input_count, 0), COALESCE(output_count, 0), COALESCE(connection_type, 'analog'), inventory_item_id, position_x, position_y, input_position_x, input_position_y`

func scanStagebox(row scanner) (domain.Stagebox, error) {
	var item domain.Stagebox
	var invID sql.NullInt64
	if err := row.Scan(&item.ID, &item.EventID, &item.Name, &item.Model, &item.InputCount, &item.OutputCount, &item.ConnectionType, &invID, &item.PositionX, &item.PositionY, &item.InputPositionX, &item.InputPositionY); err != nil {
		return domain.Stagebox{}, fmt.Errorf("scan stagebox: %w", err)
	}
	item.InventoryItemID = int64PtrFromNull(invID)
	return item, nil
}

func ListStageboxes(db *sql.DB, eventID int64) ([]domain.Stagebox, error) {
	rows, err := db.Query(`SELECT `+stageboxColumns+` FROM stageboxes WHERE event_id = ? ORDER BY id ASC`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list stageboxes: %w", err)
	}
	defer rows.Close()
	items := make([]domain.Stagebox, 0)
	for rows.Next() {
		item, err := scanStagebox(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func GetStagebox(db *sql.DB, id int64) (domain.Stagebox, error) {
	row := db.QueryRow(`SELECT `+stageboxColumns+` FROM stageboxes WHERE id = ?`, id)
	return scanStagebox(row)
}

func CreateStagebox(db *sql.DB, sb domain.Stagebox) (domain.Stagebox, error) {
	result, err := db.Exec(`INSERT INTO stageboxes (event_id, name, model, input_count, output_count, connection_type, inventory_item_id, position_x, position_y, input_position_x, input_position_y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		sb.EventID, sb.Name, nullString(sb.Model), sb.InputCount, sb.OutputCount, sb.ConnectionType, nullInt64(sb.InventoryItemID), sb.PositionX, sb.PositionY, sb.InputPositionX, sb.InputPositionY)
	if err != nil {
		return domain.Stagebox{}, fmt.Errorf("create stagebox: %w", err)
	}
	id, _ := result.LastInsertId()
	return GetStagebox(db, id)
}

func UpdateStagebox(db *sql.DB, id int64, sb domain.Stagebox) (domain.Stagebox, error) {
	_, err := db.Exec(`UPDATE stageboxes SET name = ?, model = ?, input_count = ?, output_count = ?, connection_type = ?, inventory_item_id = ?, position_x = ?, position_y = ?, input_position_x = ?, input_position_y = ? WHERE id = ?`,
		sb.Name, nullString(sb.Model), sb.InputCount, sb.OutputCount, sb.ConnectionType, nullInt64(sb.InventoryItemID), sb.PositionX, sb.PositionY, sb.InputPositionX, sb.InputPositionY, id)
	if err != nil {
		return domain.Stagebox{}, fmt.Errorf("update stagebox: %w", err)
	}
	return GetStagebox(db, id)
}

// DeleteStagebox clears every cable reference to the stagebox before
// removing it, so the patch stays consistent and the FK constraint holds.
// A stagebox is a full pass-through node on both the output signal-flow
// graph (Slice 11, output_cables) and the input signal-flow graph (Slice
// 12, input_cables) — each graph keeps its own independent cable set
// referencing the same shared stagebox row (data-model.md), so both
// tables need clearing on either side.
func DeleteStagebox(db *sql.DB, id int64) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("delete stagebox: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM output_cables WHERE (from_kind = 'stagebox' AND from_id = ?) OR (to_kind = 'stagebox' AND to_id = ?)`, id, id); err != nil {
		return fmt.Errorf("clear output cable stagebox references: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM input_cables WHERE (from_kind = 'stagebox' AND from_id = ?) OR (to_kind = 'stagebox' AND to_id = ?)`, id, id); err != nil {
		return fmt.Errorf("clear input cable stagebox references: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM stageboxes WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete stagebox: %w", err)
	}
	return tx.Commit()
}

const stageMultiColumns = `id, event_id, name, COALESCE(length_m, 0), COALESCE(channels, 24), COALESCE(connector_type, 'xlr'), inventory_item_id, position_x, position_y, input_position_x, input_position_y`

func scanStageMulti(row scanner) (domain.StageMulti, error) {
	var item domain.StageMulti
	var invID sql.NullInt64
	if err := row.Scan(&item.ID, &item.EventID, &item.Name, &item.LengthM, &item.Channels, &item.ConnectorType, &invID, &item.PositionX, &item.PositionY, &item.InputPositionX, &item.InputPositionY); err != nil {
		return domain.StageMulti{}, fmt.Errorf("scan stage multi: %w", err)
	}
	item.InventoryItemID = int64PtrFromNull(invID)
	return item, nil
}

func ListStageMultis(db *sql.DB, eventID int64) ([]domain.StageMulti, error) {
	rows, err := db.Query(`SELECT `+stageMultiColumns+` FROM stage_multis WHERE event_id = ? ORDER BY id ASC`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list stage multis: %w", err)
	}
	defer rows.Close()
	items := make([]domain.StageMulti, 0)
	for rows.Next() {
		item, err := scanStageMulti(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func GetStageMulti(db *sql.DB, id int64) (domain.StageMulti, error) {
	row := db.QueryRow(`SELECT `+stageMultiColumns+` FROM stage_multis WHERE id = ?`, id)
	return scanStageMulti(row)
}

func CreateStageMulti(db *sql.DB, sm domain.StageMulti) (domain.StageMulti, error) {
	result, err := db.Exec(`INSERT INTO stage_multis (event_id, name, length_m, channels, connector_type, inventory_item_id, position_x, position_y, input_position_x, input_position_y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		sm.EventID, sm.Name, sm.LengthM, sm.Channels, sm.ConnectorType, nullInt64(sm.InventoryItemID), sm.PositionX, sm.PositionY, sm.InputPositionX, sm.InputPositionY)
	if err != nil {
		return domain.StageMulti{}, fmt.Errorf("create stage multi: %w", err)
	}
	id, _ := result.LastInsertId()
	return GetStageMulti(db, id)
}

func UpdateStageMulti(db *sql.DB, id int64, sm domain.StageMulti) (domain.StageMulti, error) {
	_, err := db.Exec(`UPDATE stage_multis SET name = ?, length_m = ?, channels = ?, connector_type = ?, inventory_item_id = ?, position_x = ?, position_y = ?, input_position_x = ?, input_position_y = ? WHERE id = ?`,
		sm.Name, sm.LengthM, sm.Channels, sm.ConnectorType, nullInt64(sm.InventoryItemID), sm.PositionX, sm.PositionY, sm.InputPositionX, sm.InputPositionY, id)
	if err != nil {
		return domain.StageMulti{}, fmt.Errorf("update stage multi: %w", err)
	}
	return GetStageMulti(db, id)
}

// DeleteStageMulti clears every cable reference to the multicore before
// removing it — same reasoning as DeleteStagebox above: independent
// cable sets on the output graph (output_cables) and the input graph
// (input_cables) share this one stage-multi row.
func DeleteStageMulti(db *sql.DB, id int64) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("delete stage multi: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM output_cables WHERE (from_kind = 'stage_multi' AND from_id = ?) OR (to_kind = 'stage_multi' AND to_id = ?)`, id, id); err != nil {
		return fmt.Errorf("clear output cable stage multi references: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM input_cables WHERE (from_kind = 'stage_multi' AND from_id = ?) OR (to_kind = 'stage_multi' AND to_id = ?)`, id, id); err != nil {
		return fmt.Errorf("clear input cable stage multi references: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM stage_multis WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete stage multi: %w", err)
	}
	return tx.Commit()
}

const inputChannelColumns = `id, event_id, channel_number, COALESCE(channel_name, ''), COALESCE(color, ''), width, mixer_behavior, COALESCE(notes, '')`

func ListInputChannels(db *sql.DB, eventID int64) ([]domain.InputChannel, error) {
	rows, err := db.Query(`SELECT `+inputChannelColumns+` FROM input_channels WHERE event_id = ? ORDER BY channel_number ASC, id ASC`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list input channels: %w", err)
	}
	defer rows.Close()
	items := make([]domain.InputChannel, 0)
	for rows.Next() {
		item, err := scanInputChannel(rows)
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

func GetInputChannel(db *sql.DB, id int64) (domain.InputChannel, error) {
	row := db.QueryRow(`SELECT `+inputChannelColumns+` FROM input_channels WHERE id = ?`, id)
	channel, err := scanInputChannel(row)
	if err != nil {
		return domain.InputChannel{}, err
	}
	if channel.GroupIDs, err = listOneInputBusIDs(db, `SELECT group_id FROM audio_input_groups WHERE input_id = ? ORDER BY group_id`, id); err != nil {
		return domain.InputChannel{}, err
	}
	if channel.DCAIDs, err = listOneInputBusIDs(db, `SELECT dca_id FROM audio_input_dcas WHERE input_id = ? ORDER BY dca_id`, id); err != nil {
		return domain.InputChannel{}, err
	}
	return channel, nil
}

func CreateInputChannel(db *sql.DB, channel domain.InputChannel) (domain.InputChannel, error) {
	tx, err := db.Begin()
	if err != nil {
		return domain.InputChannel{}, fmt.Errorf("create input channel: %w", err)
	}
	defer tx.Rollback()

	result, err := tx.Exec(`INSERT INTO input_channels (event_id, channel_number, channel_name, color, width, mixer_behavior, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		channel.EventID, channel.ChannelNumber, nullString(channel.ChannelName), nullString(channel.Color), channel.Width, channel.MixerBehavior, nullString(channel.Notes))
	if err != nil {
		return domain.InputChannel{}, fmt.Errorf("create input channel: %w", err)
	}
	id, _ := result.LastInsertId()

	// Nil GroupIDs means the payload had no opinion: new channels default to
	// the event's built-in LR group. An explicit array (even empty) is kept.
	groupIDs := channel.GroupIDs
	if groupIDs == nil {
		lr, err := lrGroupID(tx, channel.EventID)
		if err != nil {
			return domain.InputChannel{}, err
		}
		groupIDs = []int64{lr}
	}
	if err := replaceInputGroups(tx, id, groupIDs); err != nil {
		return domain.InputChannel{}, err
	}
	if err := replaceInputDCAs(tx, id, channel.DCAIDs); err != nil {
		return domain.InputChannel{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.InputChannel{}, fmt.Errorf("create input channel: %w", err)
	}
	return GetInputChannel(db, id)
}

func UpdateInputChannel(db *sql.DB, id int64, channel domain.InputChannel) (domain.InputChannel, error) {
	tx, err := db.Begin()
	if err != nil {
		return domain.InputChannel{}, fmt.Errorf("update input channel: %w", err)
	}
	defer tx.Rollback()

	_, err = tx.Exec(`UPDATE input_channels SET channel_number = ?, channel_name = ?, color = ?, width = ?, mixer_behavior = ?, notes = ? WHERE id = ?`,
		channel.ChannelNumber, nullString(channel.ChannelName), nullString(channel.Color), channel.Width, channel.MixerBehavior, nullString(channel.Notes), id)
	if err != nil {
		return domain.InputChannel{}, fmt.Errorf("update input channel: %w", err)
	}
	// Updates replace the membership sets wholesale (nil clears too — the
	// row's full state travels with every PATCH, like all other fields).
	if err := replaceInputGroups(tx, id, channel.GroupIDs); err != nil {
		return domain.InputChannel{}, err
	}
	if err := replaceInputDCAs(tx, id, channel.DCAIDs); err != nil {
		return domain.InputChannel{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.InputChannel{}, fmt.Errorf("update input channel: %w", err)
	}
	return GetInputChannel(db, id)
}

// DeleteInputChannel deletes every input_cables row referencing this
// channel (as a to_kind target — a channel has no output side, so it can
// never be a from) before removing the channel itself — never blocks,
// confirmation happens client-side (FR-020).
func DeleteInputChannel(db *sql.DB, id int64) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("delete input channel: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM input_cables WHERE to_kind = 'channel' AND to_id = ?`, id); err != nil {
		return fmt.Errorf("clear input channel cables: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM input_channels WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete input channel: %w", err)
	}
	return tx.Commit()
}

func scanInputChannel(row scanner) (domain.InputChannel, error) {
	var item domain.InputChannel
	if err := row.Scan(&item.ID, &item.EventID, &item.ChannelNumber, &item.ChannelName, &item.Color, &item.Width, &item.MixerBehavior, &item.Notes); err != nil {
		return domain.InputChannel{}, fmt.Errorf("scan input channel: %w", err)
	}
	return item, nil
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

const outputDeviceColumns = `id, event_id, name, inventory_item_id, owned_item_id, input_port_count, COALESCE(input_connector_type, ''), output_port_count, COALESCE(output_connector_type, ''), link_port_count, COALESCE(link_connector_type, ''), position_x, position_y`

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
	result, err := db.Exec(`INSERT INTO output_devices (event_id, name, inventory_item_id, owned_item_id, input_port_count, input_connector_type, output_port_count, output_connector_type, link_port_count, link_connector_type, position_x, position_y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		device.EventID, device.Name, nullInt64(device.InventoryItemID), nullInt64(device.OwnedItemID),
		device.InputPortCount, nullString(device.InputConnectorType), device.OutputPortCount, nullString(device.OutputConnectorType),
		device.LinkPortCount, nullString(device.LinkConnectorType),
		device.PositionX, device.PositionY)
	if err != nil {
		return domain.OutputDevice{}, fmt.Errorf("create output device: %w", err)
	}
	id, _ := result.LastInsertId()
	return GetOutputDevice(db, id)
}

func UpdateOutputDevice(db *sql.DB, id int64, device domain.OutputDevice) (domain.OutputDevice, error) {
	_, err := db.Exec(`UPDATE output_devices SET name = ?, inventory_item_id = ?, owned_item_id = ?, input_port_count = ?, input_connector_type = ?, output_port_count = ?, output_connector_type = ?, link_port_count = ?, link_connector_type = ?, position_x = ?, position_y = ? WHERE id = ?`,
		device.Name, nullInt64(device.InventoryItemID), nullInt64(device.OwnedItemID),
		device.InputPortCount, nullString(device.InputConnectorType), device.OutputPortCount, nullString(device.OutputConnectorType),
		device.LinkPortCount, nullString(device.LinkConnectorType),
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
// 10's identical rule for the old hop-based model). A device's link-out
// ports are addressed as their own from_kind ("device_link"), so they
// need their own clause alongside the ordinary "device" one.
func DeleteOutputDevice(db *sql.DB, id int64) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("delete output device: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM output_cables WHERE (from_kind = 'device' AND from_id = ?) OR (from_kind = 'device_link' AND from_id = ?) OR (to_kind = 'device' AND to_id = ?)`, id, id, id); err != nil {
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
		&item.LinkPortCount, &item.LinkConnectorType,
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

const inputSourceColumns = `id, event_id, name, kind, mic_item_id, stand_item_id, phantom_power, connector_type, width, position_x, position_y`

func ListInputSources(db *sql.DB, eventID int64) ([]domain.InputSource, error) {
	rows, err := db.Query(`SELECT `+inputSourceColumns+` FROM input_sources WHERE event_id = ? ORDER BY id ASC`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list input sources: %w", err)
	}
	defer rows.Close()
	items := make([]domain.InputSource, 0)
	for rows.Next() {
		item, err := scanInputSource(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func GetInputSource(db *sql.DB, id int64) (domain.InputSource, error) {
	row := db.QueryRow(`SELECT `+inputSourceColumns+` FROM input_sources WHERE id = ?`, id)
	return scanInputSource(row)
}

func CreateInputSource(db *sql.DB, source domain.InputSource) (domain.InputSource, error) {
	result, err := db.Exec(`INSERT INTO input_sources (event_id, name, kind, mic_item_id, stand_item_id, phantom_power, connector_type, width, position_x, position_y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		source.EventID, source.Name, source.Kind, nullInt64(source.MicItemID), nullInt64(source.StandItemID), boolToInt(source.PhantomPower), source.ConnectorType, source.Width, source.PositionX, source.PositionY)
	if err != nil {
		return domain.InputSource{}, fmt.Errorf("create input source: %w", err)
	}
	id, _ := result.LastInsertId()
	return GetInputSource(db, id)
}

func UpdateInputSource(db *sql.DB, id int64, source domain.InputSource) (domain.InputSource, error) {
	_, err := db.Exec(`UPDATE input_sources SET name = ?, kind = ?, mic_item_id = ?, stand_item_id = ?, phantom_power = ?, connector_type = ?, width = ?, position_x = ?, position_y = ? WHERE id = ?`,
		source.Name, source.Kind, nullInt64(source.MicItemID), nullInt64(source.StandItemID), boolToInt(source.PhantomPower), source.ConnectorType, source.Width, source.PositionX, source.PositionY, id)
	if err != nil {
		return domain.InputSource{}, fmt.Errorf("update input source: %w", err)
	}
	return GetInputSource(db, id)
}

// DeleteInputSource deletes every input_cables row referencing this
// source as its from side (a Source has no input side, so it can never
// be a to) before removing the source itself — never blocks (FR-020).
func DeleteInputSource(db *sql.DB, id int64) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("delete input source: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM input_cables WHERE from_kind = 'source' AND from_id = ?`, id); err != nil {
		return fmt.Errorf("clear input source cables: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM input_sources WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete input source: %w", err)
	}
	return tx.Commit()
}

func scanInputSource(row scanner) (domain.InputSource, error) {
	var item domain.InputSource
	var micItemID, standItemID sql.NullInt64
	var phantom int
	if err := row.Scan(&item.ID, &item.EventID, &item.Name, &item.Kind, &micItemID, &standItemID, &phantom, &item.ConnectorType, &item.Width, &item.PositionX, &item.PositionY); err != nil {
		return domain.InputSource{}, fmt.Errorf("scan input source: %w", err)
	}
	item.MicItemID = int64PtrFromNull(micItemID)
	item.StandItemID = int64PtrFromNull(standItemID)
	item.PhantomPower = phantom == 1
	return item, nil
}

const inputDeviceColumns = `id, event_id, name, inventory_item_id, owned_item_id, input_port_count, COALESCE(input_connector_type, ''), output_port_count, COALESCE(output_connector_type, ''), position_x, position_y`

func ListInputDevices(db *sql.DB, eventID int64) ([]domain.InputDevice, error) {
	rows, err := db.Query(`SELECT `+inputDeviceColumns+` FROM input_devices WHERE event_id = ? ORDER BY id ASC`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list input devices: %w", err)
	}
	defer rows.Close()
	items := make([]domain.InputDevice, 0)
	for rows.Next() {
		item, err := scanInputDevice(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func GetInputDevice(db *sql.DB, id int64) (domain.InputDevice, error) {
	row := db.QueryRow(`SELECT `+inputDeviceColumns+` FROM input_devices WHERE id = ?`, id)
	return scanInputDevice(row)
}

func CreateInputDevice(db *sql.DB, device domain.InputDevice) (domain.InputDevice, error) {
	result, err := db.Exec(`INSERT INTO input_devices (event_id, name, inventory_item_id, owned_item_id, input_port_count, input_connector_type, output_port_count, output_connector_type, position_x, position_y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		device.EventID, device.Name, nullInt64(device.InventoryItemID), nullInt64(device.OwnedItemID),
		device.InputPortCount, nullString(device.InputConnectorType), device.OutputPortCount, nullString(device.OutputConnectorType),
		device.PositionX, device.PositionY)
	if err != nil {
		return domain.InputDevice{}, fmt.Errorf("create input device: %w", err)
	}
	id, _ := result.LastInsertId()
	return GetInputDevice(db, id)
}

func UpdateInputDevice(db *sql.DB, id int64, device domain.InputDevice) (domain.InputDevice, error) {
	_, err := db.Exec(`UPDATE input_devices SET name = ?, inventory_item_id = ?, owned_item_id = ?, input_port_count = ?, input_connector_type = ?, output_port_count = ?, output_connector_type = ?, position_x = ?, position_y = ? WHERE id = ?`,
		device.Name, nullInt64(device.InventoryItemID), nullInt64(device.OwnedItemID),
		device.InputPortCount, nullString(device.InputConnectorType), device.OutputPortCount, nullString(device.OutputConnectorType),
		device.PositionX, device.PositionY, id)
	if err != nil {
		return domain.InputDevice{}, fmt.Errorf("update input device: %w", err)
	}
	return GetInputDevice(db, id)
}

// DeleteInputDevice deletes every input_cables row referencing this
// device as either end before removing the device itself — never blocks
// (FR-020).
func DeleteInputDevice(db *sql.DB, id int64) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("delete input device: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM input_cables WHERE (from_kind = 'device' AND from_id = ?) OR (to_kind = 'device' AND to_id = ?)`, id, id); err != nil {
		return fmt.Errorf("clear input device cables: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM input_devices WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete input device: %w", err)
	}
	return tx.Commit()
}

func scanInputDevice(row scanner) (domain.InputDevice, error) {
	var item domain.InputDevice
	var invID, ownedID sql.NullInt64
	if err := row.Scan(&item.ID, &item.EventID, &item.Name, &invID, &ownedID,
		&item.InputPortCount, &item.InputConnectorType, &item.OutputPortCount, &item.OutputConnectorType,
		&item.PositionX, &item.PositionY); err != nil {
		return domain.InputDevice{}, fmt.Errorf("scan input device: %w", err)
	}
	item.InventoryItemID = int64PtrFromNull(invID)
	item.OwnedItemID = int64PtrFromNull(ownedID)
	return item, nil
}

const inputCableColumns = `id, event_id, from_kind, from_id, from_port, to_kind, to_id, to_port, cable_item_id`

func ListInputCables(db *sql.DB, eventID int64) ([]domain.InputCable, error) {
	rows, err := db.Query(`SELECT `+inputCableColumns+` FROM input_cables WHERE event_id = ? ORDER BY id ASC`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list input cables: %w", err)
	}
	defer rows.Close()
	items := make([]domain.InputCable, 0)
	for rows.Next() {
		item, err := scanInputCable(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func GetInputCable(db *sql.DB, id int64) (domain.InputCable, error) {
	row := db.QueryRow(`SELECT `+inputCableColumns+` FROM input_cables WHERE id = ?`, id)
	return scanInputCable(row)
}

func CreateInputCable(db *sql.DB, cable domain.InputCable) (domain.InputCable, error) {
	result, err := db.Exec(`INSERT INTO input_cables (event_id, from_kind, from_id, from_port, to_kind, to_id, to_port, cable_item_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		cable.EventID, cable.FromKind, cable.FromID, cable.FromPort, cable.ToKind, cable.ToID, cable.ToPort, nullInt64(cable.CableItemID))
	if err != nil {
		return domain.InputCable{}, fmt.Errorf("create input cable: %w", err)
	}
	id, _ := result.LastInsertId()
	return GetInputCable(db, id)
}

// UpdateInputCable only ever changes the catalog cable pick — moving a
// cable to different ports is delete + create (contracts/input-graph-
// api.md), since ports are 1:1 and there's nothing meaningful to "move"
// partially.
func UpdateInputCable(db *sql.DB, id int64, cableItemID *int64) (domain.InputCable, error) {
	_, err := db.Exec(`UPDATE input_cables SET cable_item_id = ? WHERE id = ?`, nullInt64(cableItemID), id)
	if err != nil {
		return domain.InputCable{}, fmt.Errorf("update input cable: %w", err)
	}
	return GetInputCable(db, id)
}

func DeleteInputCable(db *sql.DB, id int64) error {
	_, err := db.Exec(`DELETE FROM input_cables WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete input cable: %w", err)
	}
	return nil
}

func scanInputCable(row scanner) (domain.InputCable, error) {
	var item domain.InputCable
	var cableItemID sql.NullInt64
	if err := row.Scan(&item.ID, &item.EventID, &item.FromKind, &item.FromID, &item.FromPort, &item.ToKind, &item.ToID, &item.ToPort, &cableItemID); err != nil {
		return domain.InputCable{}, fmt.Errorf("scan input cable: %w", err)
	}
	item.CableItemID = int64PtrFromNull(cableItemID)
	return item, nil
}

// InputSourcePortCount is the number of ports an InputSource contributes
// to the graph — 1, or 2 independent ports when stereo (mirrors
// MixerPortCount below).
func InputSourcePortCount(width string) int {
	if width == "stereo" {
		return 2
	}
	return 1
}

// StageboxInputPortCount returns a stagebox's live mic/line jack count —
// the input graph's relevant side (data-model.md), as opposed to
// StageboxOutputPortCount which the output graph uses.
func StageboxInputPortCount(db *sql.DB, id int64) (int, error) {
	var count int
	err := db.QueryRow(`SELECT COALESCE(input_count, 0) FROM stageboxes WHERE id = ?`, id).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("stagebox input port count: %w", err)
	}
	return count, nil
}

// InputDevicePortCounts returns an input device's live input/output port
// counts (mirrors OutputDevicePortCounts).
func InputDevicePortCounts(db *sql.DB, id int64) (inputCount, outputCount int, err error) {
	err = db.QueryRow(`SELECT input_port_count, output_port_count FROM input_devices WHERE id = ?`, id).Scan(&inputCount, &outputCount)
	if err != nil {
		return 0, 0, fmt.Errorf("input device port counts: %w", err)
	}
	return inputCount, outputCount, nil
}

// InputSourceWidth returns a source's width, backing InputSourcePortCount
// for port-bounds validation (mirrors MixerOutputWidth).
func InputSourceWidth(db *sql.DB, id int64) (string, error) {
	var width string
	err := db.QueryRow(`SELECT width FROM input_sources WHERE id = ?`, id).Scan(&width)
	if err != nil {
		return "", fmt.Errorf("input source width: %w", err)
	}
	return width, nil
}

// InputChannelWidth returns a channel's width, backing its input-side
// port count in the Input graph — a stereo Channel contributes two
// independent ports (its own two separate physical connections), the
// same "derived port count from width" pattern as InputSourceWidth/
// MixerOutputWidth.
func InputChannelWidth(db *sql.DB, id int64) (string, error) {
	var width string
	err := db.QueryRow(`SELECT width FROM input_channels WHERE id = ?`, id).Scan(&width)
	if err != nil {
		return "", fmt.Errorf("input channel width: %w", err)
	}
	return width, nil
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

func OutputDeviceLinkPortCount(db *sql.DB, id int64) (int, error) {
	var count int
	err := db.QueryRow(`SELECT link_port_count FROM output_devices WHERE id = ?`, id).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("output device link port count: %w", err)
	}
	return count, nil
}

func MixerOutputWidth(db *sql.DB, id int64) (string, error) {
	var width string
	err := db.QueryRow(`SELECT width FROM audio_patch_outputs WHERE id = ?`, id).Scan(&width)
	if err != nil {
		return "", fmt.Errorf("mixer output width: %w", err)
	}
	return width, nil
}

// OutputMixerPositionY returns the mixer node's canvas Y position for the
// output signal-flow graph — a single implicit node per event, always
// pinned to the Sources/Channels rail (X is fixed, so only Y is stored).
func OutputMixerPositionY(db *sql.DB, eventID int64) (float64, error) {
	var y float64
	err := db.QueryRow(`SELECT output_mixer_position_y FROM events WHERE id = ?`, eventID).Scan(&y)
	if err != nil {
		return 0, fmt.Errorf("output mixer position: %w", err)
	}
	return y, nil
}

func UpdateOutputMixerPositionY(db *sql.DB, eventID int64, y float64) error {
	result, err := db.Exec(`UPDATE events SET output_mixer_position_y = ? WHERE id = ?`, y, eventID)
	if err != nil {
		return fmt.Errorf("update output mixer position: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("update output mixer position: %w", err)
	}
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
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

func scanAudioOutput(row scanner) (domain.AudioPatchOutput, error) {
	var item domain.AudioPatchOutput
	if err := row.Scan(&item.ID, &item.EventID, &item.OutputNumber, &item.OutputName, &item.OutputType, &item.Color, &item.Width, &item.Notes); err != nil {
		return domain.AudioPatchOutput{}, fmt.Errorf("scan audio output: %w", err)
	}
	return item, nil
}
