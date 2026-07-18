package db

import (
	"database/sql"
	"errors"
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

// TestAutoAssignDMXRespectsUniverses verifies addresses are assigned per
// universe in position order, without moving fixtures between universes.
func TestAutoAssignDMXRespectsUniverses(t *testing.T) {
	database := openTestDB(t)
	eventID := createTestEvent(t, database)
	rig, err := GetOrCreateDefaultLightingRig(database, eventID)
	if err != nil {
		t.Fatalf("create rig: %v", err)
	}

	createTestFixture(t, database, rig.ID, 1, 1, 16)
	createTestFixture(t, database, rig.ID, 2, 2, 8)
	createTestFixture(t, database, rig.ID, 3, 1, 4)

	fixtures, err := AutoAssignDMX(database, rig.ID)
	if err != nil {
		t.Fatalf("auto assign: %v", err)
	}
	type key struct{ universe, position int }
	got := make(map[key]int)
	for _, fixture := range fixtures {
		if fixture.DMXStartAddress == nil {
			t.Fatalf("fixture at position %d has no address", fixture.PositionIndex)
		}
		got[key{fixture.DMXUniverse, fixture.PositionIndex}] = *fixture.DMXStartAddress
	}
	want := map[key]int{
		{1, 1}: 1,  // universe 1: 16ch from 1
		{1, 3}: 17, // universe 1: next fixture from 17
		{2, 2}: 1,  // universe 2 starts fresh at 1
	}
	for k, address := range want {
		if got[k] != address {
			t.Errorf("universe %d position %d: address %d, want %d", k.universe, k.position, got[k], address)
		}
	}
}

// TestAutoAssignDMXUniverseOverflow verifies a universe needing >512 channels
// fails with ErrUniverseFull and assigns nothing.
func TestAutoAssignDMXUniverseOverflow(t *testing.T) {
	database := openTestDB(t)
	eventID := createTestEvent(t, database)
	rig, err := GetOrCreateDefaultLightingRig(database, eventID)
	if err != nil {
		t.Fatalf("create rig: %v", err)
	}
	createTestFixture(t, database, rig.ID, 1, 1, 400)
	createTestFixture(t, database, rig.ID, 2, 1, 200)

	if _, err := AutoAssignDMX(database, rig.ID); !errors.Is(err, ErrUniverseFull) {
		t.Fatalf("got err %v, want ErrUniverseFull", err)
	}
	fixtures, err := ListLightingFixtures(database, rig.ID)
	if err != nil {
		t.Fatalf("list fixtures: %v", err)
	}
	for _, fixture := range fixtures {
		if fixture.DMXStartAddress != nil {
			t.Errorf("fixture at position %d was assigned despite overflow (rollback expected)", fixture.PositionIndex)
		}
	}
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
	if err := AttachPlotTrussFixture(database, truss.ID, fixture.ID, &offset); err != nil {
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
	if err := AttachPlotTrussFixture(database, truss.ID, fixture.ID, nil); err != nil {
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
	child.DMXChainParentID = &parent.ID
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
