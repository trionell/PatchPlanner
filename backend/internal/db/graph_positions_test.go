package db

import (
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// TestStageboxStageMultiPositionsIndependentPerGraph covers a bug found
// via manual use: a Stagebox/Stage-Multi is a shared node between the
// Output graph (position_x/position_y) and the Input graph
// (input_position_x/input_position_y) — moving it in one graph must never
// move it in the other.
func TestStageboxStageMultiPositionsIndependentPerGraph(t *testing.T) {
	database := openTestDB(t)
	eventID := createTestEvent(t, database)

	sb, err := CreateStagebox(database, domain.Stagebox{EventID: eventID, Name: "SB1", ConnectionType: "analog", InputCount: 8, OutputCount: 8})
	if err != nil {
		t.Fatalf("create stagebox: %v", err)
	}
	sm, err := CreateStageMulti(database, domain.StageMulti{EventID: eventID, Name: "Multi 1", Channels: 24, ConnectorType: "xlr"})
	if err != nil {
		t.Fatalf("create stage multi: %v", err)
	}

	// Move the stagebox in the Output graph only.
	sb.PositionX, sb.PositionY = 100, 200
	updatedSb, err := UpdateStagebox(database, sb.ID, sb)
	if err != nil {
		t.Fatalf("update stagebox output position: %v", err)
	}
	if updatedSb.InputPositionX != 0 || updatedSb.InputPositionY != 0 {
		t.Errorf("stagebox input-graph position changed by an output-graph move: %+v", updatedSb)
	}

	// Move it in the Input graph only.
	updatedSb.InputPositionX, updatedSb.InputPositionY = 50, 75
	updatedSb2, err := UpdateStagebox(database, sb.ID, updatedSb)
	if err != nil {
		t.Fatalf("update stagebox input position: %v", err)
	}
	if updatedSb2.PositionX != 100 || updatedSb2.PositionY != 200 {
		t.Errorf("stagebox output-graph position changed by an input-graph move: %+v", updatedSb2)
	}
	if updatedSb2.InputPositionX != 50 || updatedSb2.InputPositionY != 75 {
		t.Errorf("stagebox input-graph position not saved: %+v", updatedSb2)
	}

	// Same independence check for a stage multi.
	sm.PositionX, sm.PositionY = 10, 20
	updatedSm, err := UpdateStageMulti(database, sm.ID, sm)
	if err != nil {
		t.Fatalf("update stage multi output position: %v", err)
	}
	updatedSm.InputPositionX, updatedSm.InputPositionY = 30, 40
	updatedSm2, err := UpdateStageMulti(database, sm.ID, updatedSm)
	if err != nil {
		t.Fatalf("update stage multi input position: %v", err)
	}
	if updatedSm2.PositionX != 10 || updatedSm2.PositionY != 20 {
		t.Errorf("stage multi output-graph position changed by an input-graph move: %+v", updatedSm2)
	}
	if updatedSm2.InputPositionX != 30 || updatedSm2.InputPositionY != 40 {
		t.Errorf("stage multi input-graph position not saved: %+v", updatedSm2)
	}
}
