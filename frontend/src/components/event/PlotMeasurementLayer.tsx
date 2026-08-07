import type { PointerEvent as ReactPointerEvent } from 'react'
import type { StagePlotElement, StagePlotLayer, StagePlotMeasurement, StagePlotView } from '../../types'
import {
  measurementGeometry,
  visibleMeasurements,
  type MeasurementDrawing,
  type PlaneVec,
} from '../../lib/stagePlot'

// Measurements drawn on the plot canvas (Slice 42).
//
// The geometry is centimetres and comes from lib/stagePlot; everything here is
// the DRAWING of it, and every size that is about legibility rather than about
// the stage is a screen size written `n / zoom` — the convention the canvas
// already uses for every stroke it makes.
//
// One annotation ink for every measurement, never the layer's colour: layer
// colour tells equipment apart, and a dimension spanning two layers could not
// honestly claim either.
const INK_LINE = '#71717a'
const INK_VALUE = '#d4d4d8'
const INK_SELECTED = '#a5b4fc'
const INK_HANDLE = '#6366f1'

const ARROW_LENGTH_PX = 9
const ARROW_HALF_PX = 3
const EXTENSION_GAP_PX = 4
const EXTENSION_OVERSHOOT_PX = 5
const VALUE_SIZE_PX = 12
const VALUE_LIFT_PX = 5
const HANDLE_PX = 8
const HANDLE_LIFT_PX = 12
const PAINT_PX = 1.5
/** The transparent stroke that catches the pointer. Separate geometry from the
 *  painted line, because a 1.5 px line is not a target. */
const HIT_DESK_PX = 14
const HIT_HAND_PX = 44

export interface MeasurementPointerContext {
  measurement: StagePlotMeasurement
  drawing: MeasurementDrawing
}

interface PlotMeasurementLayerProps {
  measurements: StagePlotMeasurement[]
  elementById: Map<number, StagePlotElement>
  layerById: Map<number, StagePlotLayer>
  view: StagePlotView
  zoom: number
  selectedMeasurementId: number | null
  isMobile?: boolean
  onSelect?: (id: number) => void
  onOffsetPointerDown?: (event: ReactPointerEvent, context: MeasurementPointerContext) => void
  onEndPointerDown?: (event: ReactPointerEvent, context: MeasurementPointerContext, end: 'from' | 'to') => void
}

/** The canvas draws elevations with v flipped onto SVG's downward y. */
function toSvg(point: PlaneVec, view: StagePlotView): { x: number; y: number } {
  return { x: point.u, y: view === 'top' ? point.v : -point.v }
}

function formatValue(valueCm: number): string {
  return `${Math.round(valueCm)}`
}

/** Is the label's own extent longer than the space between the terminators? */
function labelFitsInside(measurement: StagePlotMeasurement, drawing: MeasurementDrawing, zoom: number): boolean {
  const text = formatValue(drawing.value) + ' cm' + (measurement.note ? ` ${measurement.note}` : '')
  // 0.6 em per character is the usual monospace approximation; this only has
  // to decide inside-or-outside, not lay text out.
  const widthCm = (text.length * VALUE_SIZE_PX * 0.6) / zoom
  const roomCm = drawing.value - (2 * ARROW_LENGTH_PX) / zoom
  return widthCm <= roomCm
}

export function PlotMeasurementLayer({
  measurements,
  elementById,
  layerById,
  view,
  zoom,
  selectedMeasurementId,
  isMobile = false,
  onSelect,
  onOffsetPointerDown,
  onEndPointerDown,
}: PlotMeasurementLayerProps) {
  const px = (value: number) => value / zoom

  return (
    <g data-testid="plot-measurements">
      {visibleMeasurements(measurements, view, elementById, layerById).map((measurement) => {
        const drawing = measurementGeometry(measurement, elementById, view)
        if (!drawing) return null

        const selected = measurement.id === selectedMeasurementId
        const locked = layerById.get(measurement.layer_id)?.locked === true
        const ink = selected ? INK_SELECTED : INK_LINE

        const a = toSvg(drawing.a, view)
        const b = toSvg(drawing.b, view)
        const lineA = toSvg(drawing.lineA, view)
        const lineB = toSvg(drawing.lineB, view)

        // The dimension line's direction on the page, which every screen-sized
        // piece of furniture is measured along.
        const dx = lineB.x - lineA.x
        const dy = lineB.y - lineA.y
        const spanPx = Math.hypot(dx, dy)
        const ux = spanPx === 0 ? 1 : dx / spanPx
        const uy = spanPx === 0 ? 0 : dy / spanPx
        const nx = -uy
        const ny = ux

        // Extension lines stop short of the anchor and run past the dimension
        // line, so neither touches what it is pointing at.
        const extension = (anchor: { x: number; y: number }, end: { x: number; y: number }) => {
          const ex = end.x - anchor.x
          const ey = end.y - anchor.y
          const len = Math.hypot(ex, ey)
          if (len < px(EXTENSION_GAP_PX)) return null
          const kx = ex / len
          const ky = ey / len
          return {
            x1: anchor.x + kx * px(EXTENSION_GAP_PX),
            y1: anchor.y + ky * px(EXTENSION_GAP_PX),
            x2: end.x + kx * px(EXTENSION_OVERSHOOT_PX),
            y2: end.y + ky * px(EXTENSION_OVERSHOOT_PX),
          }
        }
        const extA = extension(a, lineA)
        const extB = extension(b, lineB)

        const inside = labelFitsInside(measurement, drawing, zoom)
        // Filled triangles, pointing inward when the label fits between them
        // and outward when it does not — CAD's rule, and the reason a short
        // dimension stays readable instead of colliding with itself.
        const arrow = (at: { x: number; y: number }, sign: number) => {
          const tipX = at.x
          const tipY = at.y
          const baseX = tipX + sign * ux * px(ARROW_LENGTH_PX)
          const baseY = tipY + sign * uy * px(ARROW_LENGTH_PX)
          return `${tipX},${tipY} ${baseX + nx * px(ARROW_HALF_PX)},${baseY + ny * px(ARROW_HALF_PX)} ${baseX - nx * px(ARROW_HALF_PX)},${baseY - ny * px(ARROW_HALF_PX)}`
        }

        const midX = (lineA.x + lineB.x) / 2
        const midY = (lineA.y + lineB.y) / 2
        // Text runs along the line, never upside down.
        let angle = (Math.atan2(dy, dx) * 180) / Math.PI
        if (angle > 90 || angle < -90) angle += 180
        const labelX = inside ? midX : lineB.x + ux * px(ARROW_LENGTH_PX * 2)
        const labelY = inside ? midY : lineB.y + uy * px(ARROW_LENGTH_PX * 2)

        // A right angle is drawn where a perpendicular meets a face, because
        // "this is perpendicular" is the whole claim of that measurement.
        const perpendicularEnd = measurement.from.slide ? 'from' : measurement.to.slide ? 'to' : null
        const perpendicularAt = perpendicularEnd === 'from' ? a : perpendicularEnd === 'to' ? b : null

        const handleX = midX + nx * px(HANDLE_LIFT_PX)
        const handleY = midY + ny * px(HANDLE_LIFT_PX)

        return (
          <g key={measurement.id}>
            {extA && <line x1={extA.x1} y1={extA.y1} x2={extA.x2} y2={extA.y2} stroke={ink} strokeWidth={px(1)} />}
            {extB && <line x1={extB.x1} y1={extB.y1} x2={extB.x2} y2={extB.y2} stroke={ink} strokeWidth={px(1)} />}

            <line x1={lineA.x} y1={lineA.y} x2={lineB.x} y2={lineB.y} stroke={ink} strokeWidth={px(PAINT_PX)} />
            <polygon points={arrow(lineA, inside ? 1 : -1)} fill={ink} />
            <polygon points={arrow(lineB, inside ? -1 : 1)} fill={ink} />

            {perpendicularAt && (
              <polyline
                points={`${perpendicularAt.x + ux * px(7)},${perpendicularAt.y + uy * px(7)} ${perpendicularAt.x + ux * px(7) + nx * px(7)},${perpendicularAt.y + uy * px(7) + ny * px(7)} ${perpendicularAt.x + nx * px(7)},${perpendicularAt.y + ny * px(7)}`}
                fill="none"
                stroke={ink}
                strokeWidth={px(1)}
              />
            )}

            <text
              x={labelX}
              y={labelY - px(VALUE_LIFT_PX)}
              transform={`rotate(${angle} ${labelX} ${labelY - px(VALUE_LIFT_PX)})`}
              textAnchor={inside ? 'middle' : 'start'}
              fill={INK_VALUE}
              fontFamily="ui-monospace, monospace"
              fontSize={px(VALUE_SIZE_PX)}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {measurement.note ? `${measurement.note}  ` : ''}
              {formatValue(drawing.value)}
              <tspan fill={INK_LINE} fontSize={px(VALUE_SIZE_PX * 0.8)}>
                {' cm'}
              </tspan>
            </text>

            {/* The target, painted transparent and sized for the hand. */}
            <line
              x1={lineA.x}
              y1={lineA.y}
              x2={lineB.x}
              y2={lineB.y}
              stroke="transparent"
              strokeWidth={px(isMobile ? HIT_HAND_PX : HIT_DESK_PX)}
              style={{ cursor: 'pointer' }}
              onPointerDown={(event) => {
                event.stopPropagation()
                onSelect?.(measurement.id)
              }}
            />

            {/* Grips: the offset tab and the two ends. A locked layer keeps
                the measurement readable and selectable and takes these away,
                exactly as it does for an element's resize handles. */}
            {selected && !locked && !isMobile && (
              <>
                <rect
                  x={handleX - px(HANDLE_PX) / 2}
                  y={handleY - px(HANDLE_PX) / 2}
                  width={px(HANDLE_PX)}
                  height={px(HANDLE_PX)}
                  fill={INK_HANDLE}
                  style={{ cursor: 'move' }}
                  onPointerDown={(event) => onOffsetPointerDown?.(event, { measurement, drawing })}
                />
                {(['from', 'to'] as const).map((end) => {
                  const at = end === 'from' ? a : b
                  return (
                    <circle
                      key={end}
                      cx={at.x}
                      cy={at.y}
                      r={px(HANDLE_PX) / 2}
                      fill={INK_HANDLE}
                      style={{ cursor: 'crosshair' }}
                      onPointerDown={(event) => onEndPointerDown?.(event, { measurement, drawing }, end)}
                    />
                  )
                })}
              </>
            )}
          </g>
        )
      })}
    </g>
  )
}
