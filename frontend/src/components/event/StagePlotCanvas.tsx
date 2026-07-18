import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import type { PlotTruss, StagePlot, StagePlotElement, StagePlotLayer, StagePlotView } from '../../types'
import type { StagePlotElementPatch } from '../../api/stagePlots'
import {
  clampDimension,
  clampFixtureOffset,
  fixtureLabel,
  projectedBounds,
  projectElement,
  roundCm,
  snapPosition,
  viewAxisFields,
  type SnapGuide,
} from '../../lib/stagePlot'
import { iconGlyph } from '../../lib/stagePlotIcons'

/** Live viewport state (owned by the tab so the palette can place
 *  elements at the visible center). Pan is the viewBox origin in cm. */
export interface PlotViewState {
  zoom: number
  panX: number
  panY: number
}

interface StagePlotCanvasProps {
  plot: StagePlot
  layers: StagePlotLayer[]
  elements: StagePlotElement[]
  trusses: PlotTruss[]
  view: StagePlotView
  viewState: PlotViewState
  onViewStateChange: (state: PlotViewState) => void
  selectedElementId: number | null
  onSelectElement: (id: number | null) => void
  onUpdateElement: (id: number, patch: StagePlotElementPatch) => void
  onCanvasSize?: (size: { width: number; height: number }) => void
}

const DEFAULT_LAYER_COLOR = '#a1a1aa'
const MIN_ZOOM = 0.05
const MAX_ZOOM = 20

/** Grid lines over the visible cm range, coarsened (×2 steps) until
 *  lines are at least 8 screen px apart. */
function renderGrid(gridSizeCm: number, zoom: number, panX: number, panY: number, size: { width: number; height: number }) {
  let step = gridSizeCm
  while (step * zoom < 8) step *= 2
  const endU = panX + size.width / zoom
  const endV = panY + size.height / zoom
  const lines: JSX.Element[] = []
  for (let u = Math.floor(panX / step) * step; u <= endU; u += step) {
    lines.push(<line key={`u${u}`} x1={u} x2={u} y1={panY} y2={endV} stroke="#1e1e22" strokeWidth={1 / zoom} />)
  }
  for (let v = Math.floor(panY / step) * step; v <= endV; v += step) {
    lines.push(<line key={`v${v}`} x1={panX} x2={endU} y1={v} y2={v} stroke="#1e1e22" strokeWidth={1 / zoom} />)
  }
  return <g>{lines}</g>
}

type DragMode =
  | { kind: 'none' }
  | { kind: 'maybe-pan'; startClientX: number; startClientY: number; startPanX: number; startPanY: number; moved: boolean }
  | { kind: 'move'; elementId: number; startU: number; startV: number; origin: StagePlotElement; moved: boolean }
  | { kind: 'resize'; elementId: number; origin: StagePlotElement }
  | { kind: 'rotate'; elementId: number; origin: StagePlotElement }

export function StagePlotCanvas({
  plot,
  layers,
  elements,
  trusses,
  view,
  viewState,
  onViewStateChange,
  selectedElementId,
  onSelectElement,
  onUpdateElement,
  onCanvasSize,
}: StagePlotCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 800, height: 560 })
  const [drag, setDrag] = useState<DragMode>({ kind: 'none' })
  // During a drag the element's pending values live here; the store is
  // only written on drop (save-on-drop, the graph canvas pattern).
  const [override, setOverride] = useState<{ id: number; patch: StagePlotElementPatch } | null>(null)
  const [guides, setGuides] = useState<SnapGuide[]>([])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect
      const next = { width: Math.max(100, rect.width), height: Math.max(100, rect.height) }
      setSize(next)
      onCanvasSize?.(next)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [onCanvasSize])

  const { zoom, panX, panY } = viewState
  const layerById = new Map(layers.map((layer) => [layer.id, layer]))

  /** Screen client coordinates → view-plane cm (u, v as SVG x/y). */
  const clientToCm = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return { u: 0, v: 0 }
      return { u: panX + (clientX - rect.left) / zoom, v: panY + (clientY - rect.top) / zoom }
    },
    [panX, panY, zoom],
  )

  const trussById = new Map(trusses.map((truss) => [truss.id, truss]))

  // Live drag override + derived truss geometry (a truss's length is the
  // sum of its pieces; its vertical placement is its hang height —
  // FR-023/FR-025), folded in here so rendering, dragging and snapping
  // all agree on one geometry.
  const effectiveElement = (element: StagePlotElement): StagePlotElement => {
    let current = override && override.id === element.id ? { ...element, ...override.patch } : element
    if (current.kind === 'truss' && current.truss_id != null) {
      const truss = trussById.get(current.truss_id)
      if (truss) {
        current = {
          ...current,
          width_cm: Math.max(truss.total_length_cm, 20),
          height_cm: 30,
          z_cm: truss.height_cm,
          name: current.name || truss.name,
        }
      }
    }
    return current
  }

  // ---- Interaction handlers ----

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const factor = Math.exp(-event.deltaY * 0.0015)
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor))
    // Keep the cm point under the cursor stationary while zooming.
    const cursorU = panX + (event.clientX - rect.left) / zoom
    const cursorV = panY + (event.clientY - rect.top) / zoom
    onViewStateChange({
      zoom: nextZoom,
      panX: cursorU - (event.clientX - rect.left) / nextZoom,
      panY: cursorV - (event.clientY - rect.top) / nextZoom,
    })
  }

  const handleBackgroundPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({
      kind: 'maybe-pan',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanX: panX,
      startPanY: panY,
      moved: false,
    })
  }

  const handleElementPointerDown = (event: ReactPointerEvent, element: StagePlotElement) => {
    if (event.button !== 0) return
    const layer = layerById.get(element.layer_id)
    if (layer?.locked) return
    event.stopPropagation()
    svgRef.current?.setPointerCapture(event.pointerId)
    onSelectElement(element.id)
    const point = clientToCm(event.clientX, event.clientY)
    setDrag({ kind: 'move', elementId: element.id, startU: point.u, startV: point.v, origin: element, moved: false })
  }

  const handleHandlePointerDown = (event: ReactPointerEvent, element: StagePlotElement, mode: 'resize' | 'rotate') => {
    if (event.button !== 0) return
    event.stopPropagation()
    svgRef.current?.setPointerCapture(event.pointerId)
    setDrag(mode === 'resize' ? { kind: 'resize', elementId: element.id, origin: element } : { kind: 'rotate', elementId: element.id, origin: element })
  }

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (drag.kind === 'none') return
    const point = clientToCm(event.clientX, event.clientY)

    if (drag.kind === 'maybe-pan') {
      const dx = event.clientX - drag.startClientX
      const dy = event.clientY - drag.startClientY
      if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
      setDrag({ ...drag, moved: true })
      onViewStateChange({ zoom, panX: drag.startPanX - dx / zoom, panY: drag.startPanY - dy / zoom })
      return
    }

    if (drag.kind === 'move') {
      const axes = viewAxisFields(view)
      const du = point.u - drag.startU
      const dv = point.v - drag.startV
      // Work on the projected rect centre in the view plane (v up in
      // elevations, SVG y down — hence the flipped dv there).
      const originRect = projectElement(drag.origin, view)
      const originBounds = projectedBounds(drag.origin, view)
      const proposed = {
        u: originRect.u + du,
        v: view === 'top' ? originRect.v + dv : originRect.v - dv,
      }
      const neighbors = elements
        .filter((entry) => entry.id !== drag.elementId && layerById.get(entry.layer_id)?.visible)
        .map((entry) => projectedBounds(effectiveElement(entry), view))
      const snapped = snapPosition(
        proposed,
        { halfW: (originBounds.maxU - originBounds.minU) / 2, halfH: (originBounds.maxV - originBounds.minV) / 2 },
        neighbors,
        { snapGrid: plot.snap_grid, snapObjects: plot.snap_objects, gridSizeCm: plot.grid_size_cm },
        zoom,
      )
      setGuides(snapped.guides)
      const patch: StagePlotElementPatch = {}
      patch[axes.u] = roundCm(snapped.u)
      if (view === 'top') {
        patch[axes.v] = roundCm(snapped.v)
      } else {
        // Snapped v is the rect centre; z_cm stores the element bottom.
        patch[axes.v] = roundCm(snapped.v - drag.origin.height_cm / 2)
      }
      if (!drag.moved) setDrag({ ...drag, moved: true })
      setOverride({ id: drag.elementId, patch })
      return
    }

    if (drag.kind === 'resize') {
      const origin = drag.origin
      const rect = projectElement(origin, view)
      // Transform the pointer into the element's unrotated local frame,
      // then size from the fixed NW corner (rotation only in top view).
      const radians = view === 'top' ? (origin.rotation_deg * Math.PI) / 180 : 0
      const cos = Math.cos(-radians)
      const sin = Math.sin(-radians)
      const relU = point.u - rect.u
      const relV = point.v - rect.v
      const localU = relU * cos - relV * sin
      const localV = relU * sin + relV * cos
      const newW = clampDimension(roundCm(localU + rect.width / 2))
      const newH = clampDimension(roundCm(localV + rect.height / 2))
      const patch: StagePlotElementPatch = {}
      if (view === 'top') {
        patch.width_cm = newW
        patch.depth_cm = newH
      } else if (view === 'front') {
        patch.width_cm = newW
        patch.height_cm = newH
      } else {
        patch.depth_cm = newW
        patch.height_cm = newH
      }
      setOverride({ id: drag.elementId, patch })
      return
    }

    if (drag.kind === 'rotate' && view === 'top') {
      const origin = drag.origin
      const angle = (Math.atan2(point.v - origin.y_cm, point.u - origin.x_cm) * 180) / Math.PI + 90
      const normalized = Math.round(((angle % 360) + 360) % 360)
      setOverride({ id: drag.elementId, patch: { rotation_deg: normalized } })
    }
  }

  const handlePointerUp = () => {
    if (drag.kind === 'maybe-pan') {
      if (!drag.moved) onSelectElement(null)
    } else if (drag.kind !== 'none' && override && override.id === drag.elementId && Object.keys(override.patch).length > 0) {
      const skipSave = drag.kind === 'move' && !drag.moved
      if (!skipSave) onUpdateElement(override.id, override.patch)
    }
    setOverride(null)
    setGuides([])
    setDrag({ kind: 'none' })
  }

  // ---- Rendering ----

  const orderedLayers = [...layers].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  const fontSize = 12 / zoom
  const handlePx = 8 / zoom

  const renderElement = (element: StagePlotElement, layer: StagePlotLayer) => {
    const current = effectiveElement(element)
    const rect = projectElement(current, view)
    // SVG y grows downward; elevations flip v so the floor (v = 0) sits
    // at y = 0 with height going negative (up).
    const svgY = view === 'top' ? rect.v : -rect.v
    const color = layer.color || DEFAULT_LAYER_COLOR
    const selected = element.id === selectedElementId
    const halfW = rect.width / 2
    const halfH = rect.height / 2

    let body
    if (current.kind === 'shape') {
      switch (current.shape_kind) {
        case 'rect':
          body = <rect x={-halfW} y={-halfH} width={rect.width} height={rect.height} fill="transparent" stroke="currentColor" strokeWidth={2 / zoom} />
          break
        case 'ellipse':
          body = <ellipse cx={0} cy={0} rx={halfW} ry={halfH} fill="transparent" stroke="currentColor" strokeWidth={2 / zoom} />
          break
        case 'line':
          body = <line x1={-halfW} y1={0} x2={halfW} y2={0} stroke="currentColor" strokeWidth={2 / zoom} />
          break
        case 'text':
          body = (
            <text textAnchor="middle" dominantBaseline="middle" fill="currentColor" fontSize={Math.max(rect.height, fontSize)}>
              {current.name || 'Text'}
            </text>
          )
          break
        default:
          body = null
      }
    } else if (current.kind === 'resource') {
      body = (
        <svg x={-halfW} y={-halfH} width={rect.width} height={rect.height} viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible">
          {iconGlyph(current.icon ?? '', view)}
        </svg>
      )
    } else if (current.kind === 'truss' && current.truss_id != null && trussById.has(current.truss_id)) {
      const truss = trussById.get(current.truss_id) as PlotTruss
      const length = Math.max(truss.total_length_cm, 20)
      const labelSettings = {
        show_fixture_name: plot.show_fixture_name,
        show_fixture_fid: plot.show_fixture_fid,
        show_fixture_dmx: plot.show_fixture_dmx,
      }
      // Piece divider positions (cumulative lengths along the bar).
      const dividers: number[] = []
      let cumulative = 0
      for (let i = 0; i < truss.pieces.length - 1; i++) {
        cumulative += truss.pieces[i].length_cm
        dividers.push(cumulative)
      }
      const barHalf = view === 'side' ? halfW : halfH
      body = (
        <g>
          <rect x={-halfW} y={-halfH} width={rect.width} height={Math.max(rect.height, 4)} fill="rgba(245,158,11,0.08)" stroke="currentColor" strokeWidth={2 / zoom} />
          {view !== 'side' &&
            dividers.map((position) => (
              <line key={position} x1={-halfW + position} x2={-halfW + position} y1={-halfH} y2={halfH} stroke="currentColor" strokeWidth={1 / zoom} opacity={0.6} />
            ))}
          {view !== 'side' &&
            truss.fixtures.map((fixture) => {
              if (fixture.offset_cm == null) return null
              const { offset, clamped } = clampFixtureOffset(fixture.offset_cm, length)
              const label = fixtureLabel(fixture, labelSettings)
              const size = Math.max(14, 10 / zoom)
              return (
                <g key={fixture.id} transform={`translate(${-halfW + offset} ${barHalf})`}>
                  <rect
                    x={-size / 2}
                    y={2 / zoom}
                    width={size}
                    height={size * 0.8}
                    rx={2 / zoom}
                    fill={clamped ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.25)'}
                    stroke={clamped ? '#ef4444' : 'currentColor'}
                    strokeWidth={1.2 / zoom}
                  >
                    {clamped && <title>Beyond the truss's current length — reposition this fixture</title>}
                  </rect>
                  {label && (
                    <text y={size * 0.8 + 2 / zoom + fontSize} textAnchor="middle" fill="#a1a1aa" fontSize={fontSize * 0.85} style={{ userSelect: 'none' }}>
                      {label}
                    </text>
                  )}
                </g>
              )
            })}
        </g>
      )
    } else {
      // Free-standing fixture placement (or a truss whose row vanished):
      // an honest outlined box so nothing is invisible.
      body = (
        <rect x={-halfW} y={-halfH} width={rect.width} height={Math.max(rect.height, 4)} fill="transparent" stroke="currentColor" strokeDasharray={`${6 / zoom} ${4 / zoom}`} strokeWidth={2 / zoom} />
      )
    }

    const showLabel = current.kind !== 'shape' || current.shape_kind !== 'text'
    return (
      <g
        key={element.id}
        transform={`translate(${rect.u} ${svgY}) rotate(${view === 'top' ? rect.rotationDeg : 0})`}
        style={{ color, pointerEvents: layer.locked ? 'none' : undefined, opacity: layer.locked ? 0.75 : 1 }}
        onPointerDown={(event) => handleElementPointerDown(event, element)}
        className="cursor-move"
      >
        {/* Invisible hit area so thin shapes stay grabbable. */}
        <rect x={-halfW - 4 / zoom} y={-halfH - 4 / zoom} width={rect.width + 8 / zoom} height={Math.max(rect.height, 4) + 8 / zoom} fill="transparent" stroke="none" />
        {body}
        {/* Assignment / stack badges (US4): ×N for stacks, a count pill
            for assignments — matching the approved mockup. */}
        {(() => {
          const stackCount = current.links.filter((link) => link.role === 'stack').length
          const assignmentCount = current.links.filter((link) => link.role === 'assignment').length
          const badges: string[] = []
          if (stackCount > 0) badges.push(`×${stackCount}`)
          if (assignmentCount > 0) badges.push(`${assignmentCount} assigned`)
          if (badges.length === 0) return null
          return (
            <text
              y={-halfH - 6 / zoom}
              textAnchor="middle"
              fill="#2dd4bf"
              fontSize={fontSize * 0.85}
              transform={view === 'top' ? `rotate(${-rect.rotationDeg})` : undefined}
              style={{ userSelect: 'none' }}
            >
              {badges.join(' · ')}
            </text>
          )
        })()}
        {showLabel && current.name && (
          <text
            y={halfH + fontSize * 1.2}
            textAnchor="middle"
            fill="#d4d4d8"
            fontSize={fontSize}
            transform={view === 'top' ? `rotate(${-rect.rotationDeg})` : undefined}
            style={{ userSelect: 'none' }}
          >
            {current.name}
          </text>
        )}
        {selected && !layer.locked && (
          <g>
            <rect
              x={-halfW - 4 / zoom}
              y={-halfH - 4 / zoom}
              width={rect.width + 8 / zoom}
              height={Math.max(rect.height, 4) + 8 / zoom}
              fill="none"
              stroke="#6366f1"
              strokeWidth={1.5 / zoom}
              strokeDasharray={`${5 / zoom} ${4 / zoom}`}
            />
            {/* SE resize handle */}
            <rect
              x={halfW - handlePx / 2}
              y={halfH - handlePx / 2}
              width={handlePx}
              height={handlePx}
              fill="#6366f1"
              className="cursor-nwse-resize"
              onPointerDown={(event) => handleHandlePointerDown(event, element, 'resize')}
            />
            {/* Rotate handle (plan view only) */}
            {view === 'top' && (
              <circle
                cy={-halfH - 18 / zoom}
                r={handlePx / 2}
                fill="#6366f1"
                className="cursor-grab"
                onPointerDown={(event) => handleHandlePointerDown(event, element, 'rotate')}
              />
            )}
          </g>
        )}
      </g>
    )
  }

  return (
    <div ref={containerRef} className="relative h-[600px] w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <svg
        ref={svgRef}
        className="block h-full w-full touch-none select-none"
        viewBox={`${panX} ${panY} ${size.width / zoom} ${size.height / zoom}`}
        onWheel={handleWheel}
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Background grid: adaptive line density so a 40×60 m venue at
            far zoom never renders thousands of lines (spec edge case). */}
        {plot.grid_visible && plot.grid_size_cm > 0 && renderGrid(plot.grid_size_cm, zoom, panX, panY, size)}
        {/* Floor line in elevations: v = 0 is the stage floor. */}
        {view !== 'top' && (
          <line x1={panX - 100000} x2={panX + 100000} y1={0} y2={0} stroke="#3f3f46" strokeWidth={1.5 / zoom} strokeDasharray={`${10 / zoom} ${6 / zoom}`} />
        )}
        {orderedLayers
          .filter((layer) => layer.visible)
          .map((layer) => (
            <g key={layer.id}>
              {elements
                .filter((element) => element.layer_id === layer.id)
                .map((element) => renderElement(element, layer))}
            </g>
          ))}
        {/* Alignment guides while dragging (snap-to-objects). */}
        {guides.map((guide, index) =>
          guide.axis === 'u' ? (
            <line
              key={index}
              x1={guide.position}
              x2={guide.position}
              y1={panY - 100000}
              y2={panY + 100000}
              stroke="#6366f1"
              strokeWidth={1 / zoom}
              strokeDasharray={`${4 / zoom} ${4 / zoom}`}
            />
          ) : (
            <line
              key={index}
              x1={panX - 100000}
              x2={panX + 100000}
              y1={view === 'top' ? guide.position : -guide.position}
              y2={view === 'top' ? guide.position : -guide.position}
              stroke="#6366f1"
              strokeWidth={1 / zoom}
              strokeDasharray={`${4 / zoom} ${4 / zoom}`}
            />
          ),
        )}
      </svg>
    </div>
  )
}
