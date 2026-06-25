package db

import (
	"database/sql"
	"fmt"

	"github.com/trionell/patcherplanner/internal/domain"
)

func ListStageboxes(db *sql.DB, eventID int64) ([]domain.Stagebox, error) {
	rows, err := db.Query(`SELECT id, event_id, name, COALESCE(model, ''), COALESCE(input_count, 0), COALESCE(output_count, 0), COALESCE(connection_type, 'analog') FROM stageboxes WHERE event_id = ? ORDER BY id ASC`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list stageboxes: %w", err)
	}
	defer rows.Close()
	items := make([]domain.Stagebox, 0)
	for rows.Next() {
		var item domain.Stagebox
		if err := rows.Scan(&item.ID, &item.EventID, &item.Name, &item.Model, &item.InputCount, &item.OutputCount, &item.ConnectionType); err != nil {
			return nil, fmt.Errorf("scan stagebox: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func ListStageMultis(db *sql.DB, eventID int64) ([]domain.StageMulti, error) {
	rows, err := db.Query(`SELECT id, event_id, name, COALESCE(length_m, 0), COALESCE(channels, 24), COALESCE(connector_type, 'xlr') FROM stage_multis WHERE event_id = ? ORDER BY id ASC`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list stage multis: %w", err)
	}
	defer rows.Close()
	items := make([]domain.StageMulti, 0)
	for rows.Next() {
		var item domain.StageMulti
		if err := rows.Scan(&item.ID, &item.EventID, &item.Name, &item.LengthM, &item.Channels, &item.ConnectorType); err != nil {
			return nil, fmt.Errorf("scan stage multi: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func ListAudioPatchInputs(db *sql.DB, eventID int64) ([]domain.AudioPatchInput, error) {
	rows, err := db.Query(`SELECT id, event_id, channel_number, COALESCE(channel_name, ''), COALESCE(signal_type, 'mic'), COALESCE(preamp_connector, 'xlr'), stagebox_id, stagebox_channel, stage_multi_id, stage_multi_channel, COALESCE(mic_model, ''), COALESCE(cable_type, 'xlr'), COALESCE(cable_length_m, 0), COALESCE(mic_stand, ''), COALESCE(phantom_power, 0), COALESCE(dca_groups, ''), COALESCE(notes, '') FROM audio_patch_inputs WHERE event_id = ? ORDER BY channel_number ASC, id ASC`, eventID)
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
	row := db.QueryRow(`SELECT id, event_id, channel_number, COALESCE(channel_name, ''), COALESCE(signal_type, 'mic'), COALESCE(preamp_connector, 'xlr'), stagebox_id, stagebox_channel, stage_multi_id, stage_multi_channel, COALESCE(mic_model, ''), COALESCE(cable_type, 'xlr'), COALESCE(cable_length_m, 0), COALESCE(mic_stand, ''), COALESCE(phantom_power, 0), COALESCE(dca_groups, ''), COALESCE(notes, '') FROM audio_patch_inputs WHERE id = ?`, id)
	return scanAudioInput(row)
}

func CreateAudioPatchInput(db *sql.DB, input domain.AudioPatchInput) (domain.AudioPatchInput, error) {
	result, err := db.Exec(`INSERT INTO audio_patch_inputs (event_id, channel_number, channel_name, signal_type, preamp_connector, stagebox_id, stagebox_channel, stage_multi_id, stage_multi_channel, mic_model, cable_type, cable_length_m, mic_stand, phantom_power, dca_groups, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, input.EventID, input.ChannelNumber, nullString(input.ChannelName), input.SignalType, input.PreampConnector, nullInt64(input.StageboxID), nullInt(input.StageboxChannel), nullInt64(input.StageMultiID), nullInt(input.StageMultiChannel), nullString(input.MicModel), input.CableType, nullFloat64(input.CableLengthM), nullString(input.MicStand), boolToInt(input.PhantomPower), nullString(input.DCAGroups), nullString(input.Notes))
	if err != nil {
		return domain.AudioPatchInput{}, fmt.Errorf("create audio input: %w", err)
	}
	id, _ := result.LastInsertId()
	return GetAudioPatchInput(db, id)
}

func UpdateAudioPatchInput(db *sql.DB, id int64, input domain.AudioPatchInput) (domain.AudioPatchInput, error) {
	_, err := db.Exec(`UPDATE audio_patch_inputs SET channel_number = ?, channel_name = ?, signal_type = ?, preamp_connector = ?, stagebox_id = ?, stagebox_channel = ?, stage_multi_id = ?, stage_multi_channel = ?, mic_model = ?, cable_type = ?, cable_length_m = ?, mic_stand = ?, phantom_power = ?, dca_groups = ?, notes = ? WHERE id = ?`, input.ChannelNumber, nullString(input.ChannelName), input.SignalType, input.PreampConnector, nullInt64(input.StageboxID), nullInt(input.StageboxChannel), nullInt64(input.StageMultiID), nullInt(input.StageMultiChannel), nullString(input.MicModel), input.CableType, nullFloat64(input.CableLengthM), nullString(input.MicStand), boolToInt(input.PhantomPower), nullString(input.DCAGroups), nullString(input.Notes), id)
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
	var stageboxID, stageboxChannel, stageMultiID, stageMultiChannel sql.NullInt64
	var cableLength sql.NullFloat64
	var phantom int
	if err := row.Scan(&item.ID, &item.EventID, &item.ChannelNumber, &item.ChannelName, &item.SignalType, &item.PreampConnector, &stageboxID, &stageboxChannel, &stageMultiID, &stageMultiChannel, &item.MicModel, &item.CableType, &cableLength, &item.MicStand, &phantom, &item.DCAGroups, &item.Notes); err != nil {
		return domain.AudioPatchInput{}, fmt.Errorf("scan audio input: %w", err)
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
