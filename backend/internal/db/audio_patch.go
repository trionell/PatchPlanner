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

func DeleteStagebox(db *sql.DB, id int64) error {
	_, err := db.Exec(`DELETE FROM stageboxes WHERE id = ?`, id)
	return err
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

func DeleteStageMulti(db *sql.DB, id int64) error {
	_, err := db.Exec(`DELETE FROM stage_multis WHERE id = ?`, id)
	return err
}

const audioInputColumns = `id, event_id, channel_number, COALESCE(channel_name, ''), COALESCE(signal_type, 'mic'), COALESCE(preamp_connector, 'xlr'), stagebox_id, stagebox_channel, stage_multi_id, stage_multi_channel, mic_item_id, COALESCE(mic_model, ''), COALESCE(cable_type, 'xlr'), COALESCE(cable_length_m, 0), COALESCE(mic_stand, ''), COALESCE(phantom_power, 0), COALESCE(dca_groups, ''), COALESCE(notes, '')`

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
	return items, rows.Err()
}

func GetAudioPatchInput(db *sql.DB, id int64) (domain.AudioPatchInput, error) {
	row := db.QueryRow(`SELECT `+audioInputColumns+` FROM audio_patch_inputs WHERE id = ?`, id)
	return scanAudioInput(row)
}

func CreateAudioPatchInput(db *sql.DB, input domain.AudioPatchInput) (domain.AudioPatchInput, error) {
	// mic_model (the legacy label) is intentionally never written for new
	// rows; it only exists for pre-009 data that matched no catalog item.
	result, err := db.Exec(`INSERT INTO audio_patch_inputs (event_id, channel_number, channel_name, signal_type, preamp_connector, stagebox_id, stagebox_channel, stage_multi_id, stage_multi_channel, mic_item_id, cable_type, cable_length_m, mic_stand, phantom_power, dca_groups, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, input.EventID, input.ChannelNumber, nullString(input.ChannelName), input.SignalType, input.PreampConnector, nullInt64(input.StageboxID), nullInt(input.StageboxChannel), nullInt64(input.StageMultiID), nullInt(input.StageMultiChannel), nullInt64(input.MicItemID), input.CableType, nullFloat64(input.CableLengthM), nullString(input.MicStand), boolToInt(input.PhantomPower), nullString(input.DCAGroups), nullString(input.Notes))
	if err != nil {
		return domain.AudioPatchInput{}, fmt.Errorf("create audio input: %w", err)
	}
	id, _ := result.LastInsertId()
	return GetAudioPatchInput(db, id)
}

func UpdateAudioPatchInput(db *sql.DB, id int64, input domain.AudioPatchInput) (domain.AudioPatchInput, error) {
	// The legacy label is preserved as-is until the row gets a real catalog
	// reference, at which point it is cleared for good.
	_, err := db.Exec(`UPDATE audio_patch_inputs SET channel_number = ?, channel_name = ?, signal_type = ?, preamp_connector = ?, stagebox_id = ?, stagebox_channel = ?, stage_multi_id = ?, stage_multi_channel = ?, mic_item_id = ?, mic_model = CASE WHEN ? IS NOT NULL THEN NULL ELSE mic_model END, cable_type = ?, cable_length_m = ?, mic_stand = ?, phantom_power = ?, dca_groups = ?, notes = ? WHERE id = ?`, input.ChannelNumber, nullString(input.ChannelName), input.SignalType, input.PreampConnector, nullInt64(input.StageboxID), nullInt(input.StageboxChannel), nullInt64(input.StageMultiID), nullInt(input.StageMultiChannel), nullInt64(input.MicItemID), nullInt64(input.MicItemID), input.CableType, nullFloat64(input.CableLengthM), nullString(input.MicStand), boolToInt(input.PhantomPower), nullString(input.DCAGroups), nullString(input.Notes), id)
	if err != nil {
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

func ListAudioPatchOutputs(db *sql.DB, eventID int64) ([]domain.AudioPatchOutput, error) {
	rows, err := db.Query(`SELECT id, event_id, output_number, COALESCE(output_name, ''), COALESCE(output_type, 'foh'), COALESCE(destination_type, 'local'), stagebox_id, stagebox_channel, stage_multi_id, stage_multi_channel, amplifier_item_id, speaker_item_id, COALESCE(cable_type, 'xlr'), COALESCE(cable_length_m, 0), COALESCE(notes, '') FROM audio_patch_outputs WHERE event_id = ? ORDER BY output_number ASC, id ASC`, eventID)
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
	return items, rows.Err()
}

func GetAudioPatchOutput(db *sql.DB, id int64) (domain.AudioPatchOutput, error) {
	row := db.QueryRow(`SELECT id, event_id, output_number, COALESCE(output_name, ''), COALESCE(output_type, 'foh'), COALESCE(destination_type, 'local'), stagebox_id, stagebox_channel, stage_multi_id, stage_multi_channel, amplifier_item_id, speaker_item_id, COALESCE(cable_type, 'xlr'), COALESCE(cable_length_m, 0), COALESCE(notes, '') FROM audio_patch_outputs WHERE id = ?`, id)
	return scanAudioOutput(row)
}

func CreateAudioPatchOutput(db *sql.DB, output domain.AudioPatchOutput) (domain.AudioPatchOutput, error) {
	result, err := db.Exec(`INSERT INTO audio_patch_outputs (event_id, output_number, output_name, output_type, destination_type, stagebox_id, stagebox_channel, stage_multi_id, stage_multi_channel, amplifier_item_id, speaker_item_id, cable_type, cable_length_m, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, output.EventID, output.OutputNumber, nullString(output.OutputName), output.OutputType, output.DestinationType, nullInt64(output.StageboxID), nullInt(output.StageboxChannel), nullInt64(output.StageMultiID), nullInt(output.StageMultiChannel), nullInt64(output.AmplifierItemID), nullInt64(output.SpeakerItemID), output.CableType, nullFloat64(output.CableLengthM), nullString(output.Notes))
	if err != nil {
		return domain.AudioPatchOutput{}, fmt.Errorf("create audio output: %w", err)
	}
	id, _ := result.LastInsertId()
	return GetAudioPatchOutput(db, id)
}

func UpdateAudioPatchOutput(db *sql.DB, id int64, output domain.AudioPatchOutput) (domain.AudioPatchOutput, error) {
	_, err := db.Exec(`UPDATE audio_patch_outputs SET output_number = ?, output_name = ?, output_type = ?, destination_type = ?, stagebox_id = ?, stagebox_channel = ?, stage_multi_id = ?, stage_multi_channel = ?, amplifier_item_id = ?, speaker_item_id = ?, cable_type = ?, cable_length_m = ?, notes = ? WHERE id = ?`, output.OutputNumber, nullString(output.OutputName), output.OutputType, output.DestinationType, nullInt64(output.StageboxID), nullInt(output.StageboxChannel), nullInt64(output.StageMultiID), nullInt(output.StageMultiChannel), nullInt64(output.AmplifierItemID), nullInt64(output.SpeakerItemID), output.CableType, nullFloat64(output.CableLengthM), nullString(output.Notes), id)
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

type scanner interface {
	Scan(dest ...any) error
}

func scanAudioInput(row scanner) (domain.AudioPatchInput, error) {
	var item domain.AudioPatchInput
	var stageboxID, stageboxChannel, stageMultiID, stageMultiChannel, micItemID sql.NullInt64
	var cableLength sql.NullFloat64
	var phantom int
	if err := row.Scan(&item.ID, &item.EventID, &item.ChannelNumber, &item.ChannelName, &item.SignalType, &item.PreampConnector, &stageboxID, &stageboxChannel, &stageMultiID, &stageMultiChannel, &micItemID, &item.MicLabel, &item.CableType, &cableLength, &item.MicStand, &phantom, &item.DCAGroups, &item.Notes); err != nil {
		return domain.AudioPatchInput{}, fmt.Errorf("scan audio input: %w", err)
	}
	if micItemID.Valid {
		v := micItemID.Int64
		item.MicItemID = &v
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
	if cableLength.Valid {
		item.CableLengthM = cableLength.Float64
	}
	item.PhantomPower = phantom == 1
	return item, nil
}

func scanAudioOutput(row scanner) (domain.AudioPatchOutput, error) {
	var item domain.AudioPatchOutput
	var stageboxID, stageboxChannel, stageMultiID, stageMultiChannel, ampID, speakerID sql.NullInt64
	var cableLength sql.NullFloat64
	if err := row.Scan(&item.ID, &item.EventID, &item.OutputNumber, &item.OutputName, &item.OutputType, &item.DestinationType, &stageboxID, &stageboxChannel, &stageMultiID, &stageMultiChannel, &ampID, &speakerID, &item.CableType, &cableLength, &item.Notes); err != nil {
		return domain.AudioPatchOutput{}, fmt.Errorf("scan audio output: %w", err)
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
	if ampID.Valid {
		v := ampID.Int64
		item.AmplifierItemID = &v
	}
	if speakerID.Valid {
		v := speakerID.Int64
		item.SpeakerItemID = &v
	}
	if cableLength.Valid {
		item.CableLengthM = cableLength.Float64
	}
	return item, nil
}
