package db

import (
	"database/sql"
	"errors"
	"fmt"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

func createTestFixture(t *testing.T, database *sql.DB, rigID int64, position, universe, channels int) domain.LightingFixture {
	t.Helper()
	fixture, err := CreateLightingFixture(database, domain.LightingFixture{
		RigID:            rigID,
		PositionIndex:    position,
		PowerConnection:  "grid",
		PowerConnectorIn: "schuko",
		DMXUniverse:      universe,
		DMXChannelCount:  channels,
	})
	if err != nil {
		t.Fatalf("create fixture: %v", err)
	}
	return fixture
}

// TestUpdateFixtureAddressesAppliesWhole covers the guarantee this endpoint
// exists for: a planned list of address changes lands completely.
//
// The *arithmetic* that produced the list is not tested here and cannot be —
// it lives in the browser, in lib/dmxPlan.ts, where the DMX map already has to
// exist for the sheet and the strip. What Go owns is that a rig is never found
// half-shifted (specs/027 research.md R3).
func TestUpdateFixtureAddressesAppliesWhole(t *testing.T) {
	database := openTestDB(t)
	eventID := createTestEvent(t, database)
	rig, err := GetOrCreateDefaultLightingRig(database, eventID)
	if err != nil {
		t.Fatalf("create rig: %v", err)
	}
	a := createTestFixture(t, database, rig.ID, 1, 1, 16)
	b := createTestFixture(t, database, rig.ID, 2, 2, 8)

	fixtures, err := UpdateFixtureAddresses(database, rig.ID, []domain.AddressChange{
		{FixtureID: a.ID, DMXUniverse: 1, DMXStartAddress: 33},
		{FixtureID: b.ID, DMXUniverse: 2, DMXStartAddress: 1},
	})
	if err != nil {
		t.Fatalf("update addresses: %v", err)
	}
	got := make(map[int64]int)
	for _, fixture := range fixtures {
		if fixture.DMXStartAddress != nil {
			got[fixture.ID] = *fixture.DMXStartAddress
		}
	}
	if got[a.ID] != 33 || got[b.ID] != 1 {
		t.Errorf("addresses not applied: %v", got)
	}
}

// TestUpdateFixtureAddressesRejectsForeignFixture verifies a change naming a
// fixture from another rig applies nothing at all, rather than silently
// applying the rest and reporting success.
func TestUpdateFixtureAddressesRejectsForeignFixture(t *testing.T) {
	database := openTestDB(t)
	eventID := createTestEvent(t, database)
	rig, err := GetOrCreateDefaultLightingRig(database, eventID)
	if err != nil {
		t.Fatalf("create rig: %v", err)
	}
	mine := createTestFixture(t, database, rig.ID, 1, 1, 16)

	otherEvent := createTestEvent(t, database)
	otherRig, err := GetOrCreateDefaultLightingRig(database, otherEvent)
	if err != nil {
		t.Fatalf("create other rig: %v", err)
	}
	theirs := createTestFixture(t, database, otherRig.ID, 1, 1, 16)

	_, err = UpdateFixtureAddresses(database, rig.ID, []domain.AddressChange{
		{FixtureID: mine.ID, DMXUniverse: 1, DMXStartAddress: 100},
		{FixtureID: theirs.ID, DMXUniverse: 1, DMXStartAddress: 200},
	})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("got err %v, want sql.ErrNoRows", err)
	}

	after, err := GetLightingFixture(database, mine.ID)
	if err != nil {
		t.Fatalf("get fixture: %v", err)
	}
	if after.DMXStartAddress != nil {
		t.Errorf("first change survived a failed batch: address %d", *after.DMXStartAddress)
	}
}

// TestBulkCreateSharedAddress covers the three things the merged add editor
// needs from this endpoint (Slice 27 US3): a batch with no catalog model, a
// name stem numbering it, and a whole batch on one address taking one
// fixture's width of the universe rather than the batch's.
func TestBulkCreateSharedAddress(t *testing.T) {
	database := openTestDB(t)
	eventID := createTestEvent(t, database)
	rig, err := GetOrCreateDefaultLightingRig(database, eventID)
	if err != nil {
		t.Fatalf("create rig: %v", err)
	}
	start := 1
	number := 301
	fixtures, err := BulkCreateLightingFixtures(database, rig.ID, domain.BulkFixtureRequest{
		Quantity:           20,
		NameStem:           "Wall wash",
		DMXChannelCount:    7,
		DMXUniverse:        3,
		DMXStartAddress:    &start,
		ShareAddress:       true,
		FixtureNumberStart: &number,
		PowerConnection:    "grid",
		PowerConnectorIn:   "schuko",
	})
	if err != nil {
		t.Fatalf("bulk create: %v", err)
	}
	if len(fixtures) != 20 {
		t.Fatalf("created %d fixtures, want 20", len(fixtures))
	}
	for index, fixture := range fixtures {
		if fixture.DMXStartAddress == nil || *fixture.DMXStartAddress != 1 {
			t.Errorf("fixture %d not on the shared address: %+v", index, fixture.DMXStartAddress)
		}
		if fixture.InventoryItemID != nil {
			t.Errorf("fixture %d got a catalog model it was not given", index)
		}
		if want := "Wall wash " + itoa(index+1); fixture.CustomName != want {
			t.Errorf("fixture %d named %q, want %q", index, fixture.CustomName, want)
		}
		// Console IDs still increment: twenty pars on one address are still
		// twenty fixtures on the desk.
		if fixture.FixtureNumber == nil || *fixture.FixtureNumber != 301+index {
			t.Errorf("fixture %d console id %v, want %d", index, fixture.FixtureNumber, 301+index)
		}
	}
}

// TestBulkCreateSharedAddressFitsWhereConsecutiveWouldNot is the point of
// sharing: twenty seven-channel fixtures need seven channels, not a hundred
// and forty, so a batch that would overflow consecutively fits shared.
func TestBulkCreateSharedAddressFitsWhereConsecutiveWouldNot(t *testing.T) {
	database := openTestDB(t)
	eventID := createTestEvent(t, database)
	rig, err := GetOrCreateDefaultLightingRig(database, eventID)
	if err != nil {
		t.Fatalf("create rig: %v", err)
	}
	start := 500
	request := domain.BulkFixtureRequest{
		Quantity:         20,
		DMXChannelCount:  7,
		DMXUniverse:      1,
		DMXStartAddress:  &start,
		PowerConnection:  "grid",
		PowerConnectorIn: "schuko",
	}
	if _, err := BulkCreateLightingFixtures(database, rig.ID, request); !errors.Is(err, ErrUniverseFull) {
		t.Fatalf("consecutive batch at 500: got %v, want ErrUniverseFull", err)
	}
	request.ShareAddress = true
	if _, err := BulkCreateLightingFixtures(database, rig.ID, request); err != nil {
		t.Fatalf("shared batch at 500 should fit in seven channels: %v", err)
	}
}

func itoa(value int) string {
	return fmt.Sprintf("%d", value)
}

// TestFixtureTrussDisplayDerived covers FR-030: the fixture's truss info
// is read-only, derived from the stage plot truss attachment — present
// with name (and offset when known), empty when unattached, and cleared
// (fixture intact) when the plot truss is deleted.
func TestFixtureTrussDisplayDerived(t *testing.T) {
	database := openTestDB(t)
	eventID := createTestEvent(t, database)
	rig, err := GetOrCreateDefaultLightingRig(database, eventID)
	if err != nil {
		t.Fatalf("create rig: %v", err)
	}
	fixture := createTestFixture(t, database, rig.ID, 1, 1, 8)

	got, err := GetLightingFixture(database, fixture.ID)
	if err != nil {
		t.Fatalf("get fixture: %v", err)
	}
	if got.TrussName != "" || got.TrussOffsetCm != nil {
		t.Errorf("unattached fixture must show no truss: %+v", got)
	}

	truss, err := CreatePlotTruss(database, eventID, "Front truss", 400)
	if err != nil {
		t.Fatalf("create plot truss: %v", err)
	}
	offset := 150.0
	if err := AttachPlotTrussFixture(database, truss.ID, fixture.ID, &offset, "middle"); err != nil {
		t.Fatalf("attach fixture: %v", err)
	}
	got, err = GetLightingFixture(database, fixture.ID)
	if err != nil {
		t.Fatalf("get fixture after attach: %v", err)
	}
	if got.TrussName != "Front truss" || got.TrussOffsetCm == nil || *got.TrussOffsetCm != 150 {
		t.Errorf("attached fixture truss display wrong: %+v", got)
	}

	// Unknown position (legacy conversion) shows the name alone.
	if err := AttachPlotTrussFixture(database, truss.ID, fixture.ID, nil, "middle"); err != nil {
		t.Fatalf("re-attach without offset: %v", err)
	}
	got, _ = GetLightingFixture(database, fixture.ID)
	if got.TrussName != "Front truss" || got.TrussOffsetCm != nil {
		t.Errorf("offset-less attachment wrong: %+v", got)
	}

	if err := DeletePlotTruss(database, eventID, truss.ID); err != nil {
		t.Fatalf("delete plot truss: %v", err)
	}
	got, err = GetLightingFixture(database, fixture.ID)
	if err != nil {
		t.Fatalf("fixture must survive truss deletion: %v", err)
	}
	if got.TrussName != "" {
		t.Errorf("fixture still shows deleted truss: %+v", got)
	}
}

// TestForeignKeysEnforced verifies FK enforcement holds on every pooled
// connection: event deletion cascades, and reference-clearing deletes work.
func TestForeignKeysEnforced(t *testing.T) {
	database := openTestDB(t)
	cat := seedCatalog(t, database)
	eventID := createTestEvent(t, database)

	source := createMicSource(t, database, eventID, &cat.Mic)
	stagebox, err := CreateStagebox(database, domain.Stagebox{EventID: eventID, Name: "SB A", ConnectionType: "analog", InputCount: 8})
	if err != nil {
		t.Fatalf("create stagebox: %v", err)
	}
	cable, err := CreateInputCable(database, domain.InputCable{EventID: eventID, FromKind: "source", FromID: source.ID, FromPort: 0, ToKind: "stagebox", ToID: stagebox.ID, ToPort: 0})
	if err != nil {
		t.Fatalf("link source to stagebox: %v", err)
	}
	rig, err := GetOrCreateDefaultLightingRig(database, eventID)
	if err != nil {
		t.Fatalf("create rig: %v", err)
	}
	parent := createTestFixture(t, database, rig.ID, 1, 1, 8)
	child := createTestFixture(t, database, rig.ID, 2, 1, 8)
	child.PowerChainParentID = &parent.ID
	if _, err := UpdateLightingFixture(database, child.ID, child); err != nil {
		t.Fatalf("chain fixture: %v", err)
	}

	// Deleting a referenced stagebox clears the cable that referenced it
	// first (input_cables is a real table now, not inline columns).
	if err := DeleteStagebox(database, stagebox.ID); err != nil {
		t.Fatalf("delete referenced stagebox: %v", err)
	}
	if _, err := GetInputCable(database, cable.ID); err == nil {
		t.Errorf("input cable still references deleted stagebox")
	}

	// Deleting a chain parent detaches its children.
	if err := DeleteLightingFixture(database, parent.ID); err != nil {
		t.Fatalf("delete chain parent fixture: %v", err)
	}

	// Deleting the event cascades to all planning rows (FK ON on every
	// connection is what makes the declared ON DELETE CASCADE actually run).
	if err := DeleteEvent(database, eventID); err != nil {
		t.Fatalf("delete event: %v", err)
	}
	for name, query := range map[string]string{
		"input channels": `SELECT COUNT(*) FROM input_channels WHERE event_id = ?`,
		"input sources":  `SELECT COUNT(*) FROM input_sources WHERE event_id = ?`,
		"input cables":   `SELECT COUNT(*) FROM input_cables WHERE event_id = ?`,
		"rigs":           `SELECT COUNT(*) FROM lighting_rigs WHERE event_id = ?`,
		"fixtures":       `SELECT COUNT(*) FROM lighting_fixtures WHERE rig_id = ?`,
	} {
		arg := eventID
		if name == "fixtures" {
			arg = rig.ID
		}
		var count int
		if err := database.QueryRow(query, arg).Scan(&count); err != nil {
			t.Fatalf("count %s: %v", name, err)
		}
		if count != 0 {
			t.Errorf("%s not cascaded on event delete: %d rows remain", name, count)
		}
	}
}
