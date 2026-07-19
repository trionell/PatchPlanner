package db

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
)

// ErrLastStagePlotLayer is returned when deleting a plot's only layer;
// the API maps it to 409 (a plot always has at least one layer).
var ErrLastStagePlotLayer = errors.New("a stage plot must keep at least one layer")

const stagePlotColumns = `id, event_id, name, sort_order, grid_visible, grid_size_cm,
	snap_grid, snap_objects, show_fixture_name, show_fixture_fid, show_fixture_dmx,
	active_view, zoom, pan_x_cm, pan_y_cm`

func scanStagePlot(row interface{ Scan(...any) error }) (domain.StagePlot, error) {
	var p domain.StagePlot
	var gridVisible, snapGrid, snapObjects, showName, showFID, showDMX int
	err := row.Scan(&p.ID, &p.EventID, &p.Name, &p.SortOrder, &gridVisible, &p.GridSizeCm,
		&snapGrid, &snapObjects, &showName, &showFID, &showDMX,
		&p.ActiveView, &p.Zoom, &p.PanXCm, &p.PanYCm)
	if err != nil {
		return domain.StagePlot{}, err
	}
	p.GridVisible = gridVisible == 1
	p.SnapGrid = snapGrid == 1
	p.SnapObjects = snapObjects == 1
	p.ShowFixtureName = showName == 1
	p.ShowFixtureFID = showFID == 1
	p.ShowFixtureDMX = showDMX == 1
	return p, nil
}

func ListStagePlots(db *sql.DB, eventID int64) ([]domain.StagePlot, error) {
	rows, err := db.Query(`SELECT `+stagePlotColumns+` FROM stage_plots WHERE event_id = ? ORDER BY sort_order ASC, id ASC`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list stage plots: %w", err)
	}
	defer rows.Close()
	plots := make([]domain.StagePlot, 0)
	for rows.Next() {
		plot, err := scanStagePlot(rows)
		if err != nil {
			return nil, fmt.Errorf("scan stage plot: %w", err)
		}
		plots = append(plots, plot)
	}
	return plots, rows.Err()
}

func GetStagePlot(db *sql.DB, eventID, plotID int64) (domain.StagePlot, error) {
	row := db.QueryRow(`SELECT `+stagePlotColumns+` FROM stage_plots WHERE id = ? AND event_id = ?`, plotID, eventID)
	plot, err := scanStagePlot(row)
	if err != nil {
		return domain.StagePlot{}, fmt.Errorf("get stage plot: %w", err)
	}
	return plot, nil
}

// CreateStagePlot inserts the plot and its default layer in one
// transaction: a plot always has at least one layer.
func CreateStagePlot(db *sql.DB, eventID int64, name string) (domain.StagePlot, error) {
	tx, err := db.Begin()
	if err != nil {
		return domain.StagePlot{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var maxSort sql.NullInt64
	if err := tx.QueryRow(`SELECT MAX(sort_order) FROM stage_plots WHERE event_id = ?`, eventID).Scan(&maxSort); err != nil {
		return domain.StagePlot{}, fmt.Errorf("next plot sort order: %w", err)
	}
	result, err := tx.Exec(`INSERT INTO stage_plots (event_id, name, sort_order) VALUES (?, ?, ?)`,
		eventID, name, maxSort.Int64+1)
	if err != nil {
		return domain.StagePlot{}, fmt.Errorf("create stage plot: %w", err)
	}
	plotID, err := result.LastInsertId()
	if err != nil {
		return domain.StagePlot{}, err
	}
	if _, err := tx.Exec(`INSERT INTO stage_plot_layers (plot_id, name, sort_order) VALUES (?, 'Layer 1', 0)`, plotID); err != nil {
		return domain.StagePlot{}, fmt.Errorf("create default layer: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return domain.StagePlot{}, err
	}
	return GetStagePlot(db, eventID, plotID)
}

// UpdateStagePlot writes every mutable column; the API layer merges
// partial PATCH bodies onto the current row before calling this.
func UpdateStagePlot(db *sql.DB, plot domain.StagePlot) error {
	_, err := db.Exec(`UPDATE stage_plots SET name = ?, sort_order = ?, grid_visible = ?, grid_size_cm = ?,
		snap_grid = ?, snap_objects = ?, show_fixture_name = ?, show_fixture_fid = ?, show_fixture_dmx = ?,
		active_view = ?, zoom = ?, pan_x_cm = ?, pan_y_cm = ? WHERE id = ?`,
		plot.Name, plot.SortOrder, boolToInt(plot.GridVisible), plot.GridSizeCm,
		boolToInt(plot.SnapGrid), boolToInt(plot.SnapObjects), boolToInt(plot.ShowFixtureName),
		boolToInt(plot.ShowFixtureFID), boolToInt(plot.ShowFixtureDMX),
		plot.ActiveView, plot.Zoom, plot.PanXCm, plot.PanYCm, plot.ID)
	if err != nil {
		return fmt.Errorf("update stage plot: %w", err)
	}
	return nil
}

func DeleteStagePlot(db *sql.DB, eventID, plotID int64) error {
	_, err := db.Exec(`DELETE FROM stage_plots WHERE id = ? AND event_id = ?`, plotID, eventID)
	if err != nil {
		return fmt.Errorf("delete stage plot: %w", err)
	}
	return nil
}

// ---- Layers ----

func scanStagePlotLayer(row interface{ Scan(...any) error }) (domain.StagePlotLayer, error) {
	var l domain.StagePlotLayer
	var color sql.NullString
	var visible, locked int
	if err := row.Scan(&l.ID, &l.PlotID, &l.Name, &l.SortOrder, &color, &visible, &locked); err != nil {
		return domain.StagePlotLayer{}, err
	}
	l.Color = color.String
	l.Visible = visible == 1
	l.Locked = locked == 1
	return l, nil
}

func ListStagePlotLayers(db *sql.DB, plotID int64) ([]domain.StagePlotLayer, error) {
	rows, err := db.Query(`SELECT id, plot_id, name, sort_order, color, visible, locked
		FROM stage_plot_layers WHERE plot_id = ? ORDER BY sort_order ASC, id ASC`, plotID)
	if err != nil {
		return nil, fmt.Errorf("list stage plot layers: %w", err)
	}
	defer rows.Close()
	layers := make([]domain.StagePlotLayer, 0)
	for rows.Next() {
		layer, err := scanStagePlotLayer(rows)
		if err != nil {
			return nil, fmt.Errorf("scan stage plot layer: %w", err)
		}
		layers = append(layers, layer)
	}
	return layers, rows.Err()
}

func GetStagePlotLayer(db *sql.DB, plotID, layerID int64) (domain.StagePlotLayer, error) {
	row := db.QueryRow(`SELECT id, plot_id, name, sort_order, color, visible, locked
		FROM stage_plot_layers WHERE id = ? AND plot_id = ?`, layerID, plotID)
	layer, err := scanStagePlotLayer(row)
	if err != nil {
		return domain.StagePlotLayer{}, fmt.Errorf("get stage plot layer: %w", err)
	}
	return layer, nil
}

func CreateStagePlotLayer(db *sql.DB, plotID int64, name, color string) (domain.StagePlotLayer, error) {
	var maxSort sql.NullInt64
	if err := db.QueryRow(`SELECT MAX(sort_order) FROM stage_plot_layers WHERE plot_id = ?`, plotID).Scan(&maxSort); err != nil {
		return domain.StagePlotLayer{}, fmt.Errorf("next layer sort order: %w", err)
	}
	result, err := db.Exec(`INSERT INTO stage_plot_layers (plot_id, name, sort_order, color) VALUES (?, ?, ?, ?)`,
		plotID, name, maxSort.Int64+1, nullString(color))
	if err != nil {
		return domain.StagePlotLayer{}, fmt.Errorf("create stage plot layer: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.StagePlotLayer{}, err
	}
	return GetStagePlotLayer(db, plotID, id)
}

func UpdateStagePlotLayer(db *sql.DB, layer domain.StagePlotLayer) error {
	_, err := db.Exec(`UPDATE stage_plot_layers SET name = ?, sort_order = ?, color = ?, visible = ?, locked = ? WHERE id = ?`,
		layer.Name, layer.SortOrder, nullString(layer.Color), boolToInt(layer.Visible), boolToInt(layer.Locked), layer.ID)
	if err != nil {
		return fmt.Errorf("update stage plot layer: %w", err)
	}
	return nil
}

// DeleteStagePlotLayer removes the layer and (via cascade) its elements,
// refusing to delete the plot's last layer.
func DeleteStagePlotLayer(db *sql.DB, plotID, layerID int64) error {
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM stage_plot_layers WHERE plot_id = ?`, plotID).Scan(&count); err != nil {
		return fmt.Errorf("count stage plot layers: %w", err)
	}
	if count <= 1 {
		return ErrLastStagePlotLayer
	}
	_, err := db.Exec(`DELETE FROM stage_plot_layers WHERE id = ? AND plot_id = ?`, layerID, plotID)
	if err != nil {
		return fmt.Errorf("delete stage plot layer: %w", err)
	}
	return nil
}

// ---- Elements ----

const stagePlotElementColumns = `id, plot_id, layer_id, kind, shape_kind, icon, truss_id, fixture_id,
	name, x_cm, y_cm, z_cm, width_cm, depth_cm, height_cm, rotation_deg, tilt_deg, notes`

func scanStagePlotElement(row interface{ Scan(...any) error }) (domain.StagePlotElement, error) {
	var e domain.StagePlotElement
	var shapeKind, icon, notes sql.NullString
	var trussID, fixtureID sql.NullInt64
	err := row.Scan(&e.ID, &e.PlotID, &e.LayerID, &e.Kind, &shapeKind, &icon, &trussID, &fixtureID,
		&e.Name, &e.XCm, &e.YCm, &e.ZCm, &e.WidthCm, &e.DepthCm, &e.HeightCm, &e.RotationDeg, &e.TiltDeg, &notes)
	if err != nil {
		return domain.StagePlotElement{}, err
	}
	e.ShapeKind = shapeKind.String
	e.Icon = icon.String
	e.TrussID = int64PtrFromNull(trussID)
	e.FixtureID = int64PtrFromNull(fixtureID)
	e.Notes = notes.String
	e.Links = make([]domain.StagePlotLink, 0)
	return e, nil
}

func ListStagePlotElements(db *sql.DB, plotID int64) ([]domain.StagePlotElement, error) {
	rows, err := db.Query(`SELECT `+stagePlotElementColumns+` FROM stage_plot_elements WHERE plot_id = ? ORDER BY id ASC`, plotID)
	if err != nil {
		return nil, fmt.Errorf("list stage plot elements: %w", err)
	}
	defer rows.Close()
	elements := make([]domain.StagePlotElement, 0)
	for rows.Next() {
		element, err := scanStagePlotElement(rows)
		if err != nil {
			return nil, fmt.Errorf("scan stage plot element: %w", err)
		}
		elements = append(elements, element)
	}
	return elements, rows.Err()
}

func GetStagePlotElement(db *sql.DB, plotID, elementID int64) (domain.StagePlotElement, error) {
	row := db.QueryRow(`SELECT `+stagePlotElementColumns+` FROM stage_plot_elements WHERE id = ? AND plot_id = ?`, elementID, plotID)
	element, err := scanStagePlotElement(row)
	if err != nil {
		return domain.StagePlotElement{}, fmt.Errorf("get stage plot element: %w", err)
	}
	return element, nil
}

func CreateStagePlotElement(db *sql.DB, element domain.StagePlotElement) (domain.StagePlotElement, error) {
	// The layer must belong to the element's plot — a cross-plot layer id
	// would silently orphan the element from its own plot's cascade.
	var layerPlot int64
	if err := db.QueryRow(`SELECT plot_id FROM stage_plot_layers WHERE id = ?`, element.LayerID).Scan(&layerPlot); err != nil {
		return domain.StagePlotElement{}, fmt.Errorf("resolve element layer: %w", err)
	}
	if layerPlot != element.PlotID {
		return domain.StagePlotElement{}, fmt.Errorf("layer %d does not belong to plot %d", element.LayerID, element.PlotID)
	}
	result, err := db.Exec(`INSERT INTO stage_plot_elements
		(plot_id, layer_id, kind, shape_kind, icon, truss_id, fixture_id, name,
		 x_cm, y_cm, z_cm, width_cm, depth_cm, height_cm, rotation_deg, tilt_deg, notes)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		element.PlotID, element.LayerID, element.Kind, nullString(element.ShapeKind), nullString(element.Icon),
		nullInt64(element.TrussID), nullInt64(element.FixtureID), element.Name,
		element.XCm, element.YCm, element.ZCm, element.WidthCm, element.DepthCm, element.HeightCm,
		element.RotationDeg, element.TiltDeg, nullString(element.Notes))
	if err != nil {
		return domain.StagePlotElement{}, fmt.Errorf("create stage plot element: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.StagePlotElement{}, err
	}
	return GetStagePlotElement(db, element.PlotID, id)
}

func UpdateStagePlotElement(db *sql.DB, element domain.StagePlotElement) error {
	if element.LayerID != 0 {
		var layerPlot int64
		if err := db.QueryRow(`SELECT plot_id FROM stage_plot_layers WHERE id = ?`, element.LayerID).Scan(&layerPlot); err != nil {
			return fmt.Errorf("resolve element layer: %w", err)
		}
		if layerPlot != element.PlotID {
			return fmt.Errorf("layer %d does not belong to plot %d", element.LayerID, element.PlotID)
		}
	}
	_, err := db.Exec(`UPDATE stage_plot_elements SET layer_id = ?, icon = ?, name = ?,
		x_cm = ?, y_cm = ?, z_cm = ?, width_cm = ?, depth_cm = ?, height_cm = ?, rotation_deg = ?, tilt_deg = ?, notes = ?
		WHERE id = ?`,
		element.LayerID, nullString(element.Icon), element.Name,
		element.XCm, element.YCm, element.ZCm, element.WidthCm, element.DepthCm, element.HeightCm,
		element.RotationDeg, element.TiltDeg, nullString(element.Notes), element.ID)
	if err != nil {
		return fmt.Errorf("update stage plot element: %w", err)
	}
	return nil
}

func DeleteStagePlotElement(db *sql.DB, plotID, elementID int64) error {
	_, err := db.Exec(`DELETE FROM stage_plot_elements WHERE id = ? AND plot_id = ?`, elementID, plotID)
	if err != nil {
		return fmt.Errorf("delete stage plot element: %w", err)
	}
	return nil
}

// ---- Element links (assignments & stack entries, research.md R6) ----

// StagePlotLinkEntityKinds are the planned-entity kinds an element may
// reference. Go-validated (no SQL FK — the target table varies).
var StagePlotLinkEntityKinds = map[string]bool{
	"input_source": true, "input_channel": true, "output_device": true,
	"input_device": true, "stagebox": true, "stage_multi": true, "lighting_fixture": true,
}

// stagePlotLinkTargetQuery returns the existence/display-name query for
// one entity kind, scoped to the event so cross-event references are
// impossible. Every query yields (display_name) for id ?1, event ?2.
func stagePlotLinkTargetQuery(entityKind string) string {
	switch entityKind {
	case "input_source":
		return `SELECT name FROM input_sources WHERE id = ? AND event_id = ?`
	case "input_channel":
		return `SELECT COALESCE(NULLIF(channel_name, ''), 'Channel ' || channel_number) FROM input_channels WHERE id = ? AND event_id = ?`
	case "output_device":
		return `SELECT name FROM output_devices WHERE id = ? AND event_id = ?`
	case "input_device":
		return `SELECT name FROM input_devices WHERE id = ? AND event_id = ?`
	case "stagebox":
		return `SELECT name FROM stageboxes WHERE id = ? AND event_id = ?`
	case "stage_multi":
		return `SELECT name FROM stage_multis WHERE id = ? AND event_id = ?`
	case "lighting_fixture":
		return `SELECT COALESCE(NULLIF(f.custom_name, ''), i.name, 'Fixture') FROM lighting_fixtures f
			JOIN lighting_rigs r ON r.id = f.rig_id
			LEFT JOIN inventory_items i ON i.id = f.inventory_item_id
			WHERE f.id = ? AND r.event_id = ?`
	}
	return ""
}

// ResolveStagePlotLinkTarget returns the target's display name, or
// sql.ErrNoRows if the entity doesn't exist on this event.
func ResolveStagePlotLinkTarget(db *sql.DB, eventID int64, entityKind string, entityID int64) (string, error) {
	query := stagePlotLinkTargetQuery(entityKind)
	if query == "" {
		return "", fmt.Errorf("unknown entity kind %q", entityKind)
	}
	var name string
	if err := db.QueryRow(query, entityID, eventID).Scan(&name); err != nil {
		return "", err
	}
	return name, nil
}

func scanStagePlotLink(row interface{ Scan(...any) error }) (domain.StagePlotLink, error) {
	var link domain.StagePlotLink
	err := row.Scan(&link.ID, &link.ElementID, &link.Role, &link.EntityKind, &link.EntityID, &link.SortOrder)
	return link, err
}

func CreateStagePlotLink(db *sql.DB, link domain.StagePlotLink) (domain.StagePlotLink, error) {
	result, err := db.Exec(`INSERT INTO stage_plot_element_links (element_id, role, entity_kind, entity_id, sort_order)
		VALUES (?, ?, ?, ?, ?)`,
		link.ElementID, link.Role, link.EntityKind, link.EntityID, link.SortOrder)
	if err != nil {
		return domain.StagePlotLink{}, fmt.Errorf("create stage plot link: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.StagePlotLink{}, err
	}
	row := db.QueryRow(`SELECT id, element_id, role, entity_kind, entity_id, sort_order FROM stage_plot_element_links WHERE id = ?`, id)
	created, err := scanStagePlotLink(row)
	if err != nil {
		return domain.StagePlotLink{}, fmt.Errorf("get stage plot link: %w", err)
	}
	return created, nil
}

func GetStagePlotLink(db *sql.DB, elementID, linkID int64) (domain.StagePlotLink, error) {
	row := db.QueryRow(`SELECT id, element_id, role, entity_kind, entity_id, sort_order
		FROM stage_plot_element_links WHERE id = ? AND element_id = ?`, linkID, elementID)
	link, err := scanStagePlotLink(row)
	if err != nil {
		return domain.StagePlotLink{}, fmt.Errorf("get stage plot link: %w", err)
	}
	return link, nil
}

func UpdateStagePlotLinkSortOrder(db *sql.DB, linkID int64, sortOrder int) error {
	_, err := db.Exec(`UPDATE stage_plot_element_links SET sort_order = ? WHERE id = ?`, sortOrder, linkID)
	if err != nil {
		return fmt.Errorf("update stage plot link: %w", err)
	}
	return nil
}

func DeleteStagePlotLink(db *sql.DB, elementID, linkID int64) error {
	_, err := db.Exec(`DELETE FROM stage_plot_element_links WHERE id = ? AND element_id = ?`, linkID, elementID)
	if err != nil {
		return fmt.Errorf("delete stage plot link: %w", err)
	}
	return nil
}

// clearStagePlotLinksTo removes every assignment/stack reference to one
// planned entity — called from the entity's own delete path (the Slice 0
// "deletes clear referencing rows first" discipline). Works on any
// execer so delete transactions can call it too.
func clearStagePlotLinksTo(execer interface {
	Exec(query string, args ...any) (sql.Result, error)
}, entityKind string, entityID int64) error {
	_, err := execer.Exec(`DELETE FROM stage_plot_element_links WHERE entity_kind = ? AND entity_id = ?`, entityKind, entityID)
	if err != nil {
		return fmt.Errorf("clear stage plot links to %s %d: %w", entityKind, entityID, err)
	}
	return nil
}

// listStagePlotLinks resolves every link on the plot's elements to its
// current display name, dropping (and deleting, defense in depth against
// a forgotten delete path) rows whose target no longer exists — FR-014.
func listStagePlotLinks(db *sql.DB, eventID, plotID int64) (map[int64][]domain.StagePlotLink, error) {
	rows, err := db.Query(`SELECT l.id, l.element_id, l.role, l.entity_kind, l.entity_id, l.sort_order
		FROM stage_plot_element_links l
		JOIN stage_plot_elements e ON e.id = l.element_id
		WHERE e.plot_id = ?
		ORDER BY l.element_id, l.role, l.sort_order, l.id`, plotID)
	if err != nil {
		return nil, fmt.Errorf("list stage plot links: %w", err)
	}
	defer rows.Close()

	var links []domain.StagePlotLink
	for rows.Next() {
		link, err := scanStagePlotLink(rows)
		if err != nil {
			return nil, fmt.Errorf("scan stage plot link: %w", err)
		}
		links = append(links, link)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	byElement := make(map[int64][]domain.StagePlotLink)
	var dangling []int64
	for _, link := range links {
		name, err := ResolveStagePlotLinkTarget(db, eventID, link.EntityKind, link.EntityID)
		if errors.Is(err, sql.ErrNoRows) {
			dangling = append(dangling, link.ID)
			continue
		}
		if err != nil {
			return nil, err
		}
		link.DisplayName = name
		if link.EntityKind == "lighting_fixture" {
			var fixtureNumber, dmxAddress sql.NullInt64
			var universe int
			err := db.QueryRow(`SELECT f.fixture_number, f.dmx_universe, f.dmx_start_address
				FROM lighting_fixtures f WHERE f.id = ?`, link.EntityID).
				Scan(&fixtureNumber, &universe, &dmxAddress)
			if err == nil {
				link.FixtureNumber = intPtrFromNull(fixtureNumber)
				link.DMXUniverse = &universe
				link.DMXStartAddress = intPtrFromNull(dmxAddress)
			}
		}
		byElement[link.ElementID] = append(byElement[link.ElementID], link)
	}
	for _, id := range dangling {
		_, _ = db.Exec(`DELETE FROM stage_plot_element_links WHERE id = ?`, id)
	}
	return byElement, nil
}

// StagePlotTrussBelongsToEvent reports whether the truss exists on the event.
func StagePlotTrussBelongsToEvent(db *sql.DB, eventID, trussID int64) (bool, error) {
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM stage_plot_trusses WHERE id = ? AND event_id = ?`, trussID, eventID).Scan(&count); err != nil {
		return false, fmt.Errorf("check truss event: %w", err)
	}
	return count > 0, nil
}

// FixtureBelongsToEvent reports whether the lighting fixture belongs to
// one of the event's rigs.
func FixtureBelongsToEvent(db *sql.DB, eventID, fixtureID int64) (bool, error) {
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM lighting_fixtures f
		JOIN lighting_rigs r ON r.id = f.rig_id
		WHERE f.id = ? AND r.event_id = ?`, fixtureID, eventID).Scan(&count); err != nil {
		return false, fmt.Errorf("check fixture event: %w", err)
	}
	return count > 0, nil
}

// StagePlotTrussPlacedOnPlot reports whether the truss already has a
// placement element on the plot (one placement per plot; the partial
// unique index enforces it too, but a pre-check gives a clean 409).
func StagePlotTrussPlacedOnPlot(db *sql.DB, plotID, trussID int64) (bool, error) {
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM stage_plot_elements WHERE plot_id = ? AND truss_id = ?`, plotID, trussID).Scan(&count); err != nil {
		return false, fmt.Errorf("check truss placement: %w", err)
	}
	return count > 0, nil
}

// ---- Aggregate read ----

// GetStagePlotResponse assembles everything the editor needs for one
// plot. Element links and event trusses are filled in by later slices'
// tasks (links: T024, trusses: T028) — until then the arrays are empty
// but present.
func GetStagePlotResponse(db *sql.DB, eventID, plotID int64) (domain.StagePlotResponse, error) {
	plot, err := GetStagePlot(db, eventID, plotID)
	if err != nil {
		return domain.StagePlotResponse{}, err
	}
	layers, err := ListStagePlotLayers(db, plotID)
	if err != nil {
		return domain.StagePlotResponse{}, err
	}
	elements, err := ListStagePlotElements(db, plotID)
	if err != nil {
		return domain.StagePlotResponse{}, err
	}
	linksByElement, err := listStagePlotLinks(db, eventID, plotID)
	if err != nil {
		return domain.StagePlotResponse{}, err
	}
	for i := range elements {
		if links, ok := linksByElement[elements[i].ID]; ok {
			elements[i].Links = links
		}
	}
	trusses, err := ListPlotTrusses(db, eventID)
	if err != nil {
		return domain.StagePlotResponse{}, err
	}
	return domain.StagePlotResponse{
		Plot:     plot,
		Layers:   layers,
		Elements: elements,
		Trusses:  trusses,
	}, nil
}
