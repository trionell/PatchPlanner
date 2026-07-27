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
		SELECT f.id, f.rig_id, f.fixture_number, f.inventory_item_id, COALESCE(i.name, ''), COALESCE(f.custom_name, ''), COALESCE(f.position_index, 0), COALESCE(f.power_connection, 'grid'), f.power_chain_parent_id, COALESCE(f.power_connector_in, 'schuko'), COALESCE(f.power_connector_out, ''), COALESCE(f.dmx_universe, 1), f.dmx_start_address, COALESCE(f.dmx_channel_mode, ''), COALESCE(f.dmx_channel_count, 0), COALESCE(f.notes, ''), COALESCE(pt.name, ''), tf.offset_cm
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
		SELECT f.id, f.rig_id, f.fixture_number, f.inventory_item_id, COALESCE(i.name, ''), COALESCE(f.custom_name, ''), COALESCE(f.position_index, 0), COALESCE(f.power_connection, 'grid'), f.power_chain_parent_id, COALESCE(f.power_connector_in, 'schuko'), COALESCE(f.power_connector_out, ''), COALESCE(f.dmx_universe, 1), f.dmx_start_address, COALESCE(f.dmx_channel_mode, ''), COALESCE(f.dmx_channel_count, 0), COALESCE(f.notes, ''), COALESCE(pt.name, ''), tf.offset_cm
		FROM lighting_fixtures f
		LEFT JOIN inventory_items i ON i.id = f.inventory_item_id
		LEFT JOIN stage_plot_truss_fixtures tf ON tf.fixture_id = f.id
		LEFT JOIN stage_plot_trusses pt ON pt.id = tf.truss_id
		WHERE f.id = ?`, id)
	return scanLightingFixture(row)
}

func CreateLightingFixture(db *sql.DB, fixture domain.LightingFixture) (domain.LightingFixture, error) {
	result, err := db.Exec(`INSERT INTO lighting_fixtures (rig_id, fixture_number, inventory_item_id, custom_name, position_index, power_connection, power_chain_parent_id, power_connector_in, power_connector_out, dmx_universe, dmx_start_address, dmx_channel_mode, dmx_channel_count, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, fixture.RigID, nullInt(fixture.FixtureNumber), nullInt64(fixture.InventoryItemID), nullString(fixture.CustomName), fixture.PositionIndex, fixture.PowerConnection, nullInt64(fixture.PowerChainParentID), fixture.PowerConnectorIn, nullString(fixture.PowerConnectorOut), fixture.DMXUniverse, nullInt(fixture.DMXStartAddress), nullString(fixture.DMXChannelMode), fixture.DMXChannelCount, nullString(fixture.Notes))
	if err != nil {
		return domain.LightingFixture{}, fmt.Errorf("create lighting fixture: %w", err)
	}
	id, _ := result.LastInsertId()
	return GetLightingFixture(db, id)
}

func UpdateLightingFixture(db *sql.DB, id int64, fixture domain.LightingFixture) (domain.LightingFixture, error) {
	_, err := db.Exec(`UPDATE lighting_fixtures SET fixture_number = ?, inventory_item_id = ?, custom_name = ?, position_index = ?, power_connection = ?, power_chain_parent_id = ?, power_connector_in = ?, power_connector_out = ?, dmx_universe = ?, dmx_start_address = ?, dmx_channel_mode = ?, dmx_channel_count = ?, notes = ? WHERE id = ?`, nullInt(fixture.FixtureNumber), nullInt64(fixture.InventoryItemID), nullString(fixture.CustomName), fixture.PositionIndex, fixture.PowerConnection, nullInt64(fixture.PowerChainParentID), fixture.PowerConnectorIn, nullString(fixture.PowerConnectorOut), fixture.DMXUniverse, nullInt(fixture.DMXStartAddress), nullString(fixture.DMXChannelMode), fixture.DMXChannelCount, nullString(fixture.Notes), id)
	if err != nil {
		return domain.LightingFixture{}, fmt.Errorf("update lighting fixture: %w", err)
	}
	return GetLightingFixture(db, id)
}

// DeleteLightingFixture detaches any fixtures chained off this one before
// removing it, so power chains stay valid and the FK constraints hold.
func DeleteLightingFixture(db *sql.DB, id int64) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("delete lighting fixture: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE lighting_fixtures SET power_chain_parent_id = NULL WHERE power_chain_parent_id = ?`, id); err != nil {
		return fmt.Errorf("clear power chain references: %w", err)
	}
	if err := clearStagePlotLinksTo(tx, "lighting_fixture", id); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM lighting_fixtures WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete lighting fixture: %w", err)
	}
	return tx.Commit()
}

// ErrUniverseFull is returned when a batch needs more than the 512 available
// DMX channels of one universe.
var ErrUniverseFull = errors.New("dmx universe exceeds 512 channels")

// MaxAddressChanges bounds one address write. A rig of two hundred fixtures is
// the upper end this tool is designed for, so this is a guard against a
// malformed body rather than a policy about rig size.
const MaxAddressChanges = 500

// UpdateFixtureAddresses applies a list of address changes to one rig, whole or
// not at all (Slice 27).
//
// This replaces AutoAssignDMX, which computed addresses as well as writing them.
// Auto-assign, optimise and make room are now all planned in the browser, where
// the DMX map already has to exist for the sheet, the strip, the drawer and the
// collision prompt — so the rule that groups move whole and nothing leaves its
// universe lives in one language instead of two (specs/027 research.md R3).
//
// What is left here is the half a database is actually good for: this function
// has no opinion about whether an address is *good*, and every caller gets the
// guarantee that a rig is never found half-shifted.
func UpdateFixtureAddresses(db *sql.DB, rigID int64, changes []domain.AddressChange) ([]domain.LightingFixture, error) {
	tx, err := db.Begin()
	if err != nil {
		return nil, fmt.Errorf("update fixture addresses: %w", err)
	}
	defer tx.Rollback()

	for _, change := range changes {
		result, err := tx.Exec(
			`UPDATE lighting_fixtures SET dmx_universe = ?, dmx_start_address = ? WHERE id = ? AND rig_id = ?`,
			change.DMXUniverse, change.DMXStartAddress, change.FixtureID, rigID)
		if err != nil {
			return nil, fmt.Errorf("update fixture addresses: %w", err)
		}
		// A fixture that is not in this rig is a caller error, not a no-op: the
		// alternative is a partially-applied plan reported as a success.
		if affected, err := result.RowsAffected(); err != nil {
			return nil, fmt.Errorf("update fixture addresses: %w", err)
		} else if affected == 0 {
			return nil, fmt.Errorf("fixture %d: %w", change.FixtureID, sql.ErrNoRows)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("update fixture addresses: %w", err)
	}
	return ListLightingFixtures(db, rigID)
}

func scanLightingFixture(row scanner) (domain.LightingFixture, error) {
	var fixture domain.LightingFixture
	var fixtureNumber, inventoryItemID, powerChainParentID, dmxStartAddress sql.NullInt64
	var trussOffset sql.NullFloat64
	if err := row.Scan(&fixture.ID, &fixture.RigID, &fixtureNumber, &inventoryItemID, &fixture.InventoryItemName, &fixture.CustomName, &fixture.PositionIndex, &fixture.PowerConnection, &powerChainParentID, &fixture.PowerConnectorIn, &fixture.PowerConnectorOut, &fixture.DMXUniverse, &dmxStartAddress, &fixture.DMXChannelMode, &fixture.DMXChannelCount, &fixture.Notes, &fixture.TrussName, &trussOffset); err != nil {
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
	return fixture, nil
}

// BulkCreateLightingFixtures creates one batch of fixtures in a single
// transaction: positions appended after the rig's highest, fixture numbers
// incrementing from the optional start, existing fixtures never touched.
// All-or-nothing: ErrUniverseFull (or any failure) creates zero fixtures.
// Returns sql.ErrNoRows (wrapped) when the rig does not exist.
//
// Slice 27 gave it the three things the merged add editor needs (US3):
//
//   - a batch with no catalog model, so a custom fixture can be created in
//     quantity as well as singly;
//   - NameStem, naming the batch "<stem> 1" … "<stem> N";
//   - ShareAddress, putting the whole batch on one address as one shared
//     group — twenty pars washing a room take seven channels, not a hundred
//     and forty, and that is the ordinary way to rig them.
//
// DMXStartAddress is the client's, picked from the universe's free runs. Absent,
// the old behaviour stands and the batch is appended after the highest address
// in use. The arithmetic here is start + i×count and nothing more: the
// group-aware packing lives in the browser (research.md R3, R12).
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
	if req.DMXStartAddress != nil && *req.DMXStartAddress >= 1 {
		nextAddress = *req.DMXStartAddress
	}

	// A shared batch is one block wide however many fixtures are in it — which
	// is the point of sharing, and would read as a false overflow if the guard
	// still multiplied by the quantity.
	width := req.Quantity * channelCount
	if req.ShareAddress {
		width = channelCount
	}
	if nextAddress+width-1 > 512 {
		return nil, fmt.Errorf("%w: universe %d", ErrUniverseFull, universe)
	}

	for i := 0; i < req.Quantity; i++ {
		var number *int
		if req.FixtureNumberStart != nil {
			v := *req.FixtureNumberStart + i
			number = &v
		}
		// Console IDs still increment for a shared batch: twenty pars on one
		// address are still twenty fixtures on the console.
		address := nextAddress
		if !req.ShareAddress {
			address = nextAddress + i*channelCount
		}
		// A batch of one is named exactly what was typed; only a real batch
		// gets numbered, because "Haze 1" is not what anyone meant by adding
		// one haze machine called Haze.
		var name string
		if req.NameStem != "" {
			if req.Quantity > 1 {
				name = fmt.Sprintf("%s %d", req.NameStem, i+1)
			} else {
				name = req.NameStem
			}
		}
		if _, err := tx.Exec(`INSERT INTO lighting_fixtures (rig_id, fixture_number, inventory_item_id, custom_name, position_index, power_connection, power_connector_in, dmx_universe, dmx_start_address, dmx_channel_mode, dmx_channel_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			rigID, nullInt(number), nullInt64(req.InventoryItemID), nullString(name), nextPosition+i, req.PowerConnection, req.PowerConnectorIn, universe, address, nullString(req.DMXChannelMode), channelCount); err != nil {
			return nil, fmt.Errorf("bulk create fixtures: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("bulk create fixtures: %w", err)
	}
	return ListLightingFixtures(db, rigID)
}
