package db

import (
	"database/sql"
	"io"
	"log/slog"
	"testing"
)

func trussMigrationLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func trussMigrationEvent(t *testing.T, database *sql.DB, name string) int64 {
	t.Helper()
	result, err := database.Exec(`INSERT INTO events (name) VALUES (?)`, name)
	if err != nil {
		t.Fatalf("insert event: %v", err)
	}
	id, _ := result.LastInsertId()
	return id
}

func trussMigrationRig(t *testing.T, database *sql.DB, eventID int64) int64 {
	t.Helper()
	result, err := database.Exec(`INSERT INTO lighting_rigs (event_id, name) VALUES (?, 'Rig')`, eventID)
	if err != nil {
		t.Fatalf("insert rig: %v", err)
	}
	id, _ := result.LastInsertId()
	return id
}

// TestConvertTrussSections seeds every legacy shape against the pre-033
// schema (truss_sections still present) and asserts the carried-over
// plot trusses per research.md R5: names kept, lengths converted to a
// single label-only piece, fixtures attached with unknown offsets, and
// zero rental impact (no piece ever carries an inventory link).
func TestConvertTrussSections(t *testing.T) {
	database := openMigratedTo(t, 32)
	eventID := trussMigrationEvent(t, database, "Gig A")
	rigID := trussMigrationRig(t, database, eventID)
	otherEventID := trussMigrationEvent(t, database, "Gig B")
	otherRigID := trussMigrationRig(t, database, otherEventID)

	// (a) A section with length and two fixtures.
	sectionA, err := database.Exec(`INSERT INTO truss_sections (rig_id, name, length_m, truss_type) VALUES (?, 'Front', 6, 'box')`, rigID)
	if err != nil {
		t.Fatalf("insert section A: %v", err)
	}
	sectionAID, _ := sectionA.LastInsertId()
	for _, name := range []string{"Spot 1", "Spot 2"} {
		if _, err := database.Exec(`INSERT INTO lighting_fixtures (rig_id, truss_section_id, custom_name, power_connector_in, dmx_universe, dmx_channel_count)
			VALUES (?, ?, ?, 'schuko', 1, 16)`, rigID, sectionAID, name); err != nil {
			t.Fatalf("insert fixture %s: %v", name, err)
		}
	}
	// (b) A zero-length section (length unknown) with no fixtures.
	if _, err := database.Exec(`INSERT INTO truss_sections (rig_id, name, truss_type) VALUES (?, 'Side sticks', 'ladder')`, rigID); err != nil {
		t.Fatalf("insert section B: %v", err)
	}
	// (c) A section on a different event's rig.
	if _, err := database.Exec(`INSERT INTO truss_sections (rig_id, name, length_m, truss_type) VALUES (?, 'Back', 4, 'box')`, otherRigID); err != nil {
		t.Fatalf("insert section C: %v", err)
	}
	// An unattached fixture must stay unattached.
	if _, err := database.Exec(`INSERT INTO lighting_fixtures (rig_id, custom_name, power_connector_in, dmx_universe, dmx_channel_count)
		VALUES (?, 'Blinder', 'schuko', 2, 4)`, rigID); err != nil {
		t.Fatalf("insert loose fixture: %v", err)
	}

	if err := convertTrussSectionsToPlotTrusses(database, trussMigrationLogger()); err != nil {
		t.Fatalf("convert: %v", err)
	}

	// Event A: two trusses (Front + Side sticks), correctly shaped.
	trusses, err := ListPlotTrusses(database, eventID)
	if err != nil {
		t.Fatalf("list trusses: %v", err)
	}
	if len(trusses) != 2 {
		t.Fatalf("event A trusses = %d, want 2", len(trusses))
	}
	front := trusses[0]
	if front.Name != "Front" || front.TotalLengthCm != 600 {
		t.Errorf("front truss: %+v", front)
	}
	if len(front.Pieces) != 1 || front.Pieces[0].InventoryItemID != nil || front.Pieces[0].Label != "Front (box)" || front.Pieces[0].LengthCm != 600 {
		t.Errorf("front piece: %+v", front.Pieces)
	}
	if len(front.Fixtures) != 2 {
		t.Fatalf("front fixtures = %d, want 2", len(front.Fixtures))
	}
	for _, fixture := range front.Fixtures {
		if fixture.OffsetCm != nil {
			t.Errorf("converted fixture has an invented offset: %+v", fixture)
		}
	}
	sticks := trusses[1]
	if sticks.Name != "Side sticks" || len(sticks.Pieces) != 0 || sticks.TotalLengthCm != 0 {
		t.Errorf("zero-length section must convert without a piece: %+v", sticks)
	}

	// Event B got its own truss — event scoping preserved.
	otherTrusses, err := ListPlotTrusses(database, otherEventID)
	if err != nil || len(otherTrusses) != 1 || otherTrusses[0].Name != "Back" || otherTrusses[0].TotalLengthCm != 400 {
		t.Fatalf("event B trusses wrong: %+v (%v)", otherTrusses, err)
	}

	// Sections are consumed; the loose fixture stays unattached.
	var remaining int
	if err := database.QueryRow(`SELECT COUNT(*) FROM truss_sections`).Scan(&remaining); err != nil || remaining != 0 {
		t.Errorf("truss_sections not consumed: %d (%v)", remaining, err)
	}
	var attached int
	if err := database.QueryRow(`SELECT COUNT(*) FROM stage_plot_truss_fixtures`).Scan(&attached); err != nil || attached != 2 {
		t.Errorf("attachments = %d, want 2 (Spot 1 + Spot 2; the loose Blinder stays unattached)", attached)
	}

	// Zero rental impact: no converted piece carries an inventory link.
	var billing int
	if err := database.QueryRow(`SELECT COUNT(*) FROM stage_plot_truss_pieces WHERE inventory_item_id IS NOT NULL`).Scan(&billing); err != nil || billing != 0 {
		t.Errorf("conversion created billable pieces: %d", billing)
	}

	// Idempotence: a second run is a no-op.
	if err := convertTrussSectionsToPlotTrusses(database, trussMigrationLogger()); err != nil {
		t.Fatalf("re-run: %v", err)
	}
	if trusses, _ := ListPlotTrusses(database, eventID); len(trusses) != 2 {
		t.Errorf("re-run duplicated trusses: %d", len(trusses))
	}
}

// TestConvertTrussSectionsNoop covers the guard: on a database already
// past migration 033 (table gone) the conversion is a silent no-op —
// which is what makes calling it on every startup safe.
func TestConvertTrussSectionsNoop(t *testing.T) {
	database := openTestDB(t) // fully migrated: truss_sections dropped
	if err := convertTrussSectionsToPlotTrusses(database, trussMigrationLogger()); err != nil {
		t.Fatalf("no-op run errored: %v", err)
	}
}
