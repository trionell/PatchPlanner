package db

import (
	"database/sql"
	"fmt"

	"github.com/trionell/patcherplanner/internal/domain"
)

func GetRentalSummary(db *sql.DB, eventID int64) (domain.RentalSummary, error) {
	rows, err := db.Query(`
		WITH combined AS (
			SELECT amplifier_item_id AS inventory_item_id, 1 AS quantity_audio, 0 AS quantity_lighting
			FROM audio_patch_outputs
			WHERE event_id = ? AND amplifier_item_id IS NOT NULL
			UNION ALL
			SELECT speaker_item_id AS inventory_item_id, 1 AS quantity_audio, 0 AS quantity_lighting
			FROM audio_patch_outputs
			WHERE event_id = ? AND speaker_item_id IS NOT NULL
			UNION ALL
			SELECT inventory_item_id, 0 AS quantity_audio, 1 AS quantity_lighting
			FROM lighting_fixtures lf
			JOIN lighting_rigs lr ON lr.id = lf.rig_id
			WHERE lr.event_id = ? AND inventory_item_id IS NOT NULL
			UNION ALL
			SELECT inventory_item_id, quantity_audio, quantity_lighting
			FROM event_rentals
			WHERE event_id = ?
		)
		SELECT i.id, i.name, COALESCE(i.description, ''), COALESCE(SUM(c.quantity_audio), 0), COALESCE(SUM(c.quantity_lighting), 0), COALESCE(i.price_ex_vat, 0)
		FROM combined c
		JOIN inventory_items i ON i.id = c.inventory_item_id
		GROUP BY i.id, i.name, i.description, i.price_ex_vat
		ORDER BY i.name ASC`, eventID, eventID, eventID, eventID)
	if err != nil {
		return domain.RentalSummary{}, fmt.Errorf("get rental summary: %w", err)
	}
	defer rows.Close()

	summary := domain.RentalSummary{Items: make([]domain.EventRental, 0)}
	for rows.Next() {
		var item domain.EventRental
		if err := rows.Scan(&item.InventoryItemID, &item.InventoryItemName, &item.Description, &item.QuantityAudio, &item.QuantityLighting, &item.PriceExVAT); err != nil {
			return domain.RentalSummary{}, fmt.Errorf("scan rental summary row: %w", err)
		}
		item.TotalQuantity = item.QuantityAudio + item.QuantityLighting
		item.SubtotalExVAT = float64(item.TotalQuantity) * item.PriceExVAT
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
