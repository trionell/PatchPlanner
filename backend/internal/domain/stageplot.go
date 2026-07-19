package domain

// Stage plots (Slice 13). All positions and dimensions are centimetres;
// the frontend canvas renders 1 SVG user unit = 1 cm, so these numbers
// are drawn as-is.

type StagePlot struct {
	ID              int64   `json:"id"`
	EventID         int64   `json:"event_id"`
	Name            string  `json:"name"`
	SortOrder       int     `json:"sort_order"`
	GridVisible     bool    `json:"grid_visible"`
	GridSizeCm      float64 `json:"grid_size_cm"`
	SnapGrid        bool    `json:"snap_grid"`
	SnapObjects     bool    `json:"snap_objects"`
	ShowFixtureName bool    `json:"show_fixture_name"`
	ShowFixtureFID  bool    `json:"show_fixture_fid"`
	ShowFixtureDMX  bool    `json:"show_fixture_dmx"`
	ActiveView      string  `json:"active_view"`
	Zoom            float64 `json:"zoom"`
	PanXCm          float64 `json:"pan_x_cm"`
	PanYCm          float64 `json:"pan_y_cm"`
}

type StagePlotLayer struct {
	ID        int64  `json:"id"`
	PlotID    int64  `json:"plot_id"`
	Name      string `json:"name"`
	SortOrder int    `json:"sort_order"`
	Color     string `json:"color,omitempty"`
	Visible   bool   `json:"visible"`
	Locked    bool   `json:"locked"`
}

type StagePlotElement struct {
	ID      int64  `json:"id"`
	PlotID  int64  `json:"plot_id"`
	LayerID int64  `json:"layer_id"`
	Kind    string `json:"kind"`
	// Exactly one of ShapeKind/Icon/TrussID/FixtureID is set, matching Kind.
	ShapeKind   string  `json:"shape_kind,omitempty"`
	Icon        string  `json:"icon,omitempty"`
	TrussID     *int64  `json:"truss_id,omitempty"`
	FixtureID   *int64  `json:"fixture_id,omitempty"`
	Name        string  `json:"name"`
	XCm         float64 `json:"x_cm"`
	YCm         float64 `json:"y_cm"`
	ZCm         float64 `json:"z_cm"`
	WidthCm     float64 `json:"width_cm"`
	DepthCm     float64 `json:"depth_cm"`
	HeightCm    float64 `json:"height_cm"`
	RotationDeg float64 `json:"rotation_deg"`
	// TiltDeg rakes the element in the front view (rotation about the
	// depth axis), e.g. an angled truss; RotationDeg is the plan view.
	TiltDeg float64         `json:"tilt_deg"`
	Notes   string          `json:"notes,omitempty"`
	Links   []StagePlotLink `json:"links"`
}

// StagePlotLink is one assignment or stack entry on an element,
// referencing a planned entity polymorphically (Go-validated kind, no
// SQL FK — see research.md R6).
type StagePlotLink struct {
	ID         int64  `json:"id"`
	ElementID  int64  `json:"element_id"`
	Role       string `json:"role"`
	EntityKind string `json:"entity_kind"`
	EntityID   int64  `json:"entity_id"`
	SortOrder  int    `json:"sort_order"`
	// DisplayName is resolved at read time from the referenced entity;
	// links whose target no longer exists are dropped, never returned.
	DisplayName string `json:"display_name"`
	// Fixture-only extras so the canvas can compose labels without
	// further requests.
	FixtureNumber   *int `json:"fixture_number,omitempty"`
	DMXUniverse     *int `json:"dmx_universe,omitempty"`
	DMXStartAddress *int `json:"dmx_start_address,omitempty"`
}

// PlotTruss is event-scoped: placed on plots by reference, counted once
// per event on the rental order (research.md R4).
type PlotTruss struct {
	ID            int64              `json:"id"`
	EventID       int64              `json:"event_id"`
	Name          string             `json:"name"`
	HeightCm      float64            `json:"height_cm"`
	TotalLengthCm float64            `json:"total_length_cm"`
	Pieces        []PlotTrussPiece   `json:"pieces"`
	Fixtures      []PlotTrussFixture `json:"fixtures"`
}

type PlotTrussPiece struct {
	ID              int64   `json:"id"`
	TrussID         int64   `json:"truss_id"`
	InventoryItemID *int64  `json:"inventory_item_id,omitempty"`
	ItemName        string  `json:"item_name,omitempty"`
	Label           string  `json:"label,omitempty"`
	LengthCm        float64 `json:"length_cm"`
	SortOrder       int     `json:"sort_order"`
}

type PlotTrussFixture struct {
	ID        int64    `json:"id"`
	TrussID   int64    `json:"truss_id"`
	FixtureID int64    `json:"fixture_id"`
	OffsetCm  *float64 `json:"offset_cm,omitempty"`
	// Side is the lane the fixture hangs on in the top view: the
	// upstage chord ("top"), centre ("middle") or downstage chord
	// ("bottom").
	Side            string `json:"side"`
	FixtureNumber   *int   `json:"fixture_number,omitempty"`
	FixtureName     string `json:"fixture_name"`
	DMXUniverse     int    `json:"dmx_universe"`
	DMXStartAddress *int   `json:"dmx_start_address,omitempty"`
}

// StagePlotResponse is the aggregate read for one plot: everything the
// editor needs in a single query round-trip.
type StagePlotResponse struct {
	Plot     StagePlot          `json:"plot"`
	Layers   []StagePlotLayer   `json:"layers"`
	Elements []StagePlotElement `json:"elements"`
	// Trusses lists ALL of the event's trusses (placed on this plot or
	// not), so the truss manager and the palette share this response.
	Trusses []PlotTruss `json:"trusses"`
}
