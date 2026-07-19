import type { PlotTruss, StagePlotElement, StagePlotResponse, StagePlotView } from '../../types'
import { clampFixtureOffset, fixtureLabel, projectedBounds, projectElement, trussLaneLocalV } from '../../lib/stagePlot'
import { iconGlyph, iconViewBox } from '../../lib/stagePlotIcons'
import { PrintSheet } from './PrintSheet'

const VIEW_TITLES: Record<StagePlotView, string> = { top: 'Top view', front: 'Front view', side: 'Side view' }

/**
 * Paper rendering of one stage plot's active view: the same elements
 * through the same projection/label helpers the editor uses, framed to
 * the content with a scale caption. Black-on-white comes from the
 * .print-sheet print rules.
 */
export function StagePlotSheet({ eventId, response }: { eventId: number; response: StagePlotResponse }) {
  const { plot, layers, elements, trusses } = response
  const view = plot.active_view
  const trussById = new Map(trusses.map((truss) => [truss.id, truss]))
  const layerById = new Map(layers.map((layer) => [layer.id, layer]))

  // Same derived truss geometry the canvas uses.
  const effective = (element: StagePlotElement): StagePlotElement => {
    if (element.kind === 'truss' && element.truss_id != null) {
      const truss = trussById.get(element.truss_id)
      if (truss) {
        return { ...element, width_cm: Math.max(truss.total_length_cm, 20), height_cm: 30, z_cm: truss.height_cm, name: element.name || truss.name }
      }
    }
    return element
  }

  const visible = elements.filter((element) => layerById.get(element.layer_id)?.visible).map(effective)

  // Frame the drawing to its content with a margin.
  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity
  for (const element of visible) {
    const bounds = projectedBounds(element, view)
    minU = Math.min(minU, bounds.minU)
    maxU = Math.max(maxU, bounds.maxU)
    minV = Math.min(minV, bounds.minV)
    maxV = Math.max(maxV, bounds.maxV)
  }
  if (view !== 'top') {
    minV = Math.min(minV, 0) // always include the floor line
  }
  const empty = visible.length === 0
  const margin = 60
  const originU = (empty ? 0 : minU) - margin
  const spanU = (empty ? 200 : maxU - minU) + margin * 2
  const spanV = (empty ? 200 : maxV - minV) + margin * 2
  // SVG y grows down; elevations flip v (up-positive) exactly like the canvas.
  const originY = view === 'top' ? (empty ? 0 : minV) - margin : -((empty ? 100 : maxV) + margin)
  const fontSize = Math.max(spanU, spanV) / 60

  const renderElement = (element: StagePlotElement) => {
    const rect = projectElement(element, view)
    const svgY = view === 'top' ? rect.v : -rect.v
    const halfW = rect.width / 2
    const halfH = rect.height / 2
    let body
    if (element.kind === 'shape') {
      switch (element.shape_kind) {
        case 'rect':
          body = <rect x={-halfW} y={-halfH} width={rect.width} height={rect.height} fill="none" stroke="black" strokeWidth={fontSize / 8} />
          break
        case 'ellipse':
          // Straight-on a cylinder is a rectangle, like the editor.
          body =
            view === 'top' ? (
              <ellipse rx={halfW} ry={halfH} fill="none" stroke="black" strokeWidth={fontSize / 8} />
            ) : (
              <rect x={-halfW} y={-halfH} width={rect.width} height={rect.height} fill="none" stroke="black" strokeWidth={fontSize / 8} />
            )
          break
        case 'line':
          body = <line x1={-halfW} x2={halfW} y1={0} y2={0} stroke="black" strokeWidth={fontSize / 8} />
          break
        case 'text':
          body = (
            <text textAnchor="middle" dominantBaseline="middle" fill="black" fontSize={Math.max(rect.height, fontSize)}>
              {element.name}
            </text>
          )
          break
        default:
          body = null
      }
    } else if (element.kind === 'resource' || (element.kind === 'fixture' && element.fixture_id != null)) {
      const iconId = element.kind === 'fixture' ? 'fixture' : (element.icon ?? '')
      body = (
        <svg
          x={-halfW}
          y={-halfH}
          width={rect.width}
          height={rect.height}
          viewBox={iconViewBox(iconId, view)}
          preserveAspectRatio="none"
          overflow="visible"
          style={{ color: 'black' }}
        >
          {iconGlyph(iconId, view)}
        </svg>
      )
    } else if (element.kind === 'truss' && element.truss_id != null && trussById.has(element.truss_id)) {
      const truss = trussById.get(element.truss_id) as PlotTruss
      const settings = { show_fixture_name: plot.show_fixture_name, show_fixture_fid: plot.show_fixture_fid, show_fixture_dmx: plot.show_fixture_dmx }
      body = (
        <g>
          <rect x={-halfW} y={-halfH} width={rect.width} height={Math.max(rect.height, 4)} fill="none" stroke="black" strokeWidth={fontSize / 8} />
          {truss.fixtures.map((fixture) => {
              if (fixture.offset_cm == null) return null
              const { offset } = clampFixtureOffset(fixture.offset_cm, Math.max(truss.total_length_cm, 20))
              const label = fixtureLabel(fixture, settings)
              // Same lanes as the editor: on the bar in the top view,
              // hanging below it in the elevations; the side view puts
              // the lane across the bar's depth.
              const markerX = view === 'side' ? trussLaneLocalV(fixture.side, halfW) : -halfW + offset
              const markerY = view === 'top' ? trussLaneLocalV(fixture.side, halfH) - fontSize / 2 : halfH
              return (
                <g key={fixture.id} transform={`translate(${markerX} 0)`}>
                  <rect x={-fontSize / 2} y={markerY} width={fontSize} height={fontSize} fill="none" stroke="black" strokeWidth={fontSize / 10} />
                  {label && (
                    <text y={halfH + fontSize * 2} textAnchor="middle" fill="black" fontSize={fontSize * 0.8}>
                      {label}
                    </text>
                  )}
                </g>
              )
            })}
        </g>
      )
    } else {
      body = <rect x={-halfW} y={-halfH} width={rect.width} height={Math.max(rect.height, 4)} fill="none" stroke="black" strokeDasharray={`${fontSize / 2} ${fontSize / 3}`} strokeWidth={fontSize / 8} />
    }
    const showLabel = element.name && !(element.kind === 'shape' && element.shape_kind === 'text')
    return (
      <g key={element.id} transform={`translate(${rect.u} ${svgY}) rotate(${rect.rotationDeg})`}>
        {body}
        {showLabel && (
          <text y={halfH + fontSize * 1.3} textAnchor="middle" fill="black" fontSize={fontSize} transform={`rotate(${-rect.rotationDeg})`}>
            {element.name}
          </text>
        )}
      </g>
    )
  }

  return (
    <PrintSheet eventId={eventId} title={`Stage Plot — ${plot.name} (${VIEW_TITLES[view]})`} empty={empty}>
      <p className="mb-2 text-sm">
        Grid square = {plot.grid_size_cm} cm · all dimensions in centimetres, drawn to scale
      </p>
      <svg
        data-testid="stage-plot-sheet-svg"
        viewBox={`${originU} ${originY} ${spanU} ${spanV}`}
        className="w-full border border-zinc-400"
        style={{ maxHeight: '160mm' }}
      >
        {view !== 'top' && <line x1={originU} x2={originU + spanU} y1={0} y2={0} stroke="black" strokeDasharray={`${fontSize} ${fontSize / 2}`} strokeWidth={fontSize / 10} />}
        {visible.map(renderElement)}
      </svg>
    </PrintSheet>
  )
}
