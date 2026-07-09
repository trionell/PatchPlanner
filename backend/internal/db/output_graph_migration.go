package db

import (
	"database/sql"
	"fmt"
	"log/slog"

	"github.com/trionell/patchplanner/internal/domain"
)

// convertOutputChainHopsToGraph is the one-time conversion of Slice 10's
// output_chain_hops into the Slice 11 device/cable graph
// (specs/011-output-signal-graph/research.md R5). It is a safe no-op
// once already run: guarded by the table's existence (already dropped by
// migration 026 on any subsequent startup) and by which outputs still
// have hop rows (already-converted outputs are skipped). Each output's
// hops are converted and cleared in one transaction, which is what makes
// the whole function safely resumable after a crash — nothing is ever
// double-converted, and a partially-completed run simply picks up
// wherever it left off on the next call.
func convertOutputChainHopsToGraph(db *sql.DB, logger *slog.Logger) error {
	var tableExists int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'output_chain_hops'`).Scan(&tableExists); err != nil {
		return fmt.Errorf("check output_chain_hops exists: %w", err)
	}
	if tableExists == 0 {
		return nil
	}

	rows, err := db.Query(`SELECT DISTINCT output_id FROM output_chain_hops ORDER BY output_id`)
	if err != nil {
		return fmt.Errorf("list outputs with hops: %w", err)
	}
	var outputIDs []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return fmt.Errorf("scan output id: %w", err)
		}
		outputIDs = append(outputIDs, id)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, outputID := range outputIDs {
		if err := convertOneOutput(db, outputID, logger); err != nil {
			return fmt.Errorf("convert output %d: %w", outputID, err)
		}
	}
	return nil
}

func convertOneOutput(db *sql.DB, outputID int64, logger *slog.Logger) error {
	var eventID int64
	var width string
	if err := db.QueryRow(`SELECT event_id, width FROM audio_patch_outputs WHERE id = ?`, outputID).Scan(&eventID, &width); err != nil {
		return fmt.Errorf("load output: %w", err)
	}
	hops, err := legacyHopsForOutput(db, outputID)
	if err != nil {
		return err
	}
	if len(hops) == 0 {
		return nil
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := convertOneSide(tx, eventID, outputID, 0, hops, false, logger); err != nil {
		return err
	}
	if width == "stereo" {
		if err := convertOneSide(tx, eventID, outputID, 1, hops, true, logger); err != nil {
			return err
		}
	}

	if _, err := tx.Exec(`DELETE FROM output_chain_hops WHERE output_id = ?`, outputID); err != nil {
		return fmt.Errorf("clear converted hops: %w", err)
	}
	return tx.Commit()
}

// convertOneSide walks one physical side's hops in position order,
// carrying a (kind, id, port) cursor forward — starting at the mixer
// port for this side — per research.md R5's algorithm.
func convertOneSide(tx *sql.Tx, eventID, outputID int64, sideIndex int, hops []domain.OutputChainHop, isSideB bool, logger *slog.Logger) error {
	side := "A"
	if isSideB {
		side = "B"
	}
	currentKind := "mixer"
	currentID := outputID
	currentPort := sideIndex

	for _, hop := range hops {
		switch hop.HopKind {
		case "route":
			stageboxID, stageboxChannel := hop.StageboxID, hop.StageboxChannel
			stageMultiID, stageMultiChannel := hop.StageMultiID, hop.StageMultiChannel
			if isSideB {
				stageboxID, stageboxChannel = hop.StageboxIDB, hop.StageboxChannelB
				stageMultiID, stageMultiChannel = hop.StageMultiIDB, hop.StageMultiChannelB
			}
			switch {
			case stageboxID != nil:
				// A stagebox has no input side in the new graph (FR-004) —
				// the link from whatever fed it cannot be represented.
				logger.Warn("output graph migration: dropped a link into a stagebox (stagebox has no input side in the new output graph)",
					"output_id", outputID, "side", side, "stagebox_id", *stageboxID, "stagebox_channel", derefIntOrZero(stageboxChannel))
				currentKind = "stagebox"
				currentID = *stageboxID
				currentPort = derefIntOrZero(stageboxChannel) - 1
			case stageMultiID != nil:
				toPort := derefIntOrZero(stageMultiChannel) - 1
				if _, err := tx.Exec(`INSERT INTO output_cables (event_id, from_kind, from_id, from_port, to_kind, to_id, to_port, cable_item_id) VALUES (?, ?, ?, ?, 'stage_multi', ?, ?, NULL)`,
					eventID, currentKind, currentID, currentPort, *stageMultiID, toPort); err != nil {
					return fmt.Errorf("insert route-to-multi cable: %w", err)
				}
				if dropped := sideCableItemID(hop, isSideB); dropped != nil {
					logger.Warn("output graph migration: dropped a picked cable on a route into a stage multi (its own built-in wiring is never a separate rentable cable, FR-013)",
						"output_id", outputID, "side", side, "stage_multi_id", *stageMultiID, "stage_multi_channel", derefIntOrZero(stageMultiChannel), "dropped_cable_item_id", *dropped)
				}
				currentKind = "stage_multi"
				currentID = *stageMultiID
				currentPort = toPort
			default:
				// Neither side of the route was set on this hop — nothing
				// to route to; leave the cursor where it is.
			}
		case "device":
			deviceID, err := resolveHopDevice(tx, eventID, hop)
			if err != nil {
				return err
			}
			toPort, err := nextFreePort(tx, "device", deviceID, "to")
			if err != nil {
				return err
			}
			if _, err := tx.Exec(`INSERT INTO output_cables (event_id, from_kind, from_id, from_port, to_kind, to_id, to_port, cable_item_id) VALUES (?, ?, ?, ?, 'device', ?, ?, ?)`,
				eventID, currentKind, currentID, currentPort, deviceID, toPort, nullInt64(sideCableItemID(hop, isSideB))); err != nil {
				return fmt.Errorf("insert device cable: %w", err)
			}
			fromPort, err := nextFreePort(tx, "device", deviceID, "from")
			if err != nil {
				return err
			}
			currentKind = "device"
			currentID = deviceID
			currentPort = fromPort
		}
	}
	return sizeTouchedDevicePorts(tx, eventID)
}

// sideCableItemID picks the hop's cable for the physical side being
// converted: side A always uses CableItemID; side B uses CableItemIDB if
// set, else falls back to CableItemID — reproducing the old "unset
// side-B cable doubles the same item" total exactly, now as two real
// cable rows instead of one row counted twice (research.md R5).
func sideCableItemID(hop domain.OutputChainHop, isSideB bool) *int64 {
	if isSideB && hop.CableItemIDB != nil {
		return hop.CableItemIDB
	}
	if isSideB {
		return hop.CableItemID
	}
	return hop.CableItemID
}

// resolveHopDevice resolves a device-kind hop to an output_devices row:
// device_source "shared" reuses the existing row directly; "inventory"/
// "owned" creates a one-off new row, never deduplicated across hops
// (matches Slice 10's own migration rule for its amplifier conversion,
// preserving per-row rental counting exactly).
func resolveHopDevice(tx *sql.Tx, eventID int64, hop domain.OutputChainHop) (int64, error) {
	switch hop.DeviceSource {
	case "shared":
		if hop.OutputDeviceID == nil {
			return 0, fmt.Errorf("shared device hop missing output_device_id")
		}
		return *hop.OutputDeviceID, nil
	case "owned":
		if hop.OwnedItemID == nil {
			return 0, fmt.Errorf("owned device hop missing owned_item_id")
		}
		return createOneOffMigratedDevice(tx, eventID, nil, hop.OwnedItemID)
	default: // "inventory", or unset on legacy data — treat as inventory if an item is present
		if hop.InventoryItemID == nil {
			return 0, fmt.Errorf("inventory device hop missing inventory_item_id")
		}
		return createOneOffMigratedDevice(tx, eventID, hop.InventoryItemID, nil)
	}
}

func createOneOffMigratedDevice(tx *sql.Tx, eventID int64, inventoryItemID, ownedItemID *int64) (int64, error) {
	result, err := tx.Exec(`INSERT INTO output_devices (event_id, name, inventory_item_id, owned_item_id, input_port_count, output_port_count) VALUES (?, 'Migrated device', ?, ?, 0, 0)`,
		eventID, nullInt64(inventoryItemID), nullInt64(ownedItemID))
	if err != nil {
		return 0, fmt.Errorf("create one-off migrated device: %w", err)
	}
	return result.LastInsertId()
}

// nextFreePort returns the next unused port index on the given side
// ("from" or "to") of a device, computed from output_cables' actual
// committed state rather than an in-memory counter — this is what keeps
// port assignment correct across a crash-and-resume (research.md R5).
func nextFreePort(tx *sql.Tx, kind string, id int64, side string) (int, error) {
	column := "to_port"
	kindColumn := "to_kind"
	idColumn := "to_id"
	if side == "from" {
		column, kindColumn, idColumn = "from_port", "from_kind", "from_id"
	}
	var next int
	query := fmt.Sprintf(`SELECT COALESCE(MAX(%s), -1) + 1 FROM output_cables WHERE %s = ? AND %s = ?`, column, kindColumn, idColumn)
	if err := tx.QueryRow(query, kind, id).Scan(&next); err != nil {
		return 0, fmt.Errorf("next free port: %w", err)
	}
	return next, nil
}

// sizeTouchedDevicePorts sets every device's input_port_count/
// output_port_count to the number of distinct cables actually
// referencing each side (minimum 1 on a side with any connections, so a
// device isn't collapsed to a phantom 0/0 node) — recomputed from actual
// committed cable rows each time, not tracked incrementally, so it stays
// correct regardless of how many separate convertOneOutput calls touched
// the same shared device.
func sizeTouchedDevicePorts(tx *sql.Tx, eventID int64) error {
	_, err := tx.Exec(`
		UPDATE output_devices SET
			input_port_count = MAX(input_port_count, COALESCE((SELECT COUNT(*) FROM output_cables WHERE to_kind = 'device' AND to_id = output_devices.id), 0)),
			output_port_count = MAX(output_port_count, COALESCE((SELECT COUNT(*) FROM output_cables WHERE from_kind = 'device' AND from_id = output_devices.id), 0))
		WHERE event_id = ?`, eventID)
	if err != nil {
		return fmt.Errorf("size migrated device ports: %w", err)
	}
	return nil
}

func derefIntOrZero(v *int) int {
	if v == nil {
		return 0
	}
	return *v
}

const legacyHopColumns = `id, position, hop_kind, cable_item_id, cable_item_id_b, device_source, inventory_item_id, owned_item_id, output_device_id, stagebox_id, stagebox_channel, stagebox_id_b, stagebox_channel_b, stage_multi_id, stage_multi_channel, stage_multi_id_b, stage_multi_channel_b`

// legacyHopsForOutput scans one output's Slice 10 output_chain_hops rows
// in position order — self-contained here rather than reusing anything
// from audio_patch.go, since this whole file is migration-only code that
// should be easy to delete in a later cleanup pass once every real
// database has converted.
func legacyHopsForOutput(db *sql.DB, outputID int64) ([]domain.OutputChainHop, error) {
	rows, err := db.Query(`SELECT `+legacyHopColumns+` FROM output_chain_hops WHERE output_id = ? ORDER BY position ASC`, outputID)
	if err != nil {
		return nil, fmt.Errorf("list legacy hops: %w", err)
	}
	defer rows.Close()
	var hops []domain.OutputChainHop
	for rows.Next() {
		var hop domain.OutputChainHop
		var cableItemID, cableItemIDB, inventoryItemID, ownedItemID, outputDeviceID sql.NullInt64
		var stageboxID, stageboxChannel, stageboxIDB, stageboxChannelB sql.NullInt64
		var stageMultiID, stageMultiChannel, stageMultiIDB, stageMultiChannelB sql.NullInt64
		var deviceSource sql.NullString
		if err := rows.Scan(&hop.ID, &hop.Position, &hop.HopKind, &cableItemID, &cableItemIDB, &deviceSource, &inventoryItemID, &ownedItemID, &outputDeviceID,
			&stageboxID, &stageboxChannel, &stageboxIDB, &stageboxChannelB, &stageMultiID, &stageMultiChannel, &stageMultiIDB, &stageMultiChannelB); err != nil {
			return nil, fmt.Errorf("scan legacy hop: %w", err)
		}
		hop.CableItemID = int64PtrFromNull(cableItemID)
		hop.CableItemIDB = int64PtrFromNull(cableItemIDB)
		hop.DeviceSource = deviceSource.String
		hop.InventoryItemID = int64PtrFromNull(inventoryItemID)
		hop.OwnedItemID = int64PtrFromNull(ownedItemID)
		hop.OutputDeviceID = int64PtrFromNull(outputDeviceID)
		hop.StageboxID = int64PtrFromNull(stageboxID)
		hop.StageboxChannel = intPtrFromNull(stageboxChannel)
		hop.StageboxIDB = int64PtrFromNull(stageboxIDB)
		hop.StageboxChannelB = intPtrFromNull(stageboxChannelB)
		hop.StageMultiID = int64PtrFromNull(stageMultiID)
		hop.StageMultiChannel = intPtrFromNull(stageMultiChannel)
		hop.StageMultiIDB = int64PtrFromNull(stageMultiIDB)
		hop.StageMultiChannelB = intPtrFromNull(stageMultiChannelB)
		hops = append(hops, hop)
	}
	return hops, rows.Err()
}
