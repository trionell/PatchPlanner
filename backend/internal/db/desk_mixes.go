package db

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
)

// ErrMainFixed signals an attempt to delete a desk's main; mains exist by rule.
var ErrMainFixed = errors.New("a desk's mains are never deleted")

const deskMixColumns = `id, event_id, console_id, kind, slot, width, name, COALESCE(color, '')`

func scanDeskMix(row scanner) (domain.DeskMix, error) {
	var mix domain.DeskMix
	var console sql.NullInt64
	if err := row.Scan(&mix.ID, &mix.EventID, &console, &mix.Kind, &mix.Slot, &mix.Width, &mix.Name, &mix.Color); err != nil {
		return domain.DeskMix{}, err
	}
	if console.Valid {
		mix.ConsoleID = &console.Int64
	}
	return mix, nil
}

func listMixes(db *sql.DB, where string, arg int64) ([]domain.DeskMix, error) {
	rows, err := db.Query(`SELECT `+deskMixColumns+` FROM desk_mixes `+where+` ORDER BY console_id, kind, slot, id`, arg)
	if err != nil {
		return nil, fmt.Errorf("list desk mixes: %w", err)
	}
	defer rows.Close()
	mixes := make([]domain.DeskMix, 0)
	for rows.Next() {
		mix, err := scanDeskMix(rows)
		if err != nil {
			return nil, fmt.Errorf("scan desk mix: %w", err)
		}
		mixes = append(mixes, mix)
	}
	return mixes, rows.Err()
}

// ListDeskMixes lists every mix, DCA and mute group of an event.
func ListDeskMixes(db *sql.DB, eventID int64) ([]domain.DeskMix, error) {
	return listMixes(db, `WHERE event_id = ?`, eventID)
}

// ConsoleMixes lists one desk's.
func ConsoleMixes(db *sql.DB, consoleID int64) ([]domain.DeskMix, error) {
	return listMixes(db, `WHERE console_id = ?`, consoleID)
}

// GetDeskMix reads one mix.
func GetDeskMix(db *sql.DB, id int64) (domain.DeskMix, error) {
	return scanDeskMix(db.QueryRow(`SELECT `+deskMixColumns+` FROM desk_mixes WHERE id = ?`, id))
}

const deskRouteColumns = `id, event_id, console_id, src_kind, src_id, src_port, dst_kind, dst_id, dst_port, mode`

func scanDeskRoute(row scanner) (domain.DeskRoute, error) {
	var route domain.DeskRoute
	var eventID int64
	var console sql.NullInt64
	if err := row.Scan(&route.ID, &eventID, &console, &route.SrcKind, &route.SrcID, &route.SrcPort, &route.DstKind, &route.DstID, &route.DstPort, &route.Mode); err != nil {
		return domain.DeskRoute{}, err
	}
	route.ConsoleID = console.Int64
	return route, nil
}

// ListDeskRoutes lists every route inside every desk of an event.
func ListDeskRoutes(db *sql.DB, eventID int64) ([]domain.DeskRoute, error) {
	rows, err := db.Query(`SELECT `+deskRouteColumns+` FROM desk_routes WHERE event_id = ? ORDER BY id`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list desk routes: %w", err)
	}
	defer rows.Close()
	routes := make([]domain.DeskRoute, 0)
	for rows.Next() {
		route, err := scanDeskRoute(rows)
		if err != nil {
			return nil, fmt.Errorf("scan desk route: %w", err)
		}
		routes = append(routes, route)
	}
	return routes, rows.Err()
}

type routeTx interface {
	Exec(query string, args ...any) (sql.Result, error)
	QueryRow(query string, args ...any) *sql.Row
}

func insertRoute(tx routeTx, eventID int64, consoleID *int64, route domain.DeskRoute) error {
	_, err := tx.Exec(`INSERT OR IGNORE INTO desk_routes (event_id, console_id, src_kind, src_id, src_port, dst_kind, dst_id, dst_port, mode)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, eventID, nullInt64(consoleID), route.SrcKind, route.SrcID, route.SrcPort, route.DstKind, route.DstID, route.DstPort, route.Mode)
	if err != nil {
		return fmt.Errorf("insert desk route: %w", err)
	}
	return nil
}

// clearPortRoutes removes every route naming a port kind and id on either end
// — the cleanup a polymorphic id needs when its row is deleted.
func clearPortRoutes(tx routeTx, kind string, id int64) error {
	if _, err := tx.Exec(`DELETE FROM desk_routes WHERE (src_kind = ? AND src_id = ?) OR (dst_kind = ? AND dst_id = ?)`, kind, id, kind, id); err != nil {
		return fmt.Errorf("clear %s routes: %w", kind, err)
	}
	return nil
}

// EnsureDeskMains gives a desk the mains its model always has and adopts the
// mixes and routes an event with no desk was holding, when this is its first
// desk. Idempotent: it only ever adds what is missing.
func EnsureDeskMains(db *sql.DB, console domain.Console) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("ensure desk mains: %w", err)
	}
	defer tx.Rollback()
	if err := ensureDeskMains(tx, console); err != nil {
		return err
	}
	return tx.Commit()
}

func ensureDeskMains(tx routeTx, console domain.Console) error {
	var desks int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM event_consoles WHERE event_id = ?`, console.EventID).Scan(&desks); err != nil {
		return fmt.Errorf("count desks: %w", err)
	}
	if desks == 1 {
		for _, table := range []string{"desk_mixes", "desk_routes"} {
			if _, err := tx.Exec(`UPDATE `+table+` SET console_id = ? WHERE event_id = ? AND console_id IS NULL`, console.ID, console.EventID); err != nil {
				return fmt.Errorf("adopt waiting %s: %w", table, err)
			}
		}
	}
	model, _ := domain.LookupDeskModel(console.DeskModel)
	for _, main := range model.MainSlots() {
		if _, err := tx.Exec(`INSERT INTO desk_mixes (event_id, console_id, kind, slot, width, name)
			SELECT ?, ?, 'main', ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM desk_mixes WHERE console_id = ? AND kind = 'main' AND slot = ?)`,
			console.EventID, console.ID, main.Slot, main.Width, main.Name, console.ID, main.Slot); err != nil {
			return fmt.Errorf("ensure main %s: %w", main.Name, err)
		}
	}
	return nil
}

// MainLRID is a desk's Main LR — slot 1 of its mains.
func MainLRID(q routeTx, consoleID int64) (int64, error) {
	var id int64
	if err := q.QueryRow(`SELECT id FROM desk_mixes WHERE console_id = ? AND kind = 'main' AND slot = 1`, consoleID).Scan(&id); err != nil {
		return 0, fmt.Errorf("look up main LR: %w", err)
	}
	return id, nil
}

// CreateDeskMix adds a mix at the slot the caller resolved.
func CreateDeskMix(db *sql.DB, mix domain.DeskMix) (domain.DeskMix, error) {
	result, err := db.Exec(`INSERT INTO desk_mixes (event_id, console_id, kind, slot, width, name, color) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		mix.EventID, nullInt64(mix.ConsoleID), mix.Kind, mix.Slot, mix.Width, mix.Name, nullString(mix.Color))
	if err != nil {
		return domain.DeskMix{}, fmt.Errorf("create desk mix: %w", err)
	}
	id, _ := result.LastInsertId()
	return GetDeskMix(db, id)
}

// UpdateDeskMix writes a mix's fields and, when sources is non-nil, replaces
// everything that feeds it — the column Save (Slice 48 D5), in one transaction.
func UpdateDeskMix(db *sql.DB, mix domain.DeskMix, sources []domain.DeskRoute) (domain.DeskMix, error) {
	tx, err := db.Begin()
	if err != nil {
		return domain.DeskMix{}, fmt.Errorf("update desk mix: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE desk_mixes SET slot = ?, width = ?, name = ?, color = ? WHERE id = ?`, mix.Slot, mix.Width, mix.Name, nullString(mix.Color), mix.ID); err != nil {
		return domain.DeskMix{}, fmt.Errorf("update desk mix: %w", err)
	}
	if sources != nil {
		if _, err := tx.Exec(`DELETE FROM desk_routes WHERE dst_kind = 'mix' AND dst_id = ?`, mix.ID); err != nil {
			return domain.DeskMix{}, fmt.Errorf("clear mix sources: %w", err)
		}
		for _, source := range sources {
			source.DstKind, source.DstID, source.DstPort = domain.PortMix, mix.ID, 0
			if err := insertRoute(tx, mix.EventID, mix.ConsoleID, source); err != nil {
				return domain.DeskMix{}, err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return domain.DeskMix{}, fmt.Errorf("update desk mix: %w", err)
	}
	return GetDeskMix(db, mix.ID)
}

// DeleteDeskMix removes a mix and every route to or from it. Mains refuse.
func DeleteDeskMix(db *sql.DB, id int64) error {
	mix, err := GetDeskMix(db, id)
	if err != nil {
		return err
	}
	if mix.Kind == domain.MixMain {
		return ErrMainFixed
	}
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("delete desk mix: %w", err)
	}
	defer tx.Rollback()
	if err := clearPortRoutes(tx, domain.PortMix, id); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM desk_mixes WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete desk mix: %w", err)
	}
	return tx.Commit()
}

// ChannelMixIDs is each channel's membership in the kinds its row edits:
// mains, subgroups, DCAs and mute groups (monitors, FX and matrices are edited
// as columns on Desk Routing).
func ChannelMixIDs(db *sql.DB, eventID int64) (map[int64][]int64, error) {
	rows, err := db.Query(`SELECT r.src_id, r.dst_id FROM desk_routes r JOIN desk_mixes m ON m.id = r.dst_id
		WHERE r.event_id = ? AND r.src_kind = 'channel' AND r.dst_kind = 'mix' AND m.kind IN ('main', 'subgroup', 'dca', 'mute')
		ORDER BY r.src_id, m.kind, m.slot`, eventID)
	if err != nil {
		return nil, fmt.Errorf("channel mix ids: %w", err)
	}
	defer rows.Close()
	byChannel := map[int64][]int64{}
	for rows.Next() {
		var channel, mix int64
		if err := rows.Scan(&channel, &mix); err != nil {
			return nil, err
		}
		byChannel[channel] = append(byChannel[channel], mix)
	}
	return byChannel, rows.Err()
}

// replaceChannelMixes rewrites a channel's routes into the kinds its row edits.
func replaceChannelMixes(tx *sql.Tx, eventID int64, consoleID *int64, channelID int64, mixIDs []int64) error {
	if _, err := tx.Exec(`DELETE FROM desk_routes WHERE src_kind = 'channel' AND src_id = ? AND dst_kind = 'mix'
		AND dst_id IN (SELECT id FROM desk_mixes WHERE kind IN ('main', 'subgroup', 'dca', 'mute'))`, channelID); err != nil {
		return fmt.Errorf("clear channel mixes: %w", err)
	}
	for _, mixID := range dedupeIDs(mixIDs) {
		if err := insertRoute(tx, eventID, consoleID, domain.DeskRoute{SrcKind: domain.PortChannel, SrcID: channelID, DstKind: domain.PortMix, DstID: mixID}); err != nil {
			return err
		}
	}
	return nil
}

// MixesOnConsole reports whether every id is a mix of this desk.
func MixesOnConsole(db *sql.DB, consoleID int64, ids []int64) (bool, error) {
	for _, id := range dedupeIDs(ids) {
		var n int
		if err := db.QueryRow(`SELECT COUNT(*) FROM desk_mixes WHERE id = ? AND console_id = ?`, id, consoleID).Scan(&n); err != nil {
			return false, err
		}
		if n == 0 {
			return false, nil
		}
	}
	return true, nil
}

// SetFedBy replaces an output's one Fed by route; a nil source clears it.
func SetFedBy(db *sql.DB, output domain.AudioPatchOutput, source *domain.DeskRoute) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("set fed by: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM desk_routes WHERE dst_kind = 'output' AND dst_id = ?`, output.ID); err != nil {
		return fmt.Errorf("clear fed by: %w", err)
	}
	if source != nil {
		source.DstKind, source.DstID, source.DstPort = domain.PortOutput, output.ID, 0
		if err := insertRoute(tx, output.EventID, output.ConsoleID, *source); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// SetRecorder declares (or removes) a desk's recorder and, on Generic, its
// typed track count. Removing it clears every route to and from it.
func SetRecorder(db *sql.DB, console domain.Console, on bool, tracks int) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("set recorder: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE event_consoles SET recorder = ?, recorder_tracks = ? WHERE id = ?`, boolInt(on), tracks, console.ID); err != nil {
		return fmt.Errorf("set recorder: %w", err)
	}
	if !on {
		if err := clearPortRoutes(tx, domain.PortRecorder, console.ID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ReplaceRecorderRoutes rewrites every route to and from a desk's recorder.
func ReplaceRecorderRoutes(db *sql.DB, console domain.Console, routes []domain.DeskRoute) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("replace recorder routes: %w", err)
	}
	defer tx.Rollback()
	if err := clearPortRoutes(tx, domain.PortRecorder, console.ID); err != nil {
		return err
	}
	for _, route := range routes {
		if err := insertRoute(tx, console.EventID, &console.ID, route); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func dedupeIDs(ids []int64) []int64 {
	seen := make(map[int64]bool, len(ids))
	unique := make([]int64, 0, len(ids))
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			unique = append(unique, id)
		}
	}
	return unique
}

// PatchedChannels lists a desk's channels that have an input cable landing on
// them — the preamps Record every preamp takes — in strip order.
func PatchedChannels(db *sql.DB, consoleID int64) ([]int64, error) {
	rows, err := db.Query(`SELECT c.id FROM input_channels c
		WHERE c.console_id = ? AND EXISTS (SELECT 1 FROM input_cables k WHERE k.to_kind = 'channel' AND k.to_id = c.id)
		ORDER BY CASE c.strip_pool WHEN 'channel' THEN 0 ELSE 1 END, c.channel_number, c.id`, consoleID)
	if err != nil {
		return nil, fmt.Errorf("patched channels: %w", err)
	}
	defer rows.Close()
	ids := make([]int64, 0)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
