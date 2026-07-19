package db

import (
	"database/sql"
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
)

// Plot trusses are event-scoped (research.md R4): declared once per
// event, placed on plots by reference, counted once per event on the
// rental order regardless of how many plots show them.

func ListPlotTrusses(db *sql.DB, eventID int64) ([]domain.PlotTruss, error) {
	rows, err := db.Query(`SELECT id, event_id, name, height_cm FROM stage_plot_trusses WHERE event_id = ? ORDER BY id ASC`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list plot trusses: %w", err)
	}
	defer rows.Close()
	trusses := make([]domain.PlotTruss, 0)
	for rows.Next() {
		var truss domain.PlotTruss
		if err := rows.Scan(&truss.ID, &truss.EventID, &truss.Name, &truss.HeightCm); err != nil {
			return nil, fmt.Errorf("scan plot truss: %w", err)
		}
		trusses = append(trusses, truss)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range trusses {
		if err := fillPlotTruss(db, &trusses[i]); err != nil {
			return nil, err
		}
	}
	return trusses, nil
}

func GetPlotTruss(db *sql.DB, eventID, trussID int64) (domain.PlotTruss, error) {
	var truss domain.PlotTruss
	err := db.QueryRow(`SELECT id, event_id, name, height_cm FROM stage_plot_trusses WHERE id = ? AND event_id = ?`, trussID, eventID).
		Scan(&truss.ID, &truss.EventID, &truss.Name, &truss.HeightCm)
	if err != nil {
		return domain.PlotTruss{}, fmt.Errorf("get plot truss: %w", err)
	}
	if err := fillPlotTruss(db, &truss); err != nil {
		return domain.PlotTruss{}, err
	}
	return truss, nil
}

// fillPlotTruss loads pieces (with catalog names) and attached fixtures
// (with FID/DMX for label composition), and derives the total length.
func fillPlotTruss(db *sql.DB, truss *domain.PlotTruss) error {
	truss.Pieces = make([]domain.PlotTrussPiece, 0)
	truss.Fixtures = make([]domain.PlotTrussFixture, 0)
	truss.TotalLengthCm = 0

	rows, err := db.Query(`SELECT p.id, p.truss_id, p.inventory_item_id, COALESCE(i.name, ''), p.label, p.length_cm, p.sort_order
		FROM stage_plot_truss_pieces p
		LEFT JOIN inventory_items i ON i.id = p.inventory_item_id
		WHERE p.truss_id = ? ORDER BY p.sort_order ASC, p.id ASC`, truss.ID)
	if err != nil {
		return fmt.Errorf("list truss pieces: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var piece domain.PlotTrussPiece
		var itemID sql.NullInt64
		if err := rows.Scan(&piece.ID, &piece.TrussID, &itemID, &piece.ItemName, &piece.Label, &piece.LengthCm, &piece.SortOrder); err != nil {
			return fmt.Errorf("scan truss piece: %w", err)
		}
		piece.InventoryItemID = int64PtrFromNull(itemID)
		truss.Pieces = append(truss.Pieces, piece)
		truss.TotalLengthCm += piece.LengthCm
	}
	if err := rows.Err(); err != nil {
		return err
	}

	fixtureRows, err := db.Query(`SELECT tf.id, tf.truss_id, tf.fixture_id, tf.offset_cm, tf.side,
			f.fixture_number, COALESCE(NULLIF(f.custom_name, ''), i.name, 'Fixture'), COALESCE(f.dmx_universe, 1), f.dmx_start_address
		FROM stage_plot_truss_fixtures tf
		JOIN lighting_fixtures f ON f.id = tf.fixture_id
		LEFT JOIN inventory_items i ON i.id = f.inventory_item_id
		WHERE tf.truss_id = ? ORDER BY tf.offset_cm ASC NULLS LAST, tf.id ASC`, truss.ID)
	if err != nil {
		return fmt.Errorf("list truss fixtures: %w", err)
	}
	defer fixtureRows.Close()
	for fixtureRows.Next() {
		var fixture domain.PlotTrussFixture
		var offset sql.NullFloat64
		var fixtureNumber, dmxAddress sql.NullInt64
		if err := fixtureRows.Scan(&fixture.ID, &fixture.TrussID, &fixture.FixtureID, &offset, &fixture.Side,
			&fixtureNumber, &fixture.FixtureName, &fixture.DMXUniverse, &dmxAddress); err != nil {
			return fmt.Errorf("scan truss fixture: %w", err)
		}
		if offset.Valid {
			v := offset.Float64
			fixture.OffsetCm = &v
		}
		fixture.FixtureNumber = intPtrFromNull(fixtureNumber)
		fixture.DMXStartAddress = intPtrFromNull(dmxAddress)
		truss.Fixtures = append(truss.Fixtures, fixture)
	}
	return fixtureRows.Err()
}

func CreatePlotTruss(db *sql.DB, eventID int64, name string, heightCm float64) (domain.PlotTruss, error) {
	result, err := db.Exec(`INSERT INTO stage_plot_trusses (event_id, name, height_cm) VALUES (?, ?, ?)`, eventID, name, heightCm)
	if err != nil {
		return domain.PlotTruss{}, fmt.Errorf("create plot truss: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.PlotTruss{}, err
	}
	return GetPlotTruss(db, eventID, id)
}

func UpdatePlotTruss(db *sql.DB, eventID, trussID int64, name string, heightCm float64) error {
	_, err := db.Exec(`UPDATE stage_plot_trusses SET name = ?, height_cm = ? WHERE id = ? AND event_id = ?`, name, heightCm, trussID, eventID)
	if err != nil {
		return fmt.Errorf("update plot truss: %w", err)
	}
	return nil
}

// DeletePlotTruss cascades pieces, fixture attachments, and placements;
// the rig fixtures themselves are untouched (US5-AC4).
func DeletePlotTruss(db *sql.DB, eventID, trussID int64) error {
	_, err := db.Exec(`DELETE FROM stage_plot_trusses WHERE id = ? AND event_id = ?`, trussID, eventID)
	if err != nil {
		return fmt.Errorf("delete plot truss: %w", err)
	}
	return nil
}

// ---- Pieces ----

func CreatePlotTrussPiece(db *sql.DB, trussID int64, inventoryItemID *int64, label string, lengthCm float64) (int64, error) {
	var maxSort sql.NullInt64
	if err := db.QueryRow(`SELECT MAX(sort_order) FROM stage_plot_truss_pieces WHERE truss_id = ?`, trussID).Scan(&maxSort); err != nil {
		return 0, fmt.Errorf("next piece sort order: %w", err)
	}
	result, err := db.Exec(`INSERT INTO stage_plot_truss_pieces (truss_id, inventory_item_id, label, length_cm, sort_order) VALUES (?, ?, ?, ?, ?)`,
		trussID, nullInt64(inventoryItemID), label, lengthCm, maxSort.Int64+1)
	if err != nil {
		return 0, fmt.Errorf("create truss piece: %w", err)
	}
	return result.LastInsertId()
}

func GetPlotTrussPiece(db *sql.DB, trussID, pieceID int64) (domain.PlotTrussPiece, error) {
	var piece domain.PlotTrussPiece
	var itemID sql.NullInt64
	err := db.QueryRow(`SELECT id, truss_id, inventory_item_id, label, length_cm, sort_order
		FROM stage_plot_truss_pieces WHERE id = ? AND truss_id = ?`, pieceID, trussID).
		Scan(&piece.ID, &piece.TrussID, &itemID, &piece.Label, &piece.LengthCm, &piece.SortOrder)
	if err != nil {
		return domain.PlotTrussPiece{}, fmt.Errorf("get truss piece: %w", err)
	}
	piece.InventoryItemID = int64PtrFromNull(itemID)
	return piece, nil
}

func UpdatePlotTrussPiece(db *sql.DB, piece domain.PlotTrussPiece) error {
	_, err := db.Exec(`UPDATE stage_plot_truss_pieces SET inventory_item_id = ?, label = ?, length_cm = ?, sort_order = ? WHERE id = ?`,
		nullInt64(piece.InventoryItemID), piece.Label, piece.LengthCm, piece.SortOrder, piece.ID)
	if err != nil {
		return fmt.Errorf("update truss piece: %w", err)
	}
	return nil
}

func DeletePlotTrussPiece(db *sql.DB, trussID, pieceID int64) error {
	_, err := db.Exec(`DELETE FROM stage_plot_truss_pieces WHERE id = ? AND truss_id = ?`, pieceID, trussID)
	if err != nil {
		return fmt.Errorf("delete truss piece: %w", err)
	}
	return nil
}

// ---- Fixture attachments ----

// AttachPlotTrussFixture attaches (or moves) a fixture onto the truss at
// an offset and side lane. UNIQUE(fixture_id) means re-attaching from
// another truss is an upsert-style move — a fixture hangs on at most one
// truss.
func AttachPlotTrussFixture(db *sql.DB, trussID, fixtureID int64, offsetCm *float64, side string) error {
	var offset sql.NullFloat64
	if offsetCm != nil {
		offset = sql.NullFloat64{Float64: *offsetCm, Valid: true}
	}
	_, err := db.Exec(`INSERT INTO stage_plot_truss_fixtures (truss_id, fixture_id, offset_cm, side) VALUES (?, ?, ?, ?)
		ON CONFLICT(fixture_id) DO UPDATE SET truss_id = excluded.truss_id, offset_cm = excluded.offset_cm, side = excluded.side`,
		trussID, fixtureID, offset, side)
	if err != nil {
		return fmt.Errorf("attach truss fixture: %w", err)
	}
	return nil
}

func DetachPlotTrussFixture(db *sql.DB, trussID, fixtureID int64) error {
	_, err := db.Exec(`DELETE FROM stage_plot_truss_fixtures WHERE truss_id = ? AND fixture_id = ?`, trussID, fixtureID)
	if err != nil {
		return fmt.Errorf("detach truss fixture: %w", err)
	}
	return nil
}
