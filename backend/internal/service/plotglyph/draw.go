package plotglyph

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// Drawing a glyph onto the page.
//
// Every mark is flattened to an explicit path in page millimetres and stroked
// at a fixed width, rather than pushed through fpdf's transform stack. The
// reason is stroke weight: an icon is stretched non-uniformly into its
// element's real footprint, and a PDF transform scales the pen along with the
// geometry — a wide, short element would come out with a fat horizontal stroke
// and a thin vertical one. The canvas escapes this with
// vector-effect="non-scaling-stroke"; on paper the escape is to transform the
// points and leave the pen alone.
//
// Flattening also collapses everything to one pipeline. Under a general affine
// a circle is not a circle and a rounded corner is not a quarter circle, so
// both become Béziers regardless; having one path emitter means there is one
// place where a shape can be got wrong.

// Painter is the drawing surface a flattened glyph is emitted onto. fpdf's
// *Fpdf satisfies it; a test can satisfy it without producing a PDF.
type Painter interface {
	MoveTo(x, y float64)
	LineTo(x, y float64)
	CurveBezierCubicTo(cx0, cy0, cx1, cy1, x, y float64)
	ClosePath()
	DrawPath(styleStr string)
	SetLineWidth(width float64)
	SetDashPattern(dashArray []float64, dashPhase float64)
}

// Transform maps a point in the glyph's coordinate box to page millimetres.
// It is deliberately just the pieces a glyph needs — a possibly non-uniform
// scale followed by a rotation about the element's centre — rather than a
// general matrix, so the caller cannot express something the projection does
// not mean.
type Transform struct {
	// ScaleX and ScaleY carry the stretch from the glyph box onto the
	// element's drawn footprint. They differ whenever the element has been
	// resized away from the icon's default proportions.
	ScaleX, ScaleY float64
	// OriginX and OriginY are where the glyph box's (0,0) lands, in mm,
	// before rotation.
	OriginX, OriginY float64
	// RotateDeg turns the drawn element about (PivotX, PivotY), in mm.
	RotateDeg      float64
	PivotX, PivotY float64
}

func (t Transform) apply(x, y float64) (float64, float64) {
	px := t.OriginX + x*t.ScaleX
	py := t.OriginY + y*t.ScaleY
	if t.RotateDeg == 0 {
		return px, py
	}
	radians := t.RotateDeg * math.Pi / 180
	cos, sin := math.Cos(radians), math.Sin(radians)
	dx, dy := px-t.PivotX, py-t.PivotY
	return t.PivotX + dx*cos - dy*sin, t.PivotY + dx*sin + dy*cos
}

// Draw emits every mark of one glyph. lineWidth is in millimetres and is held
// constant across the whole glyph, whatever the stretch.
func Draw(p Painter, marks []Mark, t Transform, lineWidth float64) error {
	for _, mark := range marks {
		subpaths, err := flatten(mark)
		if err != nil {
			return err
		}
		if len(mark.Rotate) == 3 {
			// A mark may carry its own rotation inside the glyph box (the mic's
			// boom, the fixture's tilted body). Compose it by pre-rotating the
			// points in glyph space, which keeps Transform a single stage.
			subpaths = rotateSubpaths(subpaths, mark.Rotate[0], mark.Rotate[1], mark.Rotate[2])
		}
		if len(mark.Dash) > 0 {
			p.SetDashPattern(scaleDash(mark.Dash, t), 0)
		}
		p.SetLineWidth(lineWidth)
		emit(p, subpaths, t)
		style := "D"
		if mark.Fill {
			style = "F"
		}
		p.DrawPath(style)
		if len(mark.Dash) > 0 {
			p.SetDashPattern(nil, 0)
		}
	}
	return nil
}

// A dash pattern is in page units, so it has to be scaled out of glyph units —
// by the geometric mean, since a dash has no single direction.
func scaleDash(dash []float64, t Transform) []float64 {
	factor := math.Sqrt(math.Abs(t.ScaleX * t.ScaleY))
	out := make([]float64, len(dash))
	for i, value := range dash {
		out[i] = value * factor
	}
	return out
}

type point struct{ X, Y float64 }

// A subpath is a polyline-and-cubics run: each segment is either a line to one
// point or a cubic through two controls to an end point.
type segment struct {
	to     point
	c1, c2 point
	curve  bool
}

type subpath struct {
	start    point
	segments []segment
	closed   bool
}

func rotateSubpaths(paths []subpath, degrees, cx, cy float64) []subpath {
	radians := degrees * math.Pi / 180
	cos, sin := math.Cos(radians), math.Sin(radians)
	turn := func(p point) point {
		dx, dy := p.X-cx, p.Y-cy
		return point{cx + dx*cos - dy*sin, cy + dx*sin + dy*cos}
	}
	out := make([]subpath, len(paths))
	for i, path := range paths {
		turned := subpath{start: turn(path.start), closed: path.closed}
		for _, seg := range path.segments {
			turned.segments = append(turned.segments, segment{
				to: turn(seg.to), c1: turn(seg.c1), c2: turn(seg.c2), curve: seg.curve,
			})
		}
		out[i] = turned
	}
	return out
}

func emit(p Painter, paths []subpath, t Transform) {
	for _, path := range paths {
		x, y := t.apply(path.start.X, path.start.Y)
		p.MoveTo(x, y)
		for _, seg := range path.segments {
			if seg.curve {
				c1x, c1y := t.apply(seg.c1.X, seg.c1.Y)
				c2x, c2y := t.apply(seg.c2.X, seg.c2.Y)
				ex, ey := t.apply(seg.to.X, seg.to.Y)
				p.CurveBezierCubicTo(c1x, c1y, c2x, c2y, ex, ey)
			} else {
				ex, ey := t.apply(seg.to.X, seg.to.Y)
				p.LineTo(ex, ey)
			}
		}
		if path.closed {
			p.ClosePath()
		}
	}
}

// kappa is the control-point distance that makes a cubic Bézier approximate a
// quarter circle: 4/3·(√2−1).
const kappa = 0.5522847498307936

func flatten(mark Mark) ([]subpath, error) {
	switch mark.Kind {
	case "path":
		return parsePath(mark.D)
	case "circle":
		return []subpath{ellipse(mark.Cx, mark.Cy, mark.R, mark.R)}, nil
	case "rect":
		radius := 0.0
		if mark.Rx != nil {
			radius = *mark.Rx
		}
		return []subpath{roundedRect(mark.X, mark.Y, mark.W, mark.H, radius)}, nil
	default:
		return nil, fmt.Errorf("plotglyph: unknown mark kind %q", mark.Kind)
	}
}

func ellipse(cx, cy, rx, ry float64) subpath {
	ox, oy := rx*kappa, ry*kappa
	path := subpath{start: point{cx + rx, cy}, closed: true}
	path.segments = []segment{
		{c1: point{cx + rx, cy + oy}, c2: point{cx + ox, cy + ry}, to: point{cx, cy + ry}, curve: true},
		{c1: point{cx - ox, cy + ry}, c2: point{cx - rx, cy + oy}, to: point{cx - rx, cy}, curve: true},
		{c1: point{cx - rx, cy - oy}, c2: point{cx - ox, cy - ry}, to: point{cx, cy - ry}, curve: true},
		{c1: point{cx + ox, cy - ry}, c2: point{cx + rx, cy - oy}, to: point{cx + rx, cy}, curve: true},
	}
	return path
}

func roundedRect(x, y, w, h, r float64) subpath {
	if r <= 0 {
		return subpath{
			start:  point{x, y},
			closed: true,
			segments: []segment{
				{to: point{x + w, y}}, {to: point{x + w, y + h}}, {to: point{x, y + h}},
			},
		}
	}
	r = math.Min(r, math.Min(w/2, h/2))
	o := r * kappa
	corner := func(fromX, fromY, c1X, c1Y, c2X, c2Y, toX, toY float64) segment {
		return segment{c1: point{c1X, c1Y}, c2: point{c2X, c2Y}, to: point{toX, toY}, curve: true}
	}
	return subpath{
		start:  point{x + r, y},
		closed: true,
		segments: []segment{
			{to: point{x + w - r, y}},
			corner(x+w-r, y, x+w-r+o, y, x+w, y+r-o, x+w, y+r),
			{to: point{x + w, y + h - r}},
			corner(x+w, y+h-r, x+w, y+h-r+o, x+w-r+o, y+h, x+w-r, y+h),
			{to: point{x + r, y + h}},
			corner(x+r, y+h, x+r-o, y+h, x, y+h-r+o, x, y+h-r),
			{to: point{x, y + r}},
			corner(x, y+r, x, y+r-o, x+r-o, y, x+r, y),
		},
	}
}

// parsePath reads the SVG subset the glyph file actually contains: absolute
// M, L, C, A and Z. Anything else is an error rather than a silently missing
// mark — a glyph that does not draw is worse on paper than one that fails
// loudly in a test.
func parsePath(d string) ([]subpath, error) {
	tokens, err := tokenizePath(d)
	if err != nil {
		return nil, err
	}
	var paths []subpath
	var current *subpath
	var cursor point
	var startOfSubpath point

	need := func(command byte, have, want int) error {
		if have < want {
			return fmt.Errorf("plotglyph: %q needs %d numbers, found %d", command, want, have)
		}
		return nil
	}

	for i := 0; i < len(tokens); {
		command := tokens[i].command
		i++
		var numbers []float64
		for i < len(tokens) && tokens[i].command == 0 {
			numbers = append(numbers, tokens[i].number)
			i++
		}
		switch command {
		case 'M':
			if err := need('M', len(numbers), 2); err != nil {
				return nil, err
			}
			if current != nil {
				paths = append(paths, *current)
			}
			cursor = point{numbers[0], numbers[1]}
			startOfSubpath = cursor
			current = &subpath{start: cursor}
			// Extra pairs after an M are implicit line-tos, per SVG.
			for j := 2; j+1 < len(numbers); j += 2 {
				cursor = point{numbers[j], numbers[j+1]}
				current.segments = append(current.segments, segment{to: cursor})
			}
		case 'L':
			if current == nil {
				return nil, fmt.Errorf("plotglyph: L before any M")
			}
			if err := need('L', len(numbers), 2); err != nil {
				return nil, err
			}
			for j := 0; j+1 < len(numbers); j += 2 {
				cursor = point{numbers[j], numbers[j+1]}
				current.segments = append(current.segments, segment{to: cursor})
			}
		case 'C':
			if current == nil {
				return nil, fmt.Errorf("plotglyph: C before any M")
			}
			if err := need('C', len(numbers), 6); err != nil {
				return nil, err
			}
			for j := 0; j+5 < len(numbers); j += 6 {
				cursor = point{numbers[j+4], numbers[j+5]}
				current.segments = append(current.segments, segment{
					c1: point{numbers[j], numbers[j+1]}, c2: point{numbers[j+2], numbers[j+3]},
					to: cursor, curve: true,
				})
			}
		case 'A':
			if current == nil {
				return nil, fmt.Errorf("plotglyph: A before any M")
			}
			if err := need('A', len(numbers), 7); err != nil {
				return nil, err
			}
			for j := 0; j+6 < len(numbers); j += 7 {
				end := point{numbers[j+5], numbers[j+6]}
				segments := arcToCubics(cursor, end, numbers[j], numbers[j+1], numbers[j+2],
					numbers[j+3] != 0, numbers[j+4] != 0)
				current.segments = append(current.segments, segments...)
				cursor = end
			}
		case 'Z':
			if current == nil {
				return nil, fmt.Errorf("plotglyph: Z before any M")
			}
			current.closed = true
			paths = append(paths, *current)
			current = nil
			cursor = startOfSubpath
		default:
			return nil, fmt.Errorf("plotglyph: unsupported path command %q in %q", command, d)
		}
	}
	if current != nil {
		paths = append(paths, *current)
	}
	if len(paths) == 0 {
		return nil, fmt.Errorf("plotglyph: empty path %q", d)
	}
	return paths, nil
}

type pathToken struct {
	command byte // 0 for a number
	number  float64
}

func tokenizePath(d string) ([]pathToken, error) {
	var tokens []pathToken
	for i := 0; i < len(d); {
		c := d[i]
		switch {
		case c == ' ' || c == ',' || c == '\t' || c == '\n' || c == '\r':
			i++
		case (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z'):
			if c >= 'a' && c <= 'z' {
				return nil, fmt.Errorf("plotglyph: relative command %q is not supported in %q", c, d)
			}
			tokens = append(tokens, pathToken{command: c})
			i++
		default:
			j := i
			if d[j] == '-' || d[j] == '+' {
				j++
			}
			for j < len(d) && (d[j] >= '0' && d[j] <= '9' || d[j] == '.') {
				j++
			}
			if j == i {
				return nil, fmt.Errorf("plotglyph: unreadable character %q in %q", c, d)
			}
			value, err := strconv.ParseFloat(strings.TrimSpace(d[i:j]), 64)
			if err != nil {
				return nil, fmt.Errorf("plotglyph: %q in %q: %w", d[i:j], d, err)
			}
			tokens = append(tokens, pathToken{number: value})
			i = j
		}
	}
	return tokens, nil
}

// arcToCubics converts SVG's endpoint-parameterised elliptical arc into cubic
// Béziers, following the implementation notes in the SVG specification
// (F.6.5 endpoint to centre, then one cubic per quarter turn or less).
//
// The glyph file uses this twice — the fixture's lens, in two views — but a
// half-correct arc is the kind of thing nobody notices until a fixture looks
// wrong on a printed plot, so it is done properly rather than eyeballed.
func arcToCubics(from, to point, rx, ry, xAxisRotationDeg float64, largeArc, sweep bool) []segment {
	if rx == 0 || ry == 0 || (from.X == to.X && from.Y == to.Y) {
		return []segment{{to: to}}
	}
	rx, ry = math.Abs(rx), math.Abs(ry)
	phi := xAxisRotationDeg * math.Pi / 180
	cosPhi, sinPhi := math.Cos(phi), math.Sin(phi)

	dx2 := (from.X - to.X) / 2
	dy2 := (from.Y - to.Y) / 2
	x1p := cosPhi*dx2 + sinPhi*dy2
	y1p := -sinPhi*dx2 + cosPhi*dy2

	// Scale the radii up if they are too small to span the chord (F.6.6).
	lambda := (x1p*x1p)/(rx*rx) + (y1p*y1p)/(ry*ry)
	if lambda > 1 {
		scale := math.Sqrt(lambda)
		rx *= scale
		ry *= scale
	}

	numerator := rx*rx*ry*ry - rx*rx*y1p*y1p - ry*ry*x1p*x1p
	denominator := rx*rx*y1p*y1p + ry*ry*x1p*x1p
	factor := 0.0
	if denominator != 0 && numerator > 0 {
		factor = math.Sqrt(numerator / denominator)
	}
	if largeArc == sweep {
		factor = -factor
	}
	cxp := factor * rx * y1p / ry
	cyp := -factor * ry * x1p / rx
	cx := cosPhi*cxp - sinPhi*cyp + (from.X+to.X)/2
	cy := sinPhi*cxp + cosPhi*cyp + (from.Y+to.Y)/2

	angle := func(ux, uy, vx, vy float64) float64 {
		dot := ux*vx + uy*vy
		length := math.Hypot(ux, uy) * math.Hypot(vx, vy)
		if length == 0 {
			return 0
		}
		value := math.Acos(math.Max(-1, math.Min(1, dot/length)))
		if ux*vy-uy*vx < 0 {
			return -value
		}
		return value
	}
	startAngle := angle(1, 0, (x1p-cxp)/rx, (y1p-cyp)/ry)
	deltaAngle := angle((x1p-cxp)/rx, (y1p-cyp)/ry, (-x1p-cxp)/rx, (-y1p-cyp)/ry)
	if !sweep && deltaAngle > 0 {
		deltaAngle -= 2 * math.Pi
	} else if sweep && deltaAngle < 0 {
		deltaAngle += 2 * math.Pi
	}

	steps := int(math.Ceil(math.Abs(deltaAngle) / (math.Pi / 2)))
	if steps == 0 {
		steps = 1
	}
	step := deltaAngle / float64(steps)
	alpha := 4.0 / 3.0 * math.Tan(step/4)

	onEllipse := func(theta float64) (point, point) {
		cosTheta, sinTheta := math.Cos(theta), math.Sin(theta)
		p := point{
			X: cx + rx*cosTheta*cosPhi - ry*sinTheta*sinPhi,
			Y: cy + rx*cosTheta*sinPhi + ry*sinTheta*cosPhi,
		}
		// The derivative, which gives the control-point direction.
		derivative := point{
			X: -rx*sinTheta*cosPhi - ry*cosTheta*sinPhi,
			Y: -rx*sinTheta*sinPhi + ry*cosTheta*cosPhi,
		}
		return p, derivative
	}

	segments := make([]segment, 0, steps)
	theta := startAngle
	current, currentDerivative := onEllipse(theta)
	for i := 0; i < steps; i++ {
		next := theta + step
		end, endDerivative := onEllipse(next)
		segments = append(segments, segment{
			c1:    point{current.X + alpha*currentDerivative.X, current.Y + alpha*currentDerivative.Y},
			c2:    point{end.X - alpha*endDerivative.X, end.Y - alpha*endDerivative.Y},
			to:    end,
			curve: true,
		})
		theta = next
		current, currentDerivative = end, endDerivative
	}
	return segments
}
