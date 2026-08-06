// Package plotglyph holds the stage plot's icon shapes and draws them onto a
// page.
//
// The shapes are not written here. glyphs.json is a verbatim mirror of
// frontend/src/lib/stagePlotGlyphs.json, which the canvas renders into SVG —
// one description of seventeen icons, two renderers. Two hand-written
// descriptions is the arrangement where a glyph edited for the screen quietly
// stops matching the print, and a test in this package fails while the two
// copies differ (`make sync-glyphs` puts them back).
package plotglyph

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

//go:embed glyphs.json
var glyphsJSON []byte

// View is one of the three orthographic views an icon is drawn in.
type View string

const (
	Top   View = "top"
	Front View = "front"
	Side  View = "side"
)

// Defaults is an icon's sensible real-world size, in centimetres. It also sets
// the coordinate box each view's glyph is drawn in: top is width×depth, front
// width×height, side depth×height. Drawing in the true aspect means a
// default-sized element is undistorted and a resized one distorts
// proportionally, exactly as on the canvas.
type Defaults struct {
	WidthCm  float64 `json:"width_cm"`
	DepthCm  float64 `json:"depth_cm"`
	HeightCm float64 `json:"height_cm"`
}

// Mark is one drawing instruction in an icon's own coordinate box. Kind
// selects which of the fields below carry meaning.
type Mark struct {
	Kind string `json:"kind"`
	Fill bool   `json:"fill"`

	// kind == "path"
	D string `json:"d"`

	// kind == "circle"
	Cx float64 `json:"cx"`
	Cy float64 `json:"cy"`
	R  float64 `json:"r"`

	// kind == "rect"
	X  float64  `json:"x"`
	Y  float64  `json:"y"`
	W  float64  `json:"w"`
	H  float64  `json:"h"`
	Rx *float64 `json:"rx"`

	// Optional on any mark.
	Rotate []float64 `json:"rotate"` // degrees, centre x, centre y
	Dash   []float64 `json:"dash"`
}

// Icon is one entry in the registry.
type Icon struct {
	ID       string          `json:"id"`
	Label    string          `json:"label"`
	Group    string          `json:"group"`
	Defaults Defaults        `json:"defaults"`
	Glyphs   map[View][]Mark `json:"glyphs"`
}

// Placeholder is what is drawn for an id the registry does not have: a labelled
// dashed box, visible rather than absent, exactly as on the canvas.
type Placeholder struct {
	Box   [2]float64 `json:"box"`
	Marks []Mark     `json:"marks"`
}

type registry struct {
	Version     int         `json:"version"`
	Icons       []Icon      `json:"icons"`
	Placeholder Placeholder `json:"placeholder"`
}

var loaded registry

func init() {
	if err := json.Unmarshal(glyphsJSON, &loaded); err != nil {
		panic(fmt.Sprintf("plotglyph: glyphs.json is not readable: %v", err))
	}
}

// Icons returns the registry in file order.
func Icons() []Icon { return loaded.Icons }

// Lookup finds an icon by id.
func Lookup(id string) (Icon, bool) {
	for _, icon := range loaded.Icons {
		if icon.ID == id {
			return icon, true
		}
	}
	return Icon{}, false
}

// Box is the coordinate box a glyph is drawn in for a view, in the icon's own
// units. An unknown id gets the placeholder's box, which is what makes an
// unknown icon draw as a placeholder rather than at a wrong size.
func Box(id string, view View) (width, height float64) {
	icon, ok := Lookup(id)
	if !ok {
		return loaded.Placeholder.Box[0], loaded.Placeholder.Box[1]
	}
	switch view {
	case Top:
		return icon.Defaults.WidthCm, icon.Defaults.DepthCm
	case Front:
		return icon.Defaults.WidthCm, icon.Defaults.HeightCm
	default:
		return icon.Defaults.DepthCm, icon.Defaults.HeightCm
	}
}

// Marks are the drawing instructions for an id in a view. It falls back per
// view, then to the top-down glyph, then to the placeholder — the same ladder
// the canvas walks, so neither renderer can show something the other will not.
func Marks(id string, view View) []Mark {
	icon, ok := Lookup(id)
	if !ok {
		return loaded.Placeholder.Marks
	}
	if marks, ok := icon.Glyphs[view]; ok && len(marks) > 0 {
		return marks
	}
	if marks, ok := icon.Glyphs[Top]; ok && len(marks) > 0 {
		return marks
	}
	return loaded.Placeholder.Marks
}
