import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { PlotTruss, StagePlot, StagePlotElement, StagePlotLayer, StagePlotView, TrussSide } from '../../types'
import type { StagePlotElementPatch } from '../../api/stagePlots'
import {
  clampDimension,
  clampFixtureOffset,
  fixtureDropOnTruss,
  fixtureLabel,
  projectedAxes,
  projectedBounds,
  projectedOutline,
  projectElement,
  rectLocalPoint,
  roundCm,
  snapPosition,
  trussLaneLocalV,
  trussSideForLocalV,
  viewAxisFields,
  type SnapGuide,
} from '../../lib/stagePlot'
import { iconGlyph, iconViewBox } from '../../lib/stagePlotIcons'

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
  /** Rig fixture display names, for free fixture elements without a name. */
  fixtureNameById?: Map<number, string>
  /** Attach (or re-position) a fixture on a truss — from dragging its
   *  marker along the bar, or dropping a free fixture element onto it
   *  (consumeElementId: that element is replaced by the attachment). */
  onAttachFixture?: (args: { trussId: number; fixtureId: number; offsetCm: number; side: TrussSide; consumeElementId?: number }) => void
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
  | { kind: 'truss-fixture'; trussElementId: number; trussId: number; fixtureId: number; side: TrussSide; offsetCm: number }

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
  fixtureNameById,
  onAttachFixture,
}: StagePlotCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 800, height: 560 })
  const [drag, setDrag] = useState<DragMode>({ kind: 'none' })
  // During a drag the element's pending values live here; the store is
  // only written on drop (save-on-drop, the graph canvas pattern).
  const [override, setOverride] = useState<{ id: number; patch: StagePlotElementPatch } | null>(null)
  const [guides, setGuides] = useState<SnapGuide[]>([])
  // Live position of a fixture marker being dragged along its truss.
  const [fixtureDrag, setFixtureDrag] = useState<{ fixtureId: number; offset: number; side: TrussSide } | null>(null)
  // The truss a dragged free fixture element would attach to on drop.
  const [dropTarget, setDropTarget] = useState<{ elementId: number; trussId: number; offset: number; side: TrussSide } | null>(null)

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

  // Zoom on wheel. React's synthetic onWheel is passive (preventDefault
  // is ignored), which let the page scroll along with the zoom on small
  // screens — so the listener is attached natively with passive: false:
  // while the cursor is over the canvas the wheel only zooms, and page
  // scrolling resumes as soon as it leaves.
  const handleWheelRef = useRef<(event: WheelEvent) => void>(() => {})
  useEffect(() => {
    // Re-pointed after every render so the native listener always sees
    // the current zoom/pan (refs must not be written during render).
    handleWheelRef.current = (event: WheelEvent) => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return
      event.preventDefault()
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
  })

  useEffect(() => {
    const node = svgRef.current
    if (!node) return
    const listener = (event: WheelEvent) => handleWheelRef.current(event)
    node.addEventListener('wheel', listener, { passive: false })
    return () => node.removeEventListener('wheel', listener)
  }, [])

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

  const handleFixturePointerDown = (event: ReactPointerEvent, element: StagePlotElement, trussId: number, fixture: { fixture_id: number; side: TrussSide }, offsetCm: number) => {
    if (event.button !== 0 || !onAttachFixture) return
    if (layerById.get(element.layer_id)?.locked) return
    event.stopPropagation()
    svgRef.current?.setPointerCapture(event.pointerId)
    setDrag({ kind: 'truss-fixture', trussElementId: element.id, trussId, fixtureId: fixture.fixture_id, side: fixture.side, offsetCm })
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

    if (drag.kind === 'truss-fixture') {
      const trussElement = elements.find((entry) => entry.id === drag.trussElementId)
      const truss = trussById.get(drag.trussId)
      if (!trussElement || !truss) return
      const current = effectiveElement(trussElement)
      const rect = projectElement(current, view)
      const { ax, ay } = projectedAxes(current, view)
      const local = rectLocalPoint(point, rect, view)
      const length = Math.max(truss.total_length_cm, 20)
      const barHalfDepth = current.depth_cm / 2
      // Invert the marker projection p = along·ax + lane·ay (see the
      // render): when the two bar axes span the view plane, solve both
      // offset and lane at once; when they collapse onto one screen
      // direction, the drag adjusts whichever axis shows more of
      // itself — offset along a visible bar, lane when looking down it.
      let offset = drag.offsetCm
      let side = drag.side
      const det = ax.u * ay.v - ax.v * ay.u
      if (Math.abs(det) > 0.1) {
        const along = (local.u * ay.v - local.v * ay.u) / det
        const lane = (ax.u * local.v - ax.v * local.u) / det
        offset = roundCm(Math.min(length, Math.max(0, along + length / 2)))
        side = trussSideForLocalV(lane, barHalfDepth)
      } else {
        const axLen = Math.hypot(ax.u, ax.v)
        const ayLen = Math.hypot(ay.u, ay.v)
        if (axLen * length >= ayLen * current.depth_cm && axLen > 0.05) {
          const along = (local.u * ax.u + local.v * ax.v) / (axLen * axLen)
          offset = roundCm(Math.min(length, Math.max(0, along + length / 2)))
        } else if (ayLen > 0.05) {
          side = trussSideForLocalV((local.u * ay.u + local.v * ay.v) / (ayLen * ayLen), barHalfDepth)
        }
      }
      setFixtureDrag({ fixtureId: drag.fixtureId, offset, side })
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
      // A free fixture element dragged over a placed truss bar (top
      // view) will attach on drop — find and highlight that truss.
      if (drag.origin.kind === 'fixture' && drag.origin.fixture_id != null && view === 'top' && onAttachFixture) {
        let target: typeof dropTarget = null
        for (const entry of elements) {
          const entryLayer = layerById.get(entry.layer_id)
          if (entry.kind !== 'truss' || entry.truss_id == null || !entryLayer?.visible || entryLayer.locked) continue
          const truss = trussById.get(entry.truss_id)
          if (!truss) continue
          const barElement = effectiveElement(entry)
          const trussRect = projectElement(barElement, view)
          const { ax, ay } = projectedAxes(barElement, view)
          // Solve the drop point back into bar cm before the hit test
          // (a bar seen end-on takes no drops).
          const det = ax.u * ay.v - ax.v * ay.u
          if (Math.abs(det) < 0.1) continue
          const local = rectLocalPoint({ u: snapped.u, v: snapped.v }, trussRect, view)
          const barPoint = {
            u: (local.u * ay.v - local.v * ay.u) / det,
            v: (ax.u * local.v - ax.v * local.u) / det,
          }
          const drop = fixtureDropOnTruss(barPoint, Math.max(truss.total_length_cm, 20), barElement.depth_cm / 2)
          if (drop) {
            target = { elementId: entry.id, trussId: entry.truss_id, offset: drop.offset, side: drop.side }
            break
          }
        }
        setDropTarget(target)
      }
      return
    }

    if (drag.kind === 'resize') {
      const origin = drag.origin
      const rect = projectElement(origin, view)
      // Transform the pointer into the element's unrotated local frame
      // (SVG coordinates — elevations flip v when rendering), then size
      // from the fixed NW corner.
      const centerY = view === 'top' ? rect.v : -rect.v
      const radians = (rect.rotationDeg * Math.PI) / 180
      const cos = Math.cos(-radians)
      const sin = Math.sin(-radians)
      const relU = point.u - rect.u
      const relV = point.v - centerY
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

    if (drag.kind === 'rotate' && view !== 'side') {
      // Top view writes the plan rotation; the front view writes the
      // tilt (rake). Both spin the element around its drawn centre.
      const rect = projectElement(effectiveElement(drag.origin), view)
      const centerY = view === 'top' ? rect.v : -rect.v
      const angle = (Math.atan2(point.v - centerY, point.u - rect.u) * 180) / Math.PI + 90
      const normalized = Math.round(((angle % 360) + 360) % 360)
      setOverride({ id: drag.elementId, patch: view === 'top' ? { rotation_deg: normalized } : { tilt_deg: normalized } })
    }
  }

  const handlePointerUp = () => {
    if (drag.kind === 'maybe-pan') {
      if (!drag.moved) onSelectElement(null)
    } else if (drag.kind === 'truss-fixture') {
      if (fixtureDrag && onAttachFixture) {
        onAttachFixture({ trussId: drag.trussId, fixtureId: drag.fixtureId, offsetCm: fixtureDrag.offset, side: fixtureDrag.side })
      }
    } else if (drag.kind !== 'none' && override && override.id === drag.elementId && Object.keys(override.patch).length > 0) {
      const skipSave = drag.kind === 'move' && !drag.moved
      if (!skipSave) {
        if (drag.kind === 'move' && drag.origin.kind === 'fixture' && drag.origin.fixture_id != null && dropTarget && onAttachFixture) {
          // Dropped onto a truss: the free element becomes an attachment.
          onAttachFixture({
            trussId: dropTarget.trussId,
            fixtureId: drag.origin.fixture_id,
            offsetCm: dropTarget.offset,
            side: dropTarget.side,
            consumeElementId: drag.origin.id,
          })
        } else {
          onUpdateElement(override.id, override.patch)
        }
      }
    }
    setOverride(null)
    setGuides([])
    setFixtureDrag(null)
    setDropTarget(null)
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
          // A cylinder seen straight-on is a rectangle, so the
          // elevations draw the plain projected box.
          body =
            view === 'top' ? (
              <ellipse cx={0} cy={0} rx={halfW} ry={halfH} fill="transparent" stroke="currentColor" strokeWidth={2 / zoom} />
            ) : (
              <rect x={-halfW} y={-halfH} width={rect.width} height={rect.height} fill="transparent" stroke="currentColor" strokeWidth={2 / zoom} />
            )
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
    } else if (current.kind === 'resource' || (current.kind === 'fixture' && current.fixture_id != null)) {
      // Free fixture elements draw with the built-in fixture glyph; drop
      // one onto a truss bar to turn it into an attachment.
      const iconId = current.kind === 'fixture' ? 'fixture' : (current.icon ?? '')
      body = (
        <svg
          x={-halfW}
          y={-halfH}
          width={rect.width}
          height={rect.height}
          viewBox={iconViewBox(iconId, view)}
          preserveAspectRatio="none"
          overflow="visible"
        >
          {iconGlyph(iconId, view)}
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
      const highlighted = dropTarget?.elementId === element.id
      const ghostSize = Math.max(14, 10 / zoom)
      // Everything on the bar — its outline, piece dividers, fixture
      // markers — is projected through the bar's own axes, so combined
      // rotation and tilt draw the true silhouette (a hexagon where a
      // rectangle can't represent the box) with markers at their real
      // projected positions.
      const axes = projectedAxes(current, view)
      const barHalfDepth = current.depth_cm / 2
      const halfLen = length / 2
      const barPoint = (along: number, lane: number) => ({
        u: along * axes.ax.u + lane * axes.ay.u,
        v: along * axes.ax.v + lane * axes.ay.v,
      })
      // Markers hang below the bar's underside in the elevations.
      const hangV = (current.height_cm / 2) * Math.abs(axes.az.v)
      const outline = projectedOutline(current, view)
        .map((p) => `${p.u},${p.v}`)
        .join(' ')
      const axLen = Math.hypot(axes.ax.u, axes.ax.v)
      const dividerDir = axLen > 0.05 ? { u: axes.ax.u / axLen, v: axes.ax.v / axLen } : null
      body = (
        <g>
          <polygon
            points={outline}
            fill={highlighted ? 'rgba(99,102,241,0.18)' : 'rgba(245,158,11,0.08)'}
            stroke={highlighted ? '#818cf8' : 'currentColor'}
            strokeWidth={2 / zoom}
          />
          {dividerDir &&
            dividers.map((position) => {
              // A tick through the bar's centre line, across the drawn
              // cross-section.
              const center = barPoint(position - halfLen, 0)
              const perp = { u: -dividerDir.v, v: dividerDir.u }
              const halfT =
                barHalfDepth * Math.abs(axes.ay.u * perp.u + axes.ay.v * perp.v) +
                (current.height_cm / 2) * Math.abs(axes.az.u * perp.u + axes.az.v * perp.v)
              return (
                <line
                  key={position}
                  x1={center.u - perp.u * halfT}
                  y1={center.v - perp.v * halfT}
                  x2={center.u + perp.u * halfT}
                  y2={center.v + perp.v * halfT}
                  stroke="currentColor"
                  strokeWidth={1 / zoom}
                  opacity={0.6}
                />
              )
            })}
          {/* Ghost marker: where the dragged fixture element will land. */}
          {highlighted && dropTarget && view === 'top' && (() => {
            const pos = barPoint(dropTarget.offset - halfLen, trussLaneLocalV(dropTarget.side, barHalfDepth))
            return (
              <rect
                x={pos.u - ghostSize / 2}
                y={pos.v - (ghostSize * 0.8) / 2}
                width={ghostSize}
                height={ghostSize * 0.8}
                rx={2 / zoom}
                fill="rgba(99,102,241,0.3)"
                stroke="#818cf8"
                strokeDasharray={`${3 / zoom} ${2 / zoom}`}
                strokeWidth={1.2 / zoom}
              />
            )
          })()}
          {truss.fixtures.map((fixture) => {
              // A marker being dragged renders at its live position.
              const live = drag.kind === 'truss-fixture' && drag.trussId === truss.id && fixtureDrag?.fixtureId === fixture.fixture_id ? fixtureDrag : null
              const rawOffset = live ? live.offset : fixture.offset_cm
              if (rawOffset == null) return null
              const side = live ? live.side : fixture.side
              const { offset, clamped } = clampFixtureOffset(rawOffset, length)
              const label = fixtureLabel(fixture, labelSettings)
              const size = Math.max(14, 10 / zoom)
              // The marker's true projected position: offset along the
              // bar, lane across it — a raked bar's fixtures climb with
              // it in every view. The top view sits the marker on its
              // lane; elevations hang it below the bar's underside.
              const pos = barPoint(offset - halfLen, trussLaneLocalV(side, barHalfDepth))
              const markerY = view === 'top' ? pos.v - (size * 0.8) / 2 : pos.v + hangV + 2 / zoom
              return (
                <g
                  key={fixture.id}
                  transform={`translate(${pos.u} 0)`}
                  className="cursor-move"
                  onPointerDown={(event) => handleFixturePointerDown(event, element, truss.id, fixture, offset)}
                >
                  <rect
                    x={-size / 2}
                    y={markerY}
                    width={size}
                    height={size * 0.8}
                    rx={2 / zoom}
                    fill={clamped ? 'rgba(239,68,68,0.3)' : live ? 'rgba(99,102,241,0.35)' : 'rgba(245,158,11,0.25)'}
                    stroke={clamped ? '#ef4444' : live ? '#818cf8' : 'currentColor'}
                    strokeWidth={1.2 / zoom}
                  >
                    <title>
                      {clamped
                        ? "Beyond the truss's current length — reposition this fixture"
                        : 'Drag along the truss to place; drag across it to switch lane (top/middle/bottom). Fine-tune in Trusses…'}
                    </title>
                  </rect>
                  {label && (
                    <text
                      y={view === 'top' ? halfH + 2 / zoom + fontSize : markerY + size * 0.8 + fontSize}
                      textAnchor="middle"
                      fill="#a1a1aa"
                      fontSize={fontSize * 0.85}
                      style={{ userSelect: 'none' }}
                    >
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
    // Free fixture elements fall back to their rig name.
    const displayName = current.kind === 'fixture' && current.fixture_id != null ? current.name || fixtureNameById?.get(current.fixture_id) || '' : current.name
    return (
      <g
        key={element.id}
        transform={`translate(${rect.u} ${svgY}) rotate(${rect.rotationDeg})`}
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
              transform={`rotate(${-rect.rotationDeg})`}
              style={{ userSelect: 'none' }}
            >
              {badges.join(' · ')}
            </text>
          )
        })()}
        {showLabel && displayName && (
          <text
            y={halfH + fontSize * 1.2}
            textAnchor="middle"
            fill="#d4d4d8"
            fontSize={fontSize}
            transform={`rotate(${-rect.rotationDeg})`}
            style={{ userSelect: 'none' }}
          >
            {displayName}
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
            {/* Rotate handle: plan rotation in the top view, tilt
                (rake) in the front view. */}
            {view !== 'side' && (
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
    <div
      ref={containerRef}
      className="relative h-[calc(100vh-330px)] min-h-[560px] w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950"
    >
      <svg
        ref={svgRef}
        className="block h-full w-full touch-none select-none"
        viewBox={`${panX} ${panY} ${size.width / zoom} ${size.height / zoom}`}
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
