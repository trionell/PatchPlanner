import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Minus, Plus, Trash2, Unplug } from 'lucide-react'
import {
  createInputCable,
  deleteInputCable,
  updateInputCable,
  updateInputDevice,
  updateStagebox,
  updateStageMulti,
} from '../../api/audioPatch'
import {
  cableAtPort,
  channelPorts,
  derivedPortColor,
  devicePorts,
  isCablelessEdge,
  isPortConnected,
  resolvePortRef,
  sourcePorts,
  type PortRef,
} from '../../lib/inputGraph'
import { stageboxPorts, stageMultiPorts } from '../../lib/outputGraph'
import { itemLabel } from '../../lib/utils'
import type { InputCable, InputChannel, InputDevice, InputSource, InventoryItem, StageMulti, Stagebox } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'

const portKey = (kind: PortRef['kind'], id: number, port: number, direction: 'in' | 'out') => `${kind}|${id}|${port}|${direction}`

function parsePortKey(key: string): { kind: PortRef['kind']; id: number; port: number; direction: 'in' | 'out' } | null {
  const [kind, id, port, direction] = key.split('|')
  if (!kind || !id || !port || !direction) return null
  return { kind: kind as PortRef['kind'], id: Number(id), port: Number(port), direction: direction as 'in' | 'out' }
}

const NODE_WIDTH = 200
const CANVAS_HEIGHT = 640
const CANVAS_MIN_WIDTH = 820
const ZONE_SOURCES_X = 24
const ZOOM_MIN = 0.5
const ZOOM_MAX = 1.5
const ZOOM_STEP = 0.1

function zoneChannelsX(canvasWidth: number): number {
  return canvasWidth - NODE_WIDTH - 24
}
function zoneProcessingBounds(canvasWidth: number): { min: number; max: number } {
  return { min: 264, max: canvasWidth - NODE_WIDTH - 264 }
}

interface NodeLayout {
  kind: PortRef['kind']
  id: number
  x: number
  y: number
}

/**
 * The interactive Sankey-style input canvas — mirrors the Output graph's
 * canvas (AudioOutputsTab.tsx's OutputGraphCanvas), reversed in
 * direction: Sources (left rail) and Channels (right rail) each render as
 * one compact node listing every Source/Channel row (FR-015 — the graph's
 * vertical footprint never grows per-source), Stageboxes/Stage-Multis/
 * Devices free-float in the Processing zone (2D drag). The cable-item
 * picker is skipped entirely for a cableless edge (research.md R5),
 * committing immediately with no item; a Source's port stays selectable
 * after already carrying a cable (fan-out, FR-006), every other port
 * shows its existing cable's info on a plain click instead.
 */
export function InputGraphCanvas({
  eventId,
  sources,
  channels,
  devices,
  stageboxes,
  stageMultis,
  cables,
  cableItems,
  onChanged,
  readOnly = false,
}: {
  eventId: number
  sources: InputSource[]
  channels: InputChannel[]
  devices: InputDevice[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  cables: InputCable[]
  cableItems: InventoryItem[]
  onChanged: () => Promise<void>
  readOnly?: boolean
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const portEls = useRef(new Map<string, HTMLElement>())
  const [paths, setPaths] = useState<{ id: number; d: string; hasItem: boolean; color: string | undefined }[]>([])
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map())
  const [pendingPort, setPendingPort] = useState<PortRef | null>(null)
  const [dragGhost, setDragGhost] = useState<{ from: PortRef; x: number; y: number } | null>(null)
  const [pickerPair, setPickerPair] = useState<{ from: PortRef; to: PortRef; suggestedItemId?: number } | null>(null)
  const [infoCable, setInfoCable] = useState<InputCable | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [wrapperWidth, setWrapperWidth] = useState(1180)
  const [zoom, setZoom] = useState(1)
  // The canvas's LOGICAL width/height (the coordinate space node positions
  // and zone bounds live in) grow as you zoom out and shrink as you zoom
  // in, while the rendered box is scaled by `zoom` so its on-screen
  // footprint always exactly matches the panel (mirrors the Output
  // graph's own canvas — AudioOutputsTab.tsx's OutputGraphCanvas).
  const canvasWidth = wrapperWidth / zoom
  const canvasHeight = CANVAS_HEIGHT / zoom

  useLayoutEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setWrapperWidth(Math.max(CANVAS_MIN_WIDTH, Math.floor(width)))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  function clampProcessingX(x: number): number {
    const { min, max } = zoneProcessingBounds(canvasWidth)
    return Math.max(min, Math.min(max, x))
  }

  const portContext = { sources, channels, devices, stageboxes, stageMultis }
  const colorContext = { channels, devices, stageboxes, stageMultis, cables }

  const createCableMutation = useMutation({
    mutationFn: (data: Omit<InputCable, 'id' | 'event_id'>) => createInputCable(eventId, data),
    onSuccess: onChanged,
  })
  const updateCableMutation = useMutation({
    mutationFn: ({ id, cableItemId }: { id: number; cableItemId: number | undefined }) => updateInputCable(eventId, id, cableItemId),
    onSuccess: onChanged,
  })
  const deleteCableMutation = useMutation({
    mutationFn: (id: number) => deleteInputCable(eventId, id),
    onSuccess: onChanged,
  })
  const moveDeviceMutation = useMutation({
    mutationFn: ({ id, device }: { id: number; device: Omit<InputDevice, 'id' | 'event_id'> }) => updateInputDevice(eventId, id, device),
    onSuccess: onChanged,
  })
  const moveStageboxMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Omit<Stagebox, 'id'> }) => updateStagebox(eventId, id, data),
    onSuccess: onChanged,
  })
  const moveStageMultiMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Omit<StageMulti, 'id'> }) => updateStageMulti(eventId, id, data),
    onSuccess: onChanged,
  })
  const registerPort = (key: string) => (el: HTMLElement | null) => {
    if (el) portEls.current.set(key, el)
    else portEls.current.delete(key)
  }

  const layout = useMemo<NodeLayout[]>(() => {
    const nodes: NodeLayout[] = []
    nodes.push({ kind: 'source', id: 0, x: ZONE_SOURCES_X, y: 24 })

    const channelsX = zoneChannelsX(canvasWidth)
    nodes.push({ kind: 'channel', id: 0, x: channelsX, y: 24 })

    for (const sb of stageboxes) {
      const override = positions.get(`stagebox:${sb.id}`)
      const x = clampProcessingX(override?.x ?? sb.input_position_x)
      const y = override?.y ?? sb.input_position_y
      nodes.push({ kind: 'stagebox', id: sb.id, x, y })
    }
    for (const sm of stageMultis) {
      const override = positions.get(`stage_multi:${sm.id}`)
      const x = clampProcessingX(override?.x ?? sm.input_position_x)
      const y = override?.y ?? sm.input_position_y
      nodes.push({ kind: 'stage_multi', id: sm.id, x, y })
    }
    for (const device of devices) {
      const override = positions.get(`device:${device.id}`)
      const x = clampProcessingX(override?.x ?? device.position_x)
      const y = override?.y ?? device.position_y
      nodes.push({ kind: 'device', id: device.id, x, y })
    }
    return nodes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageboxes, stageMultis, devices, positions, canvasWidth])

  useLayoutEffect(() => {
    const container = canvasRef.current
    if (!container) {
      setPaths([])
      return
    }
    const containerRect = container.getBoundingClientRect()
    const next = cables
      .map((cable) => {
        const fromEl = portEls.current.get(portKey(cable.from_kind, cable.from_id, cable.from_port, 'out'))
        const toEl = portEls.current.get(portKey(cable.to_kind, cable.to_id, cable.to_port, 'in'))
        if (!fromEl || !toEl) return null
        const fromRect = fromEl.getBoundingClientRect()
        const toRect = toEl.getBoundingClientRect()
        const x1 = (fromRect.left + fromRect.width / 2 - containerRect.left) / zoom
        const y1 = (fromRect.top + fromRect.height / 2 - containerRect.top) / zoom
        const x2 = (toRect.left + toRect.width / 2 - containerRect.left) / zoom
        const y2 = (toRect.top + toRect.height / 2 - containerRect.top) / zoom
        const dx = Math.max(60, Math.abs(x2 - x1) / 2)
        const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
        const color = derivedPortColor({ kind: cable.to_kind, id: cable.to_id, port: cable.to_port, direction: 'in', label: '' }, colorContext)
        return { id: cable.id, d, hasItem: cable.cable_item_id != null, color }
      })
      .filter((p): p is { id: number; d: string; hasItem: boolean; color: string | undefined } => p !== null)
    setPaths(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cables, layout, zoom])

  function persistPosition(kind: PortRef['kind'], id: number, x: number, y: number) {
    const onError = (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to save position')
    if (kind === 'stagebox') {
      const sb = stageboxes.find((s) => s.id === id)
      if (!sb) return
      moveStageboxMutation.mutate({ id, data: { ...sb, input_position_x: x, input_position_y: y } }, { onError })
      return
    }
    if (kind === 'stage_multi') {
      const sm = stageMultis.find((s) => s.id === id)
      if (!sm) return
      moveStageMultiMutation.mutate({ id, data: { ...sm, input_position_x: x, input_position_y: y } }, { onError })
      return
    }
    const device = devices.find((d) => d.id === id)
    if (!device) return
    moveDeviceMutation.mutate({ id, device: { ...device, position_x: x, position_y: y } }, { onError })
  }

  function startNodeDrag(kind: PortRef['kind'], id: number, event: ReactPointerEvent) {
    if (readOnly) return
    const node = layout.find((n) => n.kind === kind && n.id === id)
    if (!node) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startY = event.clientY
    const origin = { x: node.x, y: node.y }
    let latest = origin
    const key = `${kind}:${id}`

    function onMove(moveEvent: PointerEvent) {
      // Node positions live in the canvas's unscaled logical coordinate
      // space, but pointer movement is measured in real screen pixels —
      // dividing by the current zoom converts back to the matching
      // logical delta (mirrors the Output graph's own canvas).
      const dx = (moveEvent.clientX - startX) / zoom
      const dy = (moveEvent.clientY - startY) / zoom
      const x = clampProcessingX(origin.x + dx)
      const y = Math.max(8, origin.y + dy)
      latest = { x, y }
      setPositions((current) => new Map(current).set(key, latest))
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      persistPosition(kind, id, latest.x, latest.y)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function findPortAtPoint(x: number, y: number): PortRef | undefined {
    const el = document.elementFromPoint(x, y)?.closest('[data-port-key]')
    const key = el?.getAttribute('data-port-key')
    if (!key) return undefined
    const parsed = parsePortKey(key)
    if (!parsed) return undefined
    return resolvePortRef(parsed.kind, parsed.id, parsed.port, parsed.direction, portContext)
  }

  // A stereo Source's second port, connected while its first port already
  // carries a real cable's item — the two runs are typically one
  // physical splitter cable, so the picker offers that same item as a
  // one-click suggestion (research.md R6); picking a different item, or
  // none, stays available.
  function suggestedSplitterItem(from: PortRef): number | undefined {
    if (from.kind !== 'source') return undefined
    const source = sources.find((s) => s.id === from.id)
    if (!source || source.width !== 'stereo') return undefined
    const otherPort = from.port === 0 ? 1 : 0
    return cableAtPort('source', from.id, otherPort, 'out', cables)?.cable_item_id ?? undefined
  }

  function attemptConnect(from: PortRef, to: PortRef) {
    setError(null)
    if (isCablelessEdge(from.kind, to.kind)) {
      createCableMutation.mutate(
        { from_kind: from.kind as InputCable['from_kind'], from_id: from.id, from_port: from.port, to_kind: to.kind as InputCable['to_kind'], to_id: to.id, to_port: to.port },
        { onError: (e) => setError(e instanceof Error ? e.message : 'Failed to connect') },
      )
      return
    }
    setPickerPair({ from, to, suggestedItemId: suggestedSplitterItem(from) })
  }

  function handlePortClick(port: PortRef) {
    setError(null)
    // A Source's port is a physical origin, not a physical jack that can
    // carry only one run — clicking it always starts (or completes) a
    // connection, even if it already carries a cable (fan-out). Every
    // other kind shows the existing cable's info on a plain click instead.
    if (port.kind !== 'source' && isPortConnected(port.kind, port.id, port.port, port.direction, cables)) {
      setInfoCable(cableAtPort(port.kind, port.id, port.port, port.direction, cables) ?? null)
      return
    }
    if (readOnly) return
    if (!pendingPort) {
      setPendingPort(port)
      return
    }
    if (pendingPort.kind === port.kind && pendingPort.id === port.id && pendingPort.port === port.port && pendingPort.direction === port.direction) {
      setPendingPort(null)
      return
    }
    if (pendingPort.direction === port.direction) {
      setPendingPort(port)
      return
    }
    const from = pendingPort.direction === 'out' ? pendingPort : port
    const to = pendingPort.direction === 'out' ? port : pendingPort
    setPendingPort(null)
    attemptConnect(from, to)
  }

  function handlePortPointerDown(port: PortRef, event: ReactPointerEvent) {
    event.stopPropagation()
    if (port.kind !== 'source' && isPortConnected(port.kind, port.id, port.port, port.direction, cables)) {
      handlePortClick(port)
      return
    }
    if (readOnly) return
    const startX = event.clientX
    const startY = event.clientY
    let dragged = false
    setDragGhost({ from: port, x: startX, y: startY })

    function onMove(moveEvent: PointerEvent) {
      if (!dragged && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 4) dragged = true
      setDragGhost({ from: port, x: moveEvent.clientX, y: moveEvent.clientY })
    }
    function onUp(upEvent: PointerEvent) {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragGhost(null)
      if (!dragged) {
        handlePortClick(port)
        return
      }
      const target = findPortAtPoint(upEvent.clientX, upEvent.clientY)
      if (!target || target.direction === port.direction) return
      if (target.kind === port.kind && target.id === port.id && target.port === port.port) return
      if (target.kind !== 'source' && isPortConnected(target.kind, target.id, target.port, target.direction, cables)) {
        setError(`${target.label} is already connected — disconnect it first.`)
        return
      }
      const from = port.direction === 'out' ? port : target
      const to = port.direction === 'out' ? target : port
      attemptConnect(from, to)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const [ghostPath, setGhostPath] = useState<string | null>(null)
  useLayoutEffect(() => {
    if (!dragGhost || !canvasRef.current) {
      setGhostPath(null)
      return
    }
    const fromEl = portEls.current.get(portKey(dragGhost.from.kind, dragGhost.from.id, dragGhost.from.port, dragGhost.from.direction))
    if (!fromEl) {
      setGhostPath(null)
      return
    }
    const containerRect = canvasRef.current.getBoundingClientRect()
    const fromRect = fromEl.getBoundingClientRect()
    const x1 = (fromRect.left + fromRect.width / 2 - containerRect.left) / zoom
    const y1 = (fromRect.top + fromRect.height / 2 - containerRect.top) / zoom
    const x2 = (dragGhost.x - containerRect.left) / zoom
    const y2 = (dragGhost.y - containerRect.top) / zoom
    const dx = Math.max(60, Math.abs(x2 - x1) / 2)
    setGhostPath(`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`)
  }, [dragGhost, zoom])

  return (
    <div className="space-y-2">
      {error && <div className="rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
      {pendingPort && !dragGhost && (
        <div className="text-xs text-amber-400">
          Selected {pendingPort.label} — click a free {pendingPort.direction === 'out' ? 'input' : 'output'} port to connect, or click it again to cancel.
        </div>
      )}
      <div className="flex items-center justify-between px-1">
        <div className="grid flex-1 grid-cols-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          <span>← Sources</span>
          <span className="text-center">Processing</span>
          <span className="text-right">Channels →</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100))} title="Zoom out">
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <button type="button" onClick={() => setZoom(1)} className="w-11 text-center font-mono text-[11px] text-zinc-400 hover:text-zinc-200" title="Reset zoom">
            {Math.round(zoom * 100)}%
          </button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100))} title="Zoom in">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div ref={wrapperRef} className="overflow-auto rounded-lg border border-zinc-800 bg-zinc-950/40" style={{ height: CANVAS_HEIGHT }}>
        <div style={{ width: canvasWidth * zoom, height: canvasHeight * zoom }}>
          <div ref={canvasRef} className="relative" style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
            <div className="pointer-events-none absolute inset-y-0 left-0 border-r border-dashed border-zinc-800 bg-white/[0.02]" style={{ width: ZONE_SOURCES_X + NODE_WIDTH + 24 }} />
            <div className="pointer-events-none absolute inset-y-0 right-0 border-l border-dashed border-zinc-800 bg-white/[0.02]" style={{ width: NODE_WIDTH + 48 }} />
            <svg className="pointer-events-none absolute inset-0" width={canvasWidth} height={canvasHeight}>
              {paths.map((p) => (
                <path key={p.id} d={p.d} fill="none" stroke={p.color ?? (p.hasItem ? '#f59e0b' : '#71717a')} strokeWidth={2 / zoom} strokeDasharray={p.hasItem ? undefined : `${4 / zoom} ${3 / zoom}`} />
              ))}
              {ghostPath && <path d={ghostPath} fill="none" stroke="#f59e0b" strokeWidth={2 / zoom} strokeDasharray={`${5 / zoom} ${4 / zoom}`} opacity={0.85} />}
            </svg>
            {layout.map((node) => {
              if (node.kind === 'source') {
                return (
                  <SourcesNode
                    key="sources"
                    x={node.x}
                    y={node.y}
                    sources={sources}
                    cables={cables}
                    pendingPort={pendingPort}
                    onPortClick={handlePortClick}
                    onPortPointerDown={handlePortPointerDown}
                    registerPort={registerPort}
                    colorContext={colorContext}
                  />
                )
              }
              if (node.kind === 'channel') {
                return (
                  <ChannelsNode
                    key="channels"
                    x={node.x}
                    y={node.y}
                    channels={channels}
                    cables={cables}
                    pendingPort={pendingPort}
                    onPortClick={handlePortClick}
                    onPortPointerDown={handlePortPointerDown}
                    registerPort={registerPort}
                    colorContext={colorContext}
                  />
                )
              }
              if (node.kind === 'stagebox') {
                const sb = stageboxes.find((s) => s.id === node.id)
                if (!sb) return null
                return (
                  <StageboxNode
                    key={`sb-${sb.id}`}
                    x={node.x}
                    y={node.y}
                    stagebox={sb}
                    cables={cables}
                    pendingPort={pendingPort}
                    onPortClick={handlePortClick}
                    onPortPointerDown={handlePortPointerDown}
                    registerPort={registerPort}
                    onDragStart={(e) => startNodeDrag('stagebox', sb.id, e)}
                    colorContext={colorContext}
                  />
                )
              }
              if (node.kind === 'stage_multi') {
                const sm = stageMultis.find((s) => s.id === node.id)
                if (!sm) return null
                return (
                  <StageMultiNode
                    key={`sm-${sm.id}`}
                    x={node.x}
                    y={node.y}
                    stageMulti={sm}
                    cables={cables}
                    pendingPort={pendingPort}
                    onPortClick={handlePortClick}
                    onPortPointerDown={handlePortPointerDown}
                    registerPort={registerPort}
                    onDragStart={(e) => startNodeDrag('stage_multi', sm.id, e)}
                    colorContext={colorContext}
                  />
                )
              }
              const device = devices.find((d) => d.id === node.id)
              if (!device) return null
              return (
                <DeviceNode
                  key={`dev-${device.id}`}
                  x={node.x}
                  y={node.y}
                  device={device}
                  cables={cables}
                  pendingPort={pendingPort}
                  onPortClick={handlePortClick}
                  onPortPointerDown={handlePortPointerDown}
                  registerPort={registerPort}
                  onDragStart={(e) => startNodeDrag('device', device.id, e)}
                  colorContext={colorContext}
                />
              )
            })}
          </div>
        </div>
      </div>
      {devices.length === 0 && stageboxes.length === 0 && stageMultis.length === 0 && (
        <p className="text-xs text-zinc-500">No processing gear yet — click or drag from a Source's port directly to a Channel to start cabling.</p>
      )}

      {pickerPair && (
        <CableItemPicker
          from={pickerPair.from}
          to={pickerPair.to}
          suggestedItemId={pickerPair.suggestedItemId}
          cableItems={cableItems}
          onCancel={() => setPickerPair(null)}
          onConfirm={(cableItemId) => {
            createCableMutation.mutate(
              {
                from_kind: pickerPair.from.kind as InputCable['from_kind'],
                from_id: pickerPair.from.id,
                from_port: pickerPair.from.port,
                to_kind: pickerPair.to.kind as InputCable['to_kind'],
                to_id: pickerPair.to.id,
                to_port: pickerPair.to.port,
                cable_item_id: cableItemId,
              },
              { onError: (e) => setError(e instanceof Error ? e.message : 'Failed to connect') },
            )
            setPickerPair(null)
          }}
        />
      )}

      {infoCable && (
        <CableInfoDialog
          cable={infoCable}
          cableItems={cableItems}
          onClose={() => setInfoCable(null)}
          onChangeItem={(cableItemId) => {
            updateCableMutation.mutate({ id: infoCable.id, cableItemId })
            setInfoCable(null)
          }}
          onDelete={() => {
            deleteCableMutation.mutate(infoCable.id)
            setInfoCable(null)
          }}
          readOnly={readOnly}
        />
      )}
    </div>
  )
}

function PortDot({
  port,
  connected,
  selected,
  color,
  onClick,
  onPointerDown,
  registerRef,
}: {
  port: PortRef
  connected: boolean
  selected: boolean
  color?: string
  onClick: () => void
  onPointerDown: (e: ReactPointerEvent) => void
  registerRef: (el: HTMLElement | null) => void
}) {
  const style = color && (connected || selected) ? { borderColor: color, backgroundColor: selected ? color : `${color}b3` } : undefined
  return (
    <button
      type="button"
      ref={registerRef}
      data-port-key={portKey(port.kind, port.id, port.port, port.direction)}
      onClick={onClick}
      onPointerDown={onPointerDown}
      title={port.label}
      style={style}
      className={`h-3 w-3 shrink-0 cursor-crosshair rounded-full border transition-colors ${
        style
          ? ''
          : selected
            ? 'border-amber-400 bg-amber-400'
            : connected
              ? 'border-amber-500 bg-amber-500/70 hover:bg-amber-400'
              : 'border-zinc-500 bg-zinc-800 hover:border-amber-400 hover:bg-amber-400/30'
      }`}
    />
  )
}

function NodeShell({ x, y, title, badge, onDragStart, onDelete, children }: {
  x: number
  y: number
  title: string
  badge?: string
  onDragStart?: (e: ReactPointerEvent) => void
  onDelete?: () => void
  children: ReactNode
}) {
  return (
    <div className="absolute rounded-lg border border-zinc-700 bg-zinc-900 shadow-lg" style={{ left: x, top: y, width: NODE_WIDTH }}>
      <div
        className={`flex items-center justify-between gap-2 rounded-t-lg border-b border-zinc-800 px-2 py-1.5 ${onDragStart ? 'cursor-grab touch-none active:cursor-grabbing' : ''}`}
        onPointerDown={onDragStart}
      >
        <span className="truncate text-xs font-semibold text-zinc-100">{title}</span>
        <div className="flex items-center gap-1">
          {badge && <Badge className="shrink-0">{badge}</Badge>}
          {onDelete && (
            <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={onDelete} className="text-zinc-500 hover:text-red-400">
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <div className="space-y-1 p-2">{children}</div>
    </div>
  )
}

interface ColorContext {
  channels: InputChannel[]
  devices: InputDevice[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  cables: InputCable[]
}

function PortRow({ label, port, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, align, colorContext }: {
  label: string
  port: PortRef
  cables: InputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  align: 'left' | 'right'
  colorContext: ColorContext
}) {
  const key = portKey(port.kind, port.id, port.port, port.direction)
  const connected = isPortConnected(port.kind, port.id, port.port, port.direction, cables)
  const selected = !!pendingPort && pendingPort.kind === port.kind && pendingPort.id === port.id && pendingPort.port === port.port && pendingPort.direction === port.direction
  const color = derivedPortColor(port, colorContext)
  const dot = (
    <PortDot port={port} connected={connected} selected={selected} color={color} onClick={() => onPortClick(port)} onPointerDown={(e) => onPortPointerDown(port, e)} registerRef={registerPort(key)} />
  )
  return (
    <div className={`flex items-center gap-1.5 text-[11px] ${align === 'right' ? 'flex-row-reverse text-right' : ''} ${color ? '' : 'text-zinc-300'}`} style={color ? { color } : undefined}>
      {dot}
      <span className="truncate">{label}</span>
    </div>
  )
}

function SourcesNode({ x, y, sources, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, colorContext }: {
  x: number
  y: number
  sources: InputSource[]
  cables: InputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  colorContext: ColorContext
}) {
  const ports = sources.flatMap((source) => sourcePorts(source))
  return (
    <NodeShell x={x} y={y} title="Sources">
      {ports.map((port) => (
        <PortRow key={portKey(port.kind, port.id, port.port, 'out')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} align="right" colorContext={colorContext} />
      ))}
      {ports.length === 0 && <p className="text-[11px] text-zinc-600">No sources yet</p>}
    </NodeShell>
  )
}

function ChannelsNode({ x, y, channels, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, colorContext }: {
  x: number
  y: number
  channels: InputChannel[]
  cables: InputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  colorContext: ColorContext
}) {
  const ports = channels.flatMap((channel) => channelPorts(channel))
  return (
    <NodeShell x={x} y={y} title="Channels">
      {ports.map((port) => (
        <PortRow key={portKey(port.kind, port.id, port.port, 'in')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} align="left" colorContext={colorContext} />
      ))}
      {ports.length === 0 && <p className="text-[11px] text-zinc-600">No channels yet</p>}
    </NodeShell>
  )
}

function StageboxNode({ x, y, stagebox, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, onDragStart, colorContext }: {
  x: number
  y: number
  stagebox: Stagebox
  cables: InputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  onDragStart: (e: ReactPointerEvent) => void
  colorContext: ColorContext
}) {
  const { inputs, outputs } = stageboxPorts(stagebox)
  return (
    <NodeShell x={x} y={y} title={stagebox.name} badge="SB" onDragStart={onDragStart}>
      <div className="grid grid-cols-2 gap-x-2">
        <div className="space-y-1">
          {inputs.map((port) => (
            <PortRow key={portKey('stagebox', port.id, port.port, 'in')} label={port.label} port={{ ...port, kind: 'stagebox' }} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} align="left" colorContext={colorContext} />
          ))}
        </div>
        <div className="space-y-1">
          {outputs.map((port) => (
            <PortRow key={portKey('stagebox', port.id, port.port, 'out')} label={port.label} port={{ ...port, kind: 'stagebox' }} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} align="right" colorContext={colorContext} />
          ))}
        </div>
      </div>
    </NodeShell>
  )
}

function StageMultiNode({ x, y, stageMulti, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, onDragStart, colorContext }: {
  x: number
  y: number
  stageMulti: StageMulti
  cables: InputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  onDragStart: (e: ReactPointerEvent) => void
  colorContext: ColorContext
}) {
  const { inputs, outputs } = stageMultiPorts(stageMulti)
  return (
    <NodeShell x={x} y={y} title={stageMulti.name} badge="Multi" onDragStart={onDragStart}>
      <div className="grid grid-cols-2 gap-x-2">
        <div className="space-y-1">
          {inputs.map((port) => (
            <PortRow key={portKey('stage_multi', port.id, port.port, 'in')} label={port.label} port={{ ...port, kind: 'stage_multi' }} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} align="left" colorContext={colorContext} />
          ))}
        </div>
        <div className="space-y-1">
          {outputs.map((port) => (
            <PortRow key={portKey('stage_multi', port.id, port.port, 'out')} label={port.label} port={{ ...port, kind: 'stage_multi' }} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} align="right" colorContext={colorContext} />
          ))}
        </div>
      </div>
    </NodeShell>
  )
}

function DeviceNode({ x, y, device, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, onDragStart, colorContext }: {
  x: number
  y: number
  device: InputDevice
  cables: InputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  onDragStart: (e: ReactPointerEvent) => void
  colorContext: ColorContext
}) {
  const { inputs, outputs } = devicePorts(device)
  return (
    <NodeShell x={x} y={y} title={device.name} onDragStart={onDragStart}>
      <div className="grid grid-cols-2 gap-x-2">
        <div className="space-y-1">
          {inputs.map((port) => (
            <PortRow key={portKey(port.kind, port.id, port.port, 'in')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} align="left" colorContext={colorContext} />
          ))}
        </div>
        <div className="space-y-1">
          {outputs.map((port) => (
            <PortRow key={portKey(port.kind, port.id, port.port, 'out')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} align="right" colorContext={colorContext} />
          ))}
        </div>
      </div>
    </NodeShell>
  )
}

function CableItemPicker({ from, to, cableItems, suggestedItemId, onCancel, onConfirm }: {
  from: PortRef
  to: PortRef
  cableItems: InventoryItem[]
  suggestedItemId?: number
  onCancel: () => void
  onConfirm: (cableItemId: number | undefined) => void
}) {
  const [selected, setSelected] = useState<number | undefined>(undefined)
  const suggestedItem = suggestedItemId != null ? cableItems.find((item) => item.id === suggestedItemId) : undefined
  return (
    <Dialog open onClose={onCancel} title="Pick a cable">
      <div className="space-y-4">
        <p className="text-sm text-zinc-400">Connecting <span className="text-zinc-200">{from.label}</span> to <span className="text-zinc-200">{to.label}</span>.</p>
        {suggestedItem && selected !== suggestedItemId && (
          <button
            type="button"
            onClick={() => setSelected(suggestedItemId)}
            className="w-full rounded border border-dashed border-amber-500/50 bg-amber-500/10 px-3 py-2 text-left text-sm text-amber-300 hover:bg-amber-500/20"
          >
            Same cable as the other side — {itemLabel(suggestedItem)}
          </button>
        )}
        <Select value={selected ?? ''} onChange={(e) => setSelected(e.target.value ? Number(e.target.value) : undefined)}>
          <option value="">No cable picked yet</option>
          {cableItems.map((item) => <option key={item.id} value={item.id}>{itemLabel(item)}</option>)}
        </Select>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onConfirm(selected)}>Connect</Button>
        </div>
      </div>
    </Dialog>
  )
}

function CableInfoDialog({ cable, cableItems, onClose, onChangeItem, onDelete, readOnly = false }: {
  cable: InputCable
  cableItems: InventoryItem[]
  onClose: () => void
  onChangeItem: (cableItemId: number | undefined) => void
  onDelete: () => void
  readOnly?: boolean
}) {
  const [selected, setSelected] = useState<number | undefined>(cable.cable_item_id)
  const isBuiltIn = isCablelessEdge(cable.from_kind, cable.to_kind)
  return (
    <Dialog open onClose={onClose} title="Cable">
      <div className="space-y-4">
        {isBuiltIn ? (
          <p className="text-sm text-zinc-400">
            This run is pure console/network routing — it has no separate cable to pick (the physical link itself is tracked separately, if it's rented at all).
          </p>
        ) : (
          <>
            <p className="text-sm text-zinc-400">Catalog item for this run.</p>
            <Select value={selected ?? ''} disabled={readOnly} onChange={(e) => setSelected(e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">No cable picked</option>
              {cableItems.map((item) => <option key={item.id} value={item.id}>{itemLabel(item)}</option>)}
            </Select>
          </>
        )}
        <div className="flex justify-between gap-2">
          {!readOnly && <Button variant="destructive" onClick={onDelete}><Unplug className="mr-2 h-4 w-4" />Disconnect</Button>}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            {!isBuiltIn && !readOnly && <Button onClick={() => onChangeItem(selected)}>Save</Button>}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
