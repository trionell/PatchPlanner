package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	dbstore "github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

var validShapeKinds = map[string]bool{"rect": true, "ellipse": true, "line": true, "text": true}
var validPlotViews = map[string]bool{"top": true, "front": true, "side": true}

type StagePlotsHandler struct {
	DB *sql.DB
}

func (h StagePlotsHandler) Register(r chi.Router) {
	r.Route("/events/{eventID}/stage-plots", func(r chi.Router) {
		r.Get("/", h.listPlots)
		r.Post("/", h.createPlot)
		r.Route("/{plotID}", func(r chi.Router) {
			r.Get("/", h.getPlot)
			r.Patch("/", h.updatePlot)
			r.Delete("/", h.deletePlot)
			r.Post("/layers", h.createLayer)
			r.Patch("/layers/{layerID}", h.updateLayer)
			r.Delete("/layers/{layerID}", h.deleteLayer)
			r.Post("/elements", h.createElement)
			r.Patch("/elements/{elementID}", h.updateElement)
			r.Delete("/elements/{elementID}", h.deleteElement)
			r.Post("/elements/{elementID}/links", h.createLink)
			r.Patch("/elements/{elementID}/links/{linkID}", h.updateLink)
			r.Delete("/elements/{elementID}/links/{linkID}", h.deleteLink)
		})
	})
	h.registerTrussRoutes(r)
}

// eventAndPlot resolves the {eventID}/{plotID} pair, writing the error
// response itself when either is missing.
func (h StagePlotsHandler) eventAndPlot(w http.ResponseWriter, r *http.Request) (int64, domain.StagePlot, bool) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return 0, domain.StagePlot{}, false
	}
	plotID, ok := parseID(w, chi.URLParam(r, "plotID"))
	if !ok {
		return 0, domain.StagePlot{}, false
	}
	plot, err := dbstore.GetStagePlot(h.DB, eventID, plotID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "stage plot not found")
		} else {
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return 0, domain.StagePlot{}, false
	}
	return eventID, plot, true
}

// ---- Plots ----

func (h StagePlotsHandler) listPlots(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	plots, err := dbstore.ListStagePlots(h.DB, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, plots)
}

func (h StagePlotsHandler) createPlot(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	if _, err := dbstore.GetEvent(h.DB, eventID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "event not found")
		} else {
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	plot, err := dbstore.CreateStagePlot(h.DB, eventID, strings.TrimSpace(req.Name))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, plot)
}

func (h StagePlotsHandler) getPlot(w http.ResponseWriter, r *http.Request) {
	eventID, plot, ok := h.eventAndPlot(w, r)
	if !ok {
		return
	}
	response, err := dbstore.GetStagePlotResponse(h.DB, eventID, plot.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, response)
}

type stagePlotPatch struct {
	Name            *string  `json:"name"`
	SortOrder       *int     `json:"sort_order"`
	GridVisible     *bool    `json:"grid_visible"`
	GridSizeCm      *float64 `json:"grid_size_cm"`
	SnapGrid        *bool    `json:"snap_grid"`
	SnapObjects     *bool    `json:"snap_objects"`
	ShowFixtureName *bool    `json:"show_fixture_name"`
	ShowFixtureFID  *bool    `json:"show_fixture_fid"`
	ShowFixtureDMX  *bool    `json:"show_fixture_dmx"`
	ActiveView      *string  `json:"active_view"`
	Zoom            *float64 `json:"zoom"`
	PanXCm          *float64 `json:"pan_x_cm"`
	PanYCm          *float64 `json:"pan_y_cm"`
}

func (h StagePlotsHandler) updatePlot(w http.ResponseWriter, r *http.Request) {
	_, plot, ok := h.eventAndPlot(w, r)
	if !ok {
		return
	}
	var patch stagePlotPatch
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if patch.Name != nil {
		if strings.TrimSpace(*patch.Name) == "" {
			writeError(w, http.StatusBadRequest, "name cannot be empty")
			return
		}
		plot.Name = strings.TrimSpace(*patch.Name)
	}
	if patch.SortOrder != nil {
		plot.SortOrder = *patch.SortOrder
	}
	if patch.GridVisible != nil {
		plot.GridVisible = *patch.GridVisible
	}
	if patch.GridSizeCm != nil {
		if *patch.GridSizeCm <= 0 {
			writeError(w, http.StatusBadRequest, "grid_size_cm must be positive")
			return
		}
		plot.GridSizeCm = *patch.GridSizeCm
	}
	if patch.SnapGrid != nil {
		plot.SnapGrid = *patch.SnapGrid
	}
	if patch.SnapObjects != nil {
		plot.SnapObjects = *patch.SnapObjects
	}
	if patch.ShowFixtureName != nil {
		plot.ShowFixtureName = *patch.ShowFixtureName
	}
	if patch.ShowFixtureFID != nil {
		plot.ShowFixtureFID = *patch.ShowFixtureFID
	}
	if patch.ShowFixtureDMX != nil {
		plot.ShowFixtureDMX = *patch.ShowFixtureDMX
	}
	if patch.ActiveView != nil {
		if !validPlotViews[*patch.ActiveView] {
			writeError(w, http.StatusBadRequest, "active_view must be top, front or side")
			return
		}
		plot.ActiveView = *patch.ActiveView
	}
	if patch.Zoom != nil {
		if *patch.Zoom <= 0 {
			writeError(w, http.StatusBadRequest, "zoom must be positive")
			return
		}
		plot.Zoom = *patch.Zoom
	}
	if patch.PanXCm != nil {
		plot.PanXCm = *patch.PanXCm
	}
	if patch.PanYCm != nil {
		plot.PanYCm = *patch.PanYCm
	}
	if err := dbstore.UpdateStagePlot(h.DB, plot); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, plot)
}

func (h StagePlotsHandler) deletePlot(w http.ResponseWriter, r *http.Request) {
	eventID, plot, ok := h.eventAndPlot(w, r)
	if !ok {
		return
	}
	if err := dbstore.DeleteStagePlot(h.DB, eventID, plot.ID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- Layers ----

func (h StagePlotsHandler) createLayer(w http.ResponseWriter, r *http.Request) {
	_, plot, ok := h.eventAndPlot(w, r)
	if !ok {
		return
	}
	var req struct {
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	layer, err := dbstore.CreateStagePlotLayer(h.DB, plot.ID, strings.TrimSpace(req.Name), req.Color)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, layer)
}

type stagePlotLayerPatch struct {
	Name      *string `json:"name"`
	SortOrder *int    `json:"sort_order"`
	Color     *string `json:"color"`
	Visible   *bool   `json:"visible"`
	Locked    *bool   `json:"locked"`
}

func (h StagePlotsHandler) updateLayer(w http.ResponseWriter, r *http.Request) {
	_, plot, ok := h.eventAndPlot(w, r)
	if !ok {
		return
	}
	layerID, ok := parseID(w, chi.URLParam(r, "layerID"))
	if !ok {
		return
	}
	layer, err := dbstore.GetStagePlotLayer(h.DB, plot.ID, layerID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "layer not found")
		} else {
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	var patch stagePlotLayerPatch
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if patch.Name != nil {
		if strings.TrimSpace(*patch.Name) == "" {
			writeError(w, http.StatusBadRequest, "name cannot be empty")
			return
		}
		layer.Name = strings.TrimSpace(*patch.Name)
	}
	if patch.SortOrder != nil {
		layer.SortOrder = *patch.SortOrder
	}
	if patch.Color != nil {
		layer.Color = *patch.Color
	}
	if patch.Visible != nil {
		layer.Visible = *patch.Visible
	}
	if patch.Locked != nil {
		layer.Locked = *patch.Locked
	}
	if err := dbstore.UpdateStagePlotLayer(h.DB, layer); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, layer)
}

func (h StagePlotsHandler) deleteLayer(w http.ResponseWriter, r *http.Request) {
	_, plot, ok := h.eventAndPlot(w, r)
	if !ok {
		return
	}
	layerID, ok := parseID(w, chi.URLParam(r, "layerID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteStagePlotLayer(h.DB, plot.ID, layerID); err != nil {
		if errors.Is(err, dbstore.ErrLastStagePlotLayer) {
			writeError(w, http.StatusConflict, err.Error())
		} else {
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- Elements ----

type stagePlotElementRequest struct {
	LayerID     int64   `json:"layer_id"`
	Kind        string  `json:"kind"`
	ShapeKind   string  `json:"shape_kind"`
	Icon        string  `json:"icon"`
	TrussID     *int64  `json:"truss_id"`
	FixtureID   *int64  `json:"fixture_id"`
	Name        string  `json:"name"`
	XCm         float64 `json:"x_cm"`
	YCm         float64 `json:"y_cm"`
	ZCm         float64 `json:"z_cm"`
	WidthCm     float64 `json:"width_cm"`
	DepthCm     float64 `json:"depth_cm"`
	HeightCm    float64 `json:"height_cm"`
	RotationDeg float64 `json:"rotation_deg"`
	TiltDeg     float64 `json:"tilt_deg"`
	Notes       string  `json:"notes"`
}

// validateElementKind enforces "exactly the kind-matching optional field
// set" (data-model.md): shape⇒shape_kind, resource⇒icon, truss⇒truss_id,
// fixture⇒fixture_id — and dimension sanity per kind.
func validateElementKind(req stagePlotElementRequest) string {
	switch req.Kind {
	case "shape":
		if !validShapeKinds[req.ShapeKind] {
			return "shape elements need a shape_kind of rect, ellipse, line or text"
		}
		if req.Icon != "" || req.TrussID != nil || req.FixtureID != nil {
			return "shape elements cannot carry icon, truss_id or fixture_id"
		}
		if req.WidthCm <= 0 {
			return "width_cm must be positive"
		}
	case "resource":
		if strings.TrimSpace(req.Icon) == "" {
			return "resource elements need an icon"
		}
		if req.ShapeKind != "" || req.TrussID != nil || req.FixtureID != nil {
			return "resource elements cannot carry shape_kind, truss_id or fixture_id"
		}
		if req.WidthCm <= 0 {
			return "width_cm must be positive"
		}
	case "truss":
		if req.TrussID == nil {
			return "truss elements need a truss_id"
		}
		if req.ShapeKind != "" || req.Icon != "" || req.FixtureID != nil {
			return "truss elements cannot carry shape_kind, icon or fixture_id"
		}
	case "fixture":
		if req.FixtureID == nil {
			return "fixture elements need a fixture_id"
		}
		if req.ShapeKind != "" || req.Icon != "" || req.TrussID != nil {
			return "fixture elements cannot carry shape_kind, icon or truss_id"
		}
		if req.WidthCm <= 0 {
			return "width_cm must be positive"
		}
	default:
		return "kind must be shape, resource, truss or fixture"
	}
	if req.DepthCm < 0 || req.HeightCm < 0 {
		return "depth_cm and height_cm cannot be negative"
	}
	return ""
}

func (h StagePlotsHandler) createElement(w http.ResponseWriter, r *http.Request) {
	eventID, plot, ok := h.eventAndPlot(w, r)
	if !ok {
		return
	}
	var req stagePlotElementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if message := validateElementKind(req); message != "" {
		writeError(w, http.StatusBadRequest, message)
		return
	}
	if req.Kind == "truss" {
		belongs, err := dbstore.StagePlotTrussBelongsToEvent(h.DB, eventID, *req.TrussID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if !belongs {
			writeError(w, http.StatusNotFound, "truss not found on this event")
			return
		}
		placed, err := dbstore.StagePlotTrussPlacedOnPlot(h.DB, plot.ID, *req.TrussID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if placed {
			writeError(w, http.StatusConflict, "truss is already placed on this plot")
			return
		}
	}
	if req.Kind == "fixture" {
		belongs, err := dbstore.FixtureBelongsToEvent(h.DB, eventID, *req.FixtureID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if !belongs {
			writeError(w, http.StatusNotFound, "fixture not found on this event")
			return
		}
	}
	element, err := dbstore.CreateStagePlotElement(h.DB, domain.StagePlotElement{
		PlotID:      plot.ID,
		LayerID:     req.LayerID,
		Kind:        req.Kind,
		ShapeKind:   req.ShapeKind,
		Icon:        req.Icon,
		TrussID:     req.TrussID,
		FixtureID:   req.FixtureID,
		Name:        req.Name,
		XCm:         req.XCm,
		YCm:         req.YCm,
		ZCm:         req.ZCm,
		WidthCm:     req.WidthCm,
		DepthCm:     req.DepthCm,
		HeightCm:    req.HeightCm,
		RotationDeg: req.RotationDeg,
		TiltDeg:     req.TiltDeg,
		Notes:       req.Notes,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, element)
}

type stagePlotElementPatch struct {
	LayerID     *int64   `json:"layer_id"`
	Icon        *string  `json:"icon"`
	Name        *string  `json:"name"`
	XCm         *float64 `json:"x_cm"`
	YCm         *float64 `json:"y_cm"`
	ZCm         *float64 `json:"z_cm"`
	WidthCm     *float64 `json:"width_cm"`
	DepthCm     *float64 `json:"depth_cm"`
	HeightCm    *float64 `json:"height_cm"`
	RotationDeg *float64 `json:"rotation_deg"`
	TiltDeg     *float64 `json:"tilt_deg"`
	Notes       *string  `json:"notes"`
}

func (h StagePlotsHandler) updateElement(w http.ResponseWriter, r *http.Request) {
	_, plot, ok := h.eventAndPlot(w, r)
	if !ok {
		return
	}
	elementID, ok := parseID(w, chi.URLParam(r, "elementID"))
	if !ok {
		return
	}
	element, err := dbstore.GetStagePlotElement(h.DB, plot.ID, elementID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "element not found")
		} else {
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	var patch stagePlotElementPatch
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if patch.LayerID != nil {
		element.LayerID = *patch.LayerID
	}
	if patch.Icon != nil {
		if element.Kind != "resource" {
			writeError(w, http.StatusBadRequest, "only resource elements carry an icon")
			return
		}
		if strings.TrimSpace(*patch.Icon) == "" {
			writeError(w, http.StatusBadRequest, "icon cannot be empty")
			return
		}
		element.Icon = *patch.Icon
	}
	if patch.Name != nil {
		element.Name = *patch.Name
	}
	if patch.XCm != nil {
		element.XCm = *patch.XCm
	}
	if patch.YCm != nil {
		element.YCm = *patch.YCm
	}
	if patch.ZCm != nil {
		element.ZCm = *patch.ZCm
	}
	if patch.WidthCm != nil {
		if *patch.WidthCm <= 0 && element.Kind != "truss" {
			writeError(w, http.StatusBadRequest, "width_cm must be positive")
			return
		}
		element.WidthCm = *patch.WidthCm
	}
	if patch.DepthCm != nil {
		if *patch.DepthCm < 0 {
			writeError(w, http.StatusBadRequest, "depth_cm cannot be negative")
			return
		}
		element.DepthCm = *patch.DepthCm
	}
	if patch.HeightCm != nil {
		if *patch.HeightCm < 0 {
			writeError(w, http.StatusBadRequest, "height_cm cannot be negative")
			return
		}
		element.HeightCm = *patch.HeightCm
	}
	if patch.RotationDeg != nil {
		element.RotationDeg = *patch.RotationDeg
	}
	if patch.TiltDeg != nil {
		element.TiltDeg = *patch.TiltDeg
	}
	if patch.Notes != nil {
		element.Notes = *patch.Notes
	}
	if err := dbstore.UpdateStagePlotElement(h.DB, element); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	updated, err := dbstore.GetStagePlotElement(h.DB, plot.ID, elementID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// ---- Element links (assignments & stack entries) ----

func (h StagePlotsHandler) resolveElement(w http.ResponseWriter, r *http.Request, plotID int64) (domain.StagePlotElement, bool) {
	elementID, ok := parseID(w, chi.URLParam(r, "elementID"))
	if !ok {
		return domain.StagePlotElement{}, false
	}
	element, err := dbstore.GetStagePlotElement(h.DB, plotID, elementID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "element not found")
		} else {
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return domain.StagePlotElement{}, false
	}
	return element, true
}

func (h StagePlotsHandler) createLink(w http.ResponseWriter, r *http.Request) {
	eventID, plot, ok := h.eventAndPlot(w, r)
	if !ok {
		return
	}
	element, ok := h.resolveElement(w, r, plot.ID)
	if !ok {
		return
	}
	var req struct {
		Role       string `json:"role"`
		EntityKind string `json:"entity_kind"`
		EntityID   int64  `json:"entity_id"`
		SortOrder  int    `json:"sort_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.Role != "assignment" && req.Role != "stack" {
		writeError(w, http.StatusBadRequest, "role must be assignment or stack")
		return
	}
	if !dbstore.StagePlotLinkEntityKinds[req.EntityKind] {
		writeError(w, http.StatusBadRequest, "unknown entity_kind")
		return
	}
	displayName, err := dbstore.ResolveStagePlotLinkTarget(h.DB, eventID, req.EntityKind, req.EntityID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "referenced entity not found on this event")
		} else {
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	link, err := dbstore.CreateStagePlotLink(h.DB, domain.StagePlotLink{
		ElementID:  element.ID,
		Role:       req.Role,
		EntityKind: req.EntityKind,
		EntityID:   req.EntityID,
		SortOrder:  req.SortOrder,
	})
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			writeError(w, http.StatusConflict, "this entity is already linked to the element in that role")
		} else {
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	link.DisplayName = displayName
	writeJSON(w, http.StatusCreated, link)
}

func (h StagePlotsHandler) updateLink(w http.ResponseWriter, r *http.Request) {
	_, plot, ok := h.eventAndPlot(w, r)
	if !ok {
		return
	}
	element, ok := h.resolveElement(w, r, plot.ID)
	if !ok {
		return
	}
	linkID, ok := parseID(w, chi.URLParam(r, "linkID"))
	if !ok {
		return
	}
	if _, err := dbstore.GetStagePlotLink(h.DB, element.ID, linkID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "link not found")
		} else {
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	var req struct {
		SortOrder int `json:"sort_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if err := dbstore.UpdateStagePlotLinkSortOrder(h.DB, linkID, req.SortOrder); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	link, err := dbstore.GetStagePlotLink(h.DB, element.ID, linkID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, link)
}

func (h StagePlotsHandler) deleteLink(w http.ResponseWriter, r *http.Request) {
	_, plot, ok := h.eventAndPlot(w, r)
	if !ok {
		return
	}
	element, ok := h.resolveElement(w, r, plot.ID)
	if !ok {
		return
	}
	linkID, ok := parseID(w, chi.URLParam(r, "linkID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteStagePlotLink(h.DB, element.ID, linkID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h StagePlotsHandler) deleteElement(w http.ResponseWriter, r *http.Request) {
	_, plot, ok := h.eventAndPlot(w, r)
	if !ok {
		return
	}
	elementID, ok := parseID(w, chi.URLParam(r, "elementID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteStagePlotElement(h.DB, plot.ID, elementID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
