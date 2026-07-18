package db

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
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

func ListLightingFixtures(db *sql.DB, rigID int64) ([]domain.LightingFixture, error) {
	rows, err := db.Query(`
		SELECT f.id, f.rig_id, f.fixture_number, f.inventory_item_id, COALESCE(i.name, ''), COALESCE(f.custom_name, ''), COALESCE(f.position_index, 0), COALESCE(f.power_connection, 'grid'), f.power_chain_parent_id, COALESCE(f.power_connector_in, 'schuko'), COALESCE(f.power_connector_out, ''), COALESCE(f.dmx_universe, 1), f.dmx_start_address, COALESCE(f.dmx_channel_mode, ''), COALESCE(f.dmx_channel_count, 0), f.dmx_chain_parent_id, COALESCE(f.notes, ''), COALESCE(pt.name, ''), tf.offset_cm
		FROM lighting_fixtures f
		LEFT JOIN inventory_items i ON i.id = f.inventory_item_id
		LEFT JOIN stage_plot_truss_fixtures tf ON tf.fixture_id = f.id
		LEFT JOIN stage_plot_trusses pt ON pt.id = tf.truss_id
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
		SELECT f.id, f.rig_id, f.fixture_number, f.inventory_item_id, COALESCE(i.name, ''), COALESCE(f.custom_name, ''), COALESCE(f.position_index, 0), COALESCE(f.power_connection, 'grid'), f.power_chain_parent_id, COALESCE(f.power_connector_in, 'schuko'), COALESCE(f.power_connector_out, ''), COALESCE(f.dmx_universe, 1), f.dmx_start_address, COALESCE(f.dmx_channel_mode, ''), COALESCE(f.dmx_channel_count, 0), f.dmx_chain_parent_id, COALESCE(f.notes, ''), COALESCE(pt.name, ''), tf.offset_cm
		FROM lighting_fixtures f
		LEFT JOIN inventory_items i ON i.id = f.inventory_item_id
		LEFT JOIN stage_plot_truss_fixtures tf ON tf.fixture_id = f.id
		LEFT JOIN stage_plot_trusses pt ON pt.id = tf.truss_id
		WHERE f.id = ?`, id)
	return scanLightingFixture(row)
}

func CreateLightingFixture(db *sql.DB, fixture domain.LightingFixture) (domain.LightingFixture, error) {
	result, err := db.Exec(`INSERT INTO lighting_fixtures (rig_id, fixture_number, inventory_item_id, custom_name, position_index, power_connection, power_chain_parent_id, power_connector_in, power_connector_out, dmx_universe, dmx_start_address, dmx_channel_mode, dmx_channel_count, dmx_chain_parent_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, fixture.RigID, nullInt(fixture.FixtureNumber), nullInt64(fixture.InventoryItemID), nullString(fixture.CustomName), fixture.PositionIndex, fixture.PowerConnection, nullInt64(fixture.PowerChainParentID), fixture.PowerConnectorIn, nullString(fixture.PowerConnectorOut), fixture.DMXUniverse, nullInt(fixture.DMXStartAddress), nullString(fixture.DMXChannelMode), fixture.DMXChannelCount, nullInt64(fixture.DMXChainParentID), nullString(fixture.Notes))
	if err != nil {
		return domain.LightingFixture{}, fmt.Errorf("create lighting fixture: %w", err)
	}
	id, _ := result.LastInsertId()
	return GetLightingFixture(db, id)
}

func UpdateLightingFixture(db *sql.DB, id int64, fixture domain.LightingFixture) (domain.LightingFixture, error) {
	_, err := db.Exec(`UPDATE lighting_fixtures SET fixture_number = ?, inventory_item_id = ?, custom_name = ?, position_index = ?, power_connection = ?, power_chain_parent_id = ?, power_connector_in = ?, power_connector_out = ?, dmx_universe = ?, dmx_start_address = ?, dmx_channel_mode = ?, dmx_channel_count = ?, dmx_chain_parent_id = ?, notes = ? WHERE id = ?`, nullInt(fixture.FixtureNumber), nullInt64(fixture.InventoryItemID), nullString(fixture.CustomName), fixture.PositionIndex, fixture.PowerConnection, nullInt64(fixture.PowerChainParentID), fixture.PowerConnectorIn, nullString(fixture.PowerConnectorOut), fixture.DMXUniverse, nullInt(fixture.DMXStartAddress), nullString(fixture.DMXChannelMode), fixture.DMXChannelCount, nullInt64(fixture.DMXChainParentID), nullString(fixture.Notes), id)
	if err != nil {
		return domain.LightingFixture{}, fmt.Errorf("update lighting fixture: %w", err)
	}
	return GetLightingFixture(db, id)
}

// DeleteLightingFixture detaches any fixtures chained off this one (power and
// DMX) before removing it, so chains stay valid and the FK constraints hold.
func DeleteLightingFixture(db *sql.DB, id int64) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("delete lighting fixture: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE lighting_fixtures SET power_chain_parent_id = NULL WHERE power_chain_parent_id = ?`, id); err != nil {
		return fmt.Errorf("clear power chain references: %w", err)
	}
	if _, err := tx.Exec(`UPDATE lighting_fixtures SET dmx_chain_parent_id = NULL WHERE dmx_chain_parent_id = ?`, id); err != nil {
		return fmt.Errorf("clear dmx chain references: %w", err)
	}
	if err := clearStagePlotLinksTo(tx, "lighting_fixture", id); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM lighting_fixtures WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete lighting fixture: %w", err)
	}
	return tx.Commit()
}

// ErrUniverseFull is returned by AutoAssignDMX when the fixtures assigned to
// one universe need more than the 512 available DMX channels.
var ErrUniverseFull = errors.New("dmx universe exceeds 512 channels")

// AutoAssignDMX assigns sequential start addresses per universe: fixtures
// keep the universe they are assigned to, and within each universe addresses
// run from 1 in position-index order.
func AutoAssignDMX(db *sql.DB, rigID int64) ([]domain.LightingFixture, error) {
	fixtures, err := ListLightingFixtures(db, rigID)
	if err != nil {
		return nil, err
	}
	tx, err := db.Begin()
	if err != nil {
		return nil, fmt.Errorf("auto assign dmx: %w", err)
	}
	defer tx.Rollback()

	nextAddress := make(map[int]int)
	for _, fixture := range fixtures {
		universe := fixture.DMXUniverse
		if universe < 1 {
			universe = 1
		}
		channelCount := fixture.DMXChannelCount
		if channelCount <= 0 {
			channelCount = 1
		}
		start, seen := nextAddress[universe]
		if !seen {
			start = 1
		}
		if start+channelCount-1 > 512 {
			return nil, fmt.Errorf("%w: universe %d", ErrUniverseFull, universe)
		}
		if _, err := tx.Exec(`UPDATE lighting_fixtures SET dmx_universe = ?, dmx_start_address = ? WHERE id = ?`, universe, start, fixture.ID); err != nil {
			return nil, fmt.Errorf("auto assign dmx: %w", err)
		}
		nextAddress[universe] = start + channelCount
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("auto assign dmx: %w", err)
	}
	return ListLightingFixtures(db, rigID)
}

func scanLightingFixture(row scanner) (domain.LightingFixture, error) {
	var fixture domain.LightingFixture
	var fixtureNumber, inventoryItemID, powerChainParentID, dmxStartAddress, dmxChainParentID sql.NullInt64
	var trussOffset sql.NullFloat64
	if err := row.Scan(&fixture.ID, &fixture.RigID, &fixtureNumber, &inventoryItemID, &fixture.InventoryItemName, &fixture.CustomName, &fixture.PositionIndex, &fixture.PowerConnection, &powerChainParentID, &fixture.PowerConnectorIn, &fixture.PowerConnectorOut, &fixture.DMXUniverse, &dmxStartAddress, &fixture.DMXChannelMode, &fixture.DMXChannelCount, &dmxChainParentID, &fixture.Notes, &fixture.TrussName, &trussOffset); err != nil {
		return domain.LightingFixture{}, fmt.Errorf("scan lighting fixture: %w", err)
	}
	if fixtureNumber.Valid {
		v := int(fixtureNumber.Int64)
		fixture.FixtureNumber = &v
	}
	if trussOffset.Valid {
		v := trussOffset.Float64
		fixture.TrussOffsetCm = &v
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

// BulkCreateLightingFixtures creates one batch of identical fixtures in a
// single transaction: positions appended after the rig's highest, DMX start
// addresses appended after the chosen universe's occupied range (existing
// fixtures are never touched — re-running AutoAssignDMX stays a separate
// operation), fixture numbers incrementing from the optional start.
// All-or-nothing: ErrUniverseFull (or any failure) creates zero fixtures.
// Returns sql.ErrNoRows (wrapped) when the rig does not exist.
func BulkCreateLightingFixtures(db *sql.DB, rigID int64, req domain.BulkFixtureRequest) ([]domain.LightingFixture, error) {
	universe := req.DMXUniverse
	if universe < 1 {
		universe = 1
	}
	channelCount := req.DMXChannelCount
	if channelCount < 1 {
		channelCount = 1
	}

	tx, err := db.Begin()
	if err != nil {
		return nil, fmt.Errorf("bulk create fixtures: %w", err)
	}
	defer tx.Rollback()

	var exists int64
	if err := tx.QueryRow(`SELECT id FROM lighting_rigs WHERE id = ?`, rigID).Scan(&exists); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("lighting rig %d: %w", rigID, sql.ErrNoRows)
		}
		return nil, fmt.Errorf("bulk create fixtures: %w", err)
	}

	var nextPosition, nextAddress int
	if err := tx.QueryRow(`SELECT COALESCE(MAX(position_index), 0) + 1 FROM lighting_fixtures WHERE rig_id = ?`, rigID).Scan(&nextPosition); err != nil {
		return nil, fmt.Errorf("bulk create fixtures: %w", err)
	}
	if err := tx.QueryRow(`SELECT COALESCE(MAX(dmx_start_address + dmx_channel_count), 1) FROM lighting_fixtures WHERE rig_id = ? AND dmx_universe = ? AND dmx_start_address IS NOT NULL`, rigID, universe).Scan(&nextAddress); err != nil {
		return nil, fmt.Errorf("bulk create fixtures: %w", err)
	}
	if nextAddress+req.Quantity*channelCount-1 > 512 {
		return nil, fmt.Errorf("%w: universe %d", ErrUniverseFull, universe)
	}

	for i := 0; i < req.Quantity; i++ {
		var number *int
		if req.FixtureNumberStart != nil {
			v := *req.FixtureNumberStart + i
			number = &v
		}
		if _, err := tx.Exec(`INSERT INTO lighting_fixtures (rig_id, fixture_number, inventory_item_id, position_index, power_connection, power_connector_in, dmx_universe, dmx_start_address, dmx_channel_mode, dmx_channel_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			rigID, nullInt(number), req.InventoryItemID, nextPosition+i, req.PowerConnection, req.PowerConnectorIn, universe, nextAddress+i*channelCount, nullString(req.DMXChannelMode), channelCount); err != nil {
			return nil, fmt.Errorf("bulk create fixtures: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("bulk create fixtures: %w", err)
	}
	return ListLightingFixtures(db, rigID)
}
