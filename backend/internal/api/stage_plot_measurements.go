package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	dbstore "github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
	"github.com/trionell/patchplanner/internal/service"
)

// Measurements on a stage plot (Slice 42). A measurement's VALUE is never
// accepted from a client and never stored: it is derived from the two anchors
// wherever it is drawn. What this endpoint validates is that the anchors can
// be resolved at all.

var validMeasurementViews = map[string]bool{"top": true, "front": true, "side": true}
var validMeasurementTypes = map[string]bool{"aligned": true, "horizontal": true, "vertical": true}

type measurementAnchorRequest struct {
	ElementID *int64   `json:"element_id"`
	Feature   string   `json:"feature"`
	Slide     bool     `json:"slide"`
	UCm       *float64 `json:"u_cm"`
	VCm       *float64 `json:"v_cm"`
}

type stagePlotMeasurementRequest struct {
	LayerID   int64                    `json:"layer_id"`
	View      string                   `json:"view"`
	Type      string                   `json:"type"`
	From      measurementAnchorRequest `json:"from"`
	To        measurementAnchorRequest `json:"to"`
	OffsetCm  float64                  `json:"offset_cm"`
	Note      string                   `json:"note"`
	SortOrder int                      `json:"sort_order"`
}

// validateAnchor enforces the exclusivity the schema deliberately does not:
// an end is EITHER an element feature OR a free point, never both and never
// neither. The message names the end, which is why this lives here and not in
// a CHECK constraint.
func validateAnchor(label string, anchor measurementAnchorRequest) string {
	isElement := anchor.ElementID != nil
	isFree := anchor.UCm != nil && anchor.VCm != nil
	switch {
	case isElement && isFree:
		return "the " + label + " end cannot be both an element anchor and a free point"
	case !isElement && !isFree:
		return "the " + label + " end needs either an element_id with a feature, or a u_cm and v_cm"
	case isElement:
		if strings.TrimSpace(anchor.Feature) == "" {
			return "the " + label + " end needs a feature to anchor to"
		}
		if _, err := service.ParseAnchorFeature(anchor.Feature); err != nil {
			return "the " + label + " end names a feature this element cannot have: " + anchor.Feature
		}
	case isFree:
		if anchor.Slide {
			return "a free point on the " + label + " end cannot slide — only a face can"
		}
	}
	return ""
}

func (req stagePlotMeasurementRequest) validate() string {
	if !validMeasurementViews[req.View] {
		return "view must be top, front or side"
	}
	if !validMeasurementTypes[req.Type] {
		return "type must be aligned, horizontal or vertical"
	}
	if req.LayerID == 0 {
		return "a measurement needs a layer_id"
	}
	if message := validateAnchor("from", req.From); message != "" {
		return message
	}
	return validateAnchor("to", req.To)
}

func measurementFromRequest(req stagePlotMeasurementRequest, plotID int64) domain.StagePlotMeasurement {
	anchor := func(a measurementAnchorRequest) domain.MeasurementAnchor {
		if a.ElementID != nil {
			return domain.MeasurementAnchor{ElementID: a.ElementID, Feature: a.Feature, Slide: a.Slide}
		}
		return domain.MeasurementAnchor{UCm: a.UCm, VCm: a.VCm}
	}
	return domain.StagePlotMeasurement{
		PlotID:    plotID,
		LayerID:   req.LayerID,
		View:      req.View,
		Type:      req.Type,
		From:      anchor(req.From),
		To:        anchor(req.To),
		OffsetCm:  req.OffsetCm,
		Note:      strings.TrimSpace(req.Note),
		SortOrder: req.SortOrder,
	}
}

// resolveMeasurement checks that every element an end names is on this plot,
// that the feature it names is a feature that element actually offers in this
// view, and that a pair of sliding faces is parallel — the three things that
// cannot be known from the request alone.
func (h StagePlotsHandler) resolveMeasurement(w http.ResponseWriter, measurement domain.StagePlotMeasurement) bool {
	elements, err := dbstore.ListStagePlotElements(h.DB, measurement.PlotID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return false
	}
	byID := make(map[int64]domain.StagePlotElement, len(elements))
	for _, element := range elements {
		byID[element.ID] = element
	}
	view := service.PlotView(measurement.View)

	ends := make([]service.MeasurementEnd, 0, 2)
	for _, side := range []struct {
		label  string
		anchor domain.MeasurementAnchor
	}{{"from", measurement.From}, {"to", measurement.To}} {
		if !side.anchor.IsElement() {
			ends = append(ends, service.MeasurementEnd{Point: service.PlaneVec{U: *side.anchor.UCm, V: *side.anchor.VCm}})
			continue
		}
		element, ok := byID[*side.anchor.ElementID]
		if !ok {
			writeError(w, http.StatusBadRequest, "the "+side.label+" end names an element that is not on this plot")
			return false
		}
		feature, err := service.ParseAnchorFeature(side.anchor.Feature)
		if err != nil {
			writeError(w, http.StatusBadRequest, "the "+side.label+" end names a feature that cannot be read: "+side.anchor.Feature)
			return false
		}
		if side.anchor.Slide {
			if !service.AllowsPlaneAnchor(element) {
				writeError(w, http.StatusBadRequest, "an ellipse has no straight side to measure along, so the "+side.label+" end cannot slide")
				return false
			}
			line, ok := service.ProjectFaceLine(element, view, feature)
			if !ok {
				writeError(w, http.StatusBadRequest, "the "+side.label+" end names a face that is not seen edge-on in the "+measurement.View+" view")
				return false
			}
			ends = append(ends, service.MeasurementEnd{Line: line, IsLine: true})
			continue
		}
		ends = append(ends, service.MeasurementEnd{Point: service.AnchorPoint(element, view, feature)})
	}

	if _, ok := service.ComputeMeasurementSpan(ends[0], ends[1], measurement.Type); !ok {
		writeError(w, http.StatusBadRequest, "these two ends state no distance: two faces that are not parallel, a locked axis running along the face it measures to, or two points in the same place")
		return false
	}
	return true
}

func (h StagePlotsHandler) createMeasurement(w http.ResponseWriter, r *http.Request) {
	_, plot, ok := h.eventAndPlot(w, r)
	if !ok {
		return
	}
	var req stagePlotMeasurementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if message := req.validate(); message != "" {
		writeError(w, http.StatusBadRequest, message)
		return
	}
	measurement := measurementFromRequest(req, plot.ID)
	if !h.resolveMeasurement(w, measurement) {
		return
	}
	created, err := dbstore.CreateStagePlotMeasurement(h.DB, measurement)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h StagePlotsHandler) updateMeasurement(w http.ResponseWriter, r *http.Request) {
	_, plot, ok := h.eventAndPlot(w, r)
	if !ok {
		return
	}
	measurementID, ok := parseID(w, chi.URLParam(r, "measurementID"))
	if !ok {
		return
	}
	existing, err := dbstore.GetStagePlotMeasurement(h.DB, plot.ID, measurementID)
	if err != nil {
		writeError(w, http.StatusNotFound, "measurement not found")
		return
	}
	// Scalars prefill and are overwritten by whatever the body names. The two
	// ANCHORS cannot: decoding into a prefilled struct leaves untouched fields
	// alone, so a body naming only `u_cm`/`v_cm` would keep the old
	// `element_id` beside it and the end would be both kinds at once — which
	// validation then rejects. A re-anchor from an element onto a free point is
	// the commonest edit there is, so each anchor is decoded as a POINTER and
	// replaces its side whole.
	req := stagePlotMeasurementRequest{
		LayerID:   existing.LayerID,
		View:      existing.View,
		Type:      existing.Type,
		OffsetCm:  existing.OffsetCm,
		Note:      existing.Note,
		SortOrder: existing.SortOrder,
	}
	patch := struct {
		*stagePlotMeasurementRequest
		From *measurementAnchorRequest `json:"from"`
		To   *measurementAnchorRequest `json:"to"`
	}{stagePlotMeasurementRequest: &req}
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if patch.From != nil {
		req.From = *patch.From
	} else {
		req.From = measurementAnchorRequest{ElementID: existing.From.ElementID, Feature: existing.From.Feature, Slide: existing.From.Slide, UCm: existing.From.UCm, VCm: existing.From.VCm}
	}
	if patch.To != nil {
		req.To = *patch.To
	} else {
		req.To = measurementAnchorRequest{ElementID: existing.To.ElementID, Feature: existing.To.Feature, Slide: existing.To.Slide, UCm: existing.To.UCm, VCm: existing.To.VCm}
	}
	if message := req.validate(); message != "" {
		writeError(w, http.StatusBadRequest, message)
		return
	}
	measurement := measurementFromRequest(req, plot.ID)
	measurement.ID = existing.ID
	if !h.resolveMeasurement(w, measurement) {
		return
	}
	if err := dbstore.UpdateStagePlotMeasurement(h.DB, measurement); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	updated, err := dbstore.GetStagePlotMeasurement(h.DB, plot.ID, measurement.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h StagePlotsHandler) deleteMeasurement(w http.ResponseWriter, r *http.Request) {
	_, plot, ok := h.eventAndPlot(w, r)
	if !ok {
		return
	}
	measurementID, ok := parseID(w, chi.URLParam(r, "measurementID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteStagePlotMeasurement(h.DB, plot.ID, measurementID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
