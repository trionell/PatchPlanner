package db

import (
	"database/sql"
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
)

// rentalSummaryQuery derives the full rental order for one event. Every
// planning surface that can reference a catalog item contributes one arm of
// the CTE; manual event_rentals lines are both merged into the totals and
// re-joined so their share stays editable. Takes the event id 11 times.
//
// A stereo channel's per-side physical equipment doubles (CASE WHEN width =
// 'stereo' ...); two-channel devices (the DI itself, an amplifier) stay
// single-counted regardless of width. mic_item_id is overloaded — it also
// stores the DI box on DI-type rows — so its doubling explicitly excludes
// signal_type = 'di' or a stereo DI channel's own DI box would double.
//
// Output signal graph (Slice 11, research.md R4): unlike the input side,
// nothing here uses a width-based CASE WHEN doubling formula. A stereo
// channel's two physical sides are two real, separate device/cable rows
// from the start (output_devices.position_x/y and output_cables' two
// independent (from,port)/(to,port) pairs) — so every device and every
// cable simply counts 1 per row it appears in. A declared device
// (output_devices) contributes a flat 1 per row regardless of how many
// cables reference it (the "amplifier never doubles" rule, unchanged from
// Slice 10). output_cables.cable_item_id is always NULL for a cable whose
// to_kind is 'stage_multi' (FR-013 — a stage multi's own built-in wiring
// is never a separately rentable cable), so that arm structurally excludes
// those rows with no extra WHERE clause needed.
const rentalSummaryQuery = `
	WITH combined AS (
		SELECT mic_item_id AS inventory_item_id,
			CASE WHEN width = 'stereo' AND signal_type != 'di' THEN 2 ELSE 1 END AS quantity_audio,
			0 AS quantity_lighting
		FROM audio_patch_inputs
		WHERE event_id = ? AND mic_item_id IS NOT NULL
		UNION ALL
		SELECT cable_item_id, CASE WHEN width = 'stereo' THEN 2 ELSE 1 END, 0
		FROM audio_patch_inputs
		WHERE event_id = ? AND cable_item_id IS NOT NULL
		UNION ALL
		SELECT stand_item_id, CASE WHEN width = 'stereo' THEN 2 ELSE 1 END, 0
		FROM audio_patch_inputs
		WHERE event_id = ? AND stand_item_id IS NOT NULL
		UNION ALL
		SELECT source_cable_item_id, CASE WHEN width = 'stereo' AND source_cabling = 'two_cables' THEN 2 ELSE 1 END, 0
		FROM audio_patch_inputs
		WHERE event_id = ? AND signal_type = 'di' AND source_cable_item_id IS NOT NULL
		UNION ALL
		SELECT inventory_item_id, 1, 0
		FROM stageboxes
		WHERE event_id = ? AND inventory_item_id IS NOT NULL
		UNION ALL
		SELECT inventory_item_id, 1, 0
		FROM stage_multis
		WHERE event_id = ? AND inventory_item_id IS NOT NULL
		UNION ALL
		SELECT inventory_item_id, 1, 0
		FROM output_devices
		WHERE event_id = ? AND inventory_item_id IS NOT NULL
		UNION ALL
		SELECT cable_item_id, 1, 0
		FROM output_cables
		WHERE event_id = ? AND cable_item_id IS NOT NULL
		UNION ALL
		SELECT lf.inventory_item_id, 0, 1
		FROM lighting_fixtures lf
		JOIN lighting_rigs lr ON lr.id = lf.rig_id
		WHERE lr.event_id = ? AND lf.inventory_item_id IS NOT NULL
		UNION ALL
		SELECT inventory_item_id, quantity_audio, quantity_lighting
		FROM event_rentals
		WHERE event_id = ?
	)
	SELECT i.id, i.name, COALESCE(i.description, ''),
		COALESCE(SUM(c.quantity_audio), 0), COALESCE(SUM(c.quantity_lighting), 0),
		COALESCE(er.quantity_audio, 0), COALESCE(er.quantity_lighting, 0), COALESCE(er.notes, ''),
		COALESCE(i.price_ex_vat, 0), COALESCE(i.quantity_available, 0), i.discontinued
	FROM combined c
	JOIN inventory_items i ON i.id = c.inventory_item_id
	LEFT JOIN event_rentals er ON er.event_id = ? AND er.inventory_item_id = i.id
	GROUP BY i.id, i.name, i.description, er.quantity_audio, er.quantity_lighting, er.notes, i.price_ex_vat, i.quantity_available, i.discontinued
	ORDER BY i.name ASC, i.id ASC`

func GetRentalSummary(db *sql.DB, eventID int64) (domain.RentalSummary, error) {
	rows, err := db.Query(rentalSummaryQuery,
		eventID, eventID, eventID, eventID, eventID, eventID, eventID, eventID, eventID, eventID, eventID)
	if err != nil {
		return domain.RentalSummary{}, fmt.Errorf("get rental summary: %w", err)
	}
	defer rows.Close()

	summary := domain.RentalSummary{Items: make([]domain.EventRental, 0)}
	for rows.Next() {
		var item domain.EventRental
		var discontinued int
		if err := rows.Scan(&item.InventoryItemID, &item.InventoryItemName, &item.Description,
			&item.QuantityAudio, &item.QuantityLighting,
			&item.ManualQuantityAudio, &item.ManualQuantityLighting, &item.ManualNotes,
			&item.PriceExVAT, &item.QuantityAvailable, &discontinued); err != nil {
			return domain.RentalSummary{}, fmt.Errorf("scan rental summary row: %w", err)
		}
		item.TotalQuantity = item.QuantityAudio + item.QuantityLighting
		item.SubtotalExVAT = float64(item.TotalQuantity) * item.PriceExVAT
		item.IsOverStock = item.TotalQuantity > item.QuantityAvailable
		item.IsDiscontinued = discontinued == 1
		if item.IsOverStock || item.IsDiscontinued {
			summary.HasOverStock = true
		}
		summary.TotalItems++
		summary.TotalQuantity += item.TotalQuantity
		summary.TotalExVAT += item.SubtotalExVAT
		summary.Items = append(summary.Items, item)
	}
	if err := rows.Err(); err != nil {
		return domain.RentalSummary{}, err
	}
	return summary, nil
}

// GetRentalLine returns the summary line for one catalog item, or a zeroed
// line describing the item if the event no longer references it (e.g. right
// after its manual line was removed). Returns sql.ErrNoRows (wrapped) if the
// item does not exist.
func GetRentalLine(db *sql.DB, eventID, itemID int64) (domain.EventRental, error) {
	summary, err := GetRentalSummary(db, eventID)
	if err != nil {
		return domain.EventRental{}, err
	}
	for _, line := range summary.Items {
		if line.InventoryItemID == itemID {
			return line, nil
		}
	}
	item, err := GetInventoryItem(db, itemID)
	if err != nil {
		return domain.EventRental{}, err
	}
	return domain.EventRental{
		InventoryItemID:   item.ID,
		InventoryItemName: item.Name,
		Description:       item.Description,
		PriceExVAT:        item.PriceExVAT,
		QuantityAvailable: item.QuantityAvailable,
		IsDiscontinued:    item.Discontinued,
	}, nil
}

// UpsertManualRental sets the manual rental line for an item on an event.
// Setting both quantities to zero removes the line (idempotent with delete).
func UpsertManualRental(db *sql.DB, eventID, itemID int64, req domain.ManualRentalRequest) error {
	if req.QuantityAudio == 0 && req.QuantityLighting == 0 {
		return DeleteManualRental(db, eventID, itemID)
	}
	_, err := db.Exec(`INSERT INTO event_rentals (event_id, inventory_item_id, quantity_audio, quantity_lighting, notes)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(event_id, inventory_item_id) DO UPDATE SET
			quantity_audio = excluded.quantity_audio,
			quantity_lighting = excluded.quantity_lighting,
			notes = excluded.notes`,
		eventID, itemID, req.QuantityAudio, req.QuantityLighting, nullString(req.Notes))
	if err != nil {
		return fmt.Errorf("upsert manual rental: %w", err)
	}
	return nil
}

func DeleteManualRental(db *sql.DB, eventID, itemID int64) error {
	_, err := db.Exec(`DELETE FROM event_rentals WHERE event_id = ? AND inventory_item_id = ?`, eventID, itemID)
	if err != nil {
		return fmt.Errorf("delete manual rental: %w", err)
	}
	return nil
}
