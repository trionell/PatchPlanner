package db

import (
	"database/sql"
	"fmt"
	"log/slog"
)

// convertTrussSectionsToPlotTrusses is the one-time carry-over of the
// Lighting tab's truss_sections into event-scoped plot trusses
// (specs/013-stage-plots/research.md R5) — the third conversion of its
// kind after the output- and input-graph migrations. It is a safe no-op
// once already run: guarded by the table's existence (dropped by
// migration 033 on any subsequent startup) and converted sections are
// deleted as they convert, so a partially-completed run simply resumes.
//
// Conservative by construction (the Slice 6 backfill discipline): each
// section becomes a truss whose single synthesized piece carries the
// section's name/type as a text label and NO inventory link — a NULL
// inventory_item_id contributes nothing to the rental CTE, so this
// conversion can never change any rental total. Legacy trusses start
// billing only when the user re-picks real catalog pieces.
func convertTrussSectionsToPlotTrusses(db *sql.DB, logger *slog.Logger) error {
	var tableExists int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'truss_sections'`).Scan(&tableExists); err != nil {
		return fmt.Errorf("check truss_sections exists: %w", err)
	}
	if tableExists == 0 {
		return nil
	}

	rows, err := db.Query(`SELECT s.id, s.name, COALESCE(s.length_m, 0), COALESCE(s.truss_type, ''), r.event_id
		FROM truss_sections s
		JOIN lighting_rigs r ON r.id = s.rig_id
		ORDER BY s.id`)
	if err != nil {
		return fmt.Errorf("list truss sections: %w", err)
	}
	type legacySection struct {
		ID        int64
		Name      string
		LengthM   float64
		TrussType string
		EventID   int64
	}
	var sections []legacySection
	for rows.Next() {
		var section legacySection
		if err := rows.Scan(&section.ID, &section.Name, &section.LengthM, &section.TrussType, &section.EventID); err != nil {
			rows.Close()
			return fmt.Errorf("scan truss section: %w", err)
		}
		sections = append(sections, section)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, section := range sections {
		if err := convertOneTrussSection(db, section.ID, section.Name, section.LengthM, section.TrussType, section.EventID, logger); err != nil {
			return fmt.Errorf("convert truss section %d: %w", section.ID, err)
		}
	}
	return nil
}

// convertOneTrussSection converts and deletes one section in a single
// transaction — the delete is what makes the whole conversion resumable
// and idempotent: an already-converted section no longer exists.
func convertOneTrussSection(db *sql.DB, sectionID int64, name string, lengthM float64, trussType string, eventID int64, logger *slog.Logger) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	result, err := tx.Exec(`INSERT INTO stage_plot_trusses (event_id, name, height_cm) VALUES (?, ?, 0)`, eventID, name)
	if err != nil {
		return fmt.Errorf("create plot truss: %w", err)
	}
	trussID, err := result.LastInsertId()
	if err != nil {
		return err
	}

	// One synthesized legacy piece keeps the drawn length honest without
	// touching the rental order. A zero-length section gets no piece at
	// all (length_cm has a > 0 CHECK); its length was never known.
	if lengthM > 0 {
		label := name
		if trussType != "" {
			label = fmt.Sprintf("%s (%s)", name, trussType)
		}
		if _, err := tx.Exec(`INSERT INTO stage_plot_truss_pieces (truss_id, inventory_item_id, label, length_cm, sort_order)
			VALUES (?, NULL, ?, ?, 0)`, trussID, label, lengthM*100); err != nil {
			return fmt.Errorf("create legacy piece: %w", err)
		}
	}

	// Fixtures assigned to the section attach with an unknown position
	// (NULL offset — the Lighting tab then shows the truss name without
	// a position, FR-030's "where it can be inferred").
	if _, err := tx.Exec(`INSERT INTO stage_plot_truss_fixtures (truss_id, fixture_id, offset_cm)
		SELECT ?, id, NULL FROM lighting_fixtures WHERE truss_section_id = ?`, trussID, sectionID); err != nil {
		return fmt.Errorf("attach section fixtures: %w", err)
	}
	if _, err := tx.Exec(`UPDATE lighting_fixtures SET truss_section_id = NULL WHERE truss_section_id = ?`, sectionID); err != nil {
		return fmt.Errorf("clear fixture section references: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM truss_sections WHERE id = ?`, sectionID); err != nil {
		return fmt.Errorf("delete converted section: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	logger.Info("converted truss section to plot truss",
		slog.Int64("section_id", sectionID), slog.Int64("truss_id", trussID), slog.String("name", name))
	return nil
}
