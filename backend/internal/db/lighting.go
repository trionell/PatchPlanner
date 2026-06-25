package db

import (
	"database/sql"
	"fmt"

	"github.com/trionell/patcherplanner/internal/domain"
)

func ListLightingRigs(db *sql.DB, eventID int64) ([]domain.LightingRig, error) {
	rows, err := db.Query(`SELECT id, event_id, name, COALESCE(notes, '') FROM lighting_rigs WHERE event_id = ? ORDER BY id ASC`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list lighting rigs: %w", err)
	}
	defer rows.Close()
	items := make([]domain.LightingRig, 0)
	for rows.Next() {
		var item domain.LightingRig
		if err := rows.Scan(&item.ID, &item.EventID, &item.Name, &item.Notes); err != nil {
			return nil, fmt.Errorf("scan lighting rig: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func GetOrCreateDefaultLightingRig(db *sql.DB, eventID int64) (domain.LightingRig, error) {
	rigs, err := ListLightingRigs(db, eventID)
	if err != nil {
		return domain.LightingRig{}, err
	}
	if len(rigs) > 0 {
		return rigs[0], nil
	}
	result, err := db.Exec(`INSERT INTO lighting_rigs (event_id, name, notes) VALUES (?, 'Main Rig', '')`, eventID)
	if err != nil {
		return domain.LightingRig{}, fmt.Errorf("create lighting rig: %w", err)
	}
	id, _ := result.LastInsertId()
	var rig domain.LightingRig
	err = db.QueryRow(`SELECT id, event_id, name, COALESCE(notes, '') FROM lighting_rigs WHERE id = ?`, id).Scan(&rig.ID, &rig.EventID, &rig.Name, &rig.Notes)
	if err != nil {
		return domain.LightingRig{}, fmt.Errorf("get lighting rig: %w", err)
	}
	return rig, nil
}

func ListTrussSections(db *sql.DB, rigID int64) ([]domain.TrussSection, error) {
	rows, err := db.Query(`SELECT id, rig_id, name, COALESCE(length_m, 0), COALESCE(truss_type, 'box') FROM truss_sections WHERE rig_id = ? ORDER BY id ASC`, rigID)
	if err != nil {
		return nil, fmt.Errorf("list truss sections: %w", err)
	}
	defer rows.Close()
	items := make([]domain.TrussSection, 0)
	for rows.Next() {
		var item domain.TrussSection
		if err := rows.Scan(&item.ID, &item.RigID, &item.Name, &item.LengthM, &item.TrussType); err != nil {
			return nil, fmt.Errorf("scan truss section: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func ListLightingFixtures(db *sql.DB, rigID int64) ([]domain.LightingFixture, error) {
	rows, err := db.Query(`
		SELECT f.id, f.rig_id, f.truss_section_id, f.inventory_item_id, COALESCE(i.name, ''), COALESCE(f.custom_name, ''), COALESCE(f.position_index, 0), COALESCE(f.power_connection, 'grid'), f.power_chain_parent_id, COALESCE(f.power_connector_in, 'schuko'), COALESCE(f.power_connector_out, ''), COALESCE(f.dmx_universe, 1), f.dmx_start_address, COALESCE(f.dmx_channel_mode, ''), COALESCE(f.dmx_channel_count, 0), f.dmx_chain_parent_id, COALESCE(f.notes, ''), COALESCE(t.name, '')
		FROM lighting_fixtures f
		LEFT JOIN inventory_items i ON i.id = f.inventory_item_id
		LEFT JOIN truss_sections t ON t.id = f.truss_section_id
		WHERE f.rig_id = ?
		ORDER BY f.position_index ASC, f.id ASC`, rigID)
	if err != nil {
		return nil, fmt.Errorf("list lighting fixtures: %w", err)
	}
	defer rows.Close()
	fixtures := make([]domain.LightingFixture, 0)
	for rows.Next() {
		fixture, err := scanLightingFixture(rows)
		if err != nil {
			return nil, err
		}
		fixtures = append(fixtures, fixture)
	}
	return fixtures, rows.Err()
}

func GetLightingFixture(db *sql.DB, id int64) (domain.LightingFixture, error) {
	row := db.QueryRow(`
		SELECT f.id, f.rig_id, f.truss_section_id, f.inventory_item_id, COALESCE(i.name, ''), COALESCE(f.custom_name, ''), COALESCE(f.position_index, 0), COALESCE(f.power_connection, 'grid'), f.power_chain_parent_id, COALESCE(f.power_connector_in, 'schuko'), COALESCE(f.power_connector_out, ''), COALESCE(f.dmx_universe, 1), f.dmx_start_address, COALESCE(f.dmx_channel_mode, ''), COALESCE(f.dmx_channel_count, 0), f.dmx_chain_parent_id, COALESCE(f.notes, ''), COALESCE(t.name, '')
		FROM lighting_fixtures f
		LEFT JOIN inventory_items i ON i.id = f.inventory_item_id
		LEFT JOIN truss_sections t ON t.id = f.truss_section_id
		WHERE f.id = ?`, id)
	return scanLightingFixture(row)
}

func CreateLightingFixture(db *sql.DB, fixture domain.LightingFixture) (domain.LightingFixture, error) {
	result, err := db.Exec(`INSERT INTO lighting_fixtures (rig_id, truss_section_id, inventory_item_id, custom_name, position_index, power_connection, power_chain_parent_id, power_connector_in, power_connector_out, dmx_universe, dmx_start_address, dmx_channel_mode, dmx_channel_count, dmx_chain_parent_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, fixture.RigID, nullInt64(fixture.TrussSectionID), nullInt64(fixture.InventoryItemID), nullString(fixture.CustomName), fixture.PositionIndex, fixture.PowerConnection, nullInt64(fixture.PowerChainParentID), fixture.PowerConnectorIn, nullString(fixture.PowerConnectorOut), fixture.DMXUniverse, nullInt(fixture.DMXStartAddress), nullString(fixture.DMXChannelMode), fixture.DMXChannelCount, nullInt64(fixture.DMXChainParentID), nullString(fixture.Notes))
	if err != nil {
		return domain.LightingFixture{}, fmt.Errorf("create lighting fixture: %w", err)
	}
	id, _ := result.LastInsertId()
	return GetLightingFixture(db, id)
}

func UpdateLightingFixture(db *sql.DB, id int64, fixture domain.LightingFixture) (domain.LightingFixture, error) {
	_, err := db.Exec(`UPDATE lighting_fixtures SET truss_section_id = ?, inventory_item_id = ?, custom_name = ?, position_index = ?, power_connection = ?, power_chain_parent_id = ?, power_connector_in = ?, power_connector_out = ?, dmx_universe = ?, dmx_start_address = ?, dmx_channel_mode = ?, dmx_channel_count = ?, dmx_chain_parent_id = ?, notes = ? WHERE id = ?`, nullInt64(fixture.TrussSectionID), nullInt64(fixture.InventoryItemID), nullString(fixture.CustomName), fixture.PositionIndex, fixture.PowerConnection, nullInt64(fixture.PowerChainParentID), fixture.PowerConnectorIn, nullString(fixture.PowerConnectorOut), fixture.DMXUniverse, nullInt(fixture.DMXStartAddress), nullString(fixture.DMXChannelMode), fixture.DMXChannelCount, nullInt64(fixture.DMXChainParentID), nullString(fixture.Notes), id)
	if err != nil {
		return domain.LightingFixture{}, fmt.Errorf("update lighting fixture: %w", err)
	}
	return GetLightingFixture(db, id)
}

func DeleteLightingFixture(db *sql.DB, id int64) error {
	_, err := db.Exec(`DELETE FROM lighting_fixtures WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete lighting fixture: %w", err)
	}
	return nil
}

func AutoAssignDMX(db *sql.DB, rigID int64) ([]domain.LightingFixture, error) {
	fixtures, err := ListLightingFixtures(db, rigID)
	if err != nil {
		return nil, err
	}
	currentUniverse := 1
	currentAddress := 1
	for _, fixture := range fixtures {
		channelCount := fixture.DMXChannelCount
		if channelCount <= 0 {
			channelCount = 1
		}
		if currentAddress+channelCount-1 > 512 {
			currentUniverse++
			currentAddress = 1
		}
		start := currentAddress
		_, err := db.Exec(`UPDATE lighting_fixtures SET dmx_universe = ?, dmx_start_address = ? WHERE id = ?`, currentUniverse, start, fixture.ID)
		if err != nil {
			return nil, fmt.Errorf("auto assign dmx: %w", err)
		}
		currentAddress += channelCount
	}
	return ListLightingFixtures(db, rigID)
}

func scanLightingFixture(row scanner) (domain.LightingFixture, error) {
	var fixture domain.LightingFixture
	var trussSectionID, inventoryItemID, powerChainParentID, dmxStartAddress, dmxChainParentID sql.NullInt64
	if err := row.Scan(&fixture.ID, &fixture.RigID, &trussSectionID, &inventoryItemID, &fixture.InventoryItemName, &fixture.CustomName, &fixture.PositionIndex, &fixture.PowerConnection, &powerChainParentID, &fixture.PowerConnectorIn, &fixture.PowerConnectorOut, &fixture.DMXUniverse, &dmxStartAddress, &fixture.DMXChannelMode, &fixture.DMXChannelCount, &dmxChainParentID, &fixture.Notes, &fixture.TrussSectionName); err != nil {
		return domain.LightingFixture{}, fmt.Errorf("scan lighting fixture: %w", err)
	}
	if trussSectionID.Valid {
		v := trussSectionID.Int64
		fixture.TrussSectionID = &v
	}
	if inventoryItemID.Valid {
		v := inventoryItemID.Int64
		fixture.InventoryItemID = &v
	}
	if powerChainParentID.Valid {
		v := powerChainParentID.Int64
		fixture.PowerChainParentID = &v
	}
	if dmxStartAddress.Valid {
		v := int(dmxStartAddress.Int64)
		fixture.DMXStartAddress = &v
	}
	if dmxChainParentID.Valid {
		v := dmxChainParentID.Int64
		fixture.DMXChainParentID = &v
	}
	return fixture, nil
}
