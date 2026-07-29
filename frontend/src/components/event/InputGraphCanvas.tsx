import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Plus, Unplug } from 'lucide-react'
import {
  createInputCable,
  createInputSource,
  deleteInputCable,
  updateConsole,
  updateInputCable,
  updateInputDevice,
  updateStagebox,
  updateStageMulti,
} from '../../api/audioPatch'
import {
  cableAtPort,
  channelPorts,
  consoleLocalPorts,
  derivedPortColor,
  derivedSourceColor,
  devicePorts,
  isCablelessEdge,
  isPortConnected,
  resolvePortRef,
  sourcePorts,
  type PortRef,
} from '../../lib/inputGraph'
import { useIsMobile } from '../../hooks/useIsMobile'
import { usePlaneView } from '../../hooks/usePlaneView'
import { usePinchZoom } from '../../hooks/usePinchZoom'
import { fitScale } from '../../lib/canvasFit'
import { firstMatch, focusOffset } from '../../lib/canvasFocus'
import { originShift, PLANE_MARGIN, planeOrigin } from '../../lib/canvasPlane'
import { stageboxPorts, stageMultiPorts } from '../../lib/outputGraph'
import { matchesSearch } from '../../lib/patchSearch'
import { itemLabel } from '../../lib/utils'
import type { Console, InputCable, InputChannel, InputDevice, InputSource, InventoryItem, StageMulti, Stagebox } from '../../types'
import { FlowInspector, type InputFlowSelection } from './InputFlowInspector'
import { NodeShell as SharedNodeShell } from './graph/NodeShell'
import { PortDot as SharedPortDot } from './graph/PortDot'
import { PortRow as SharedPortRow, SplitPortRow, type PortWiring } from './graph/PortRow'
import {
  MICRO_LABEL,
  NODE_BORDER,
  NODE_CHROME,
  PHANTOM_BAR,
  PHANTOM_BAR_OFF,
  SOURCE_ROW,
  SOURCE_ROW_HEIGHT,
  TAPE_NEUTRAL,
} from './graph/tokens'
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
/** The desktop canvas *region*'s height. Not the plane's — the plane is sized by its content. */
const CANVAS_HEIGHT = 640

/*
  The two nodes with nowhere to store a position (Slice 37 A1).

  Every node that has columns of its own is placed at the coordinates it holds. These two
  do not have them: the Sources rail is one node standing for every source, and
  `channel:0` is the node that exists only so channels belonging to no desk stay
  patchable. Giving them storage is a migration and a Go change, which this slice's
  approved scope excludes — so they open at a constant and move for the session only.

  A constant is not the defect this slice fixes. What was wrong was a coordinate derived
  from the *browser window*; these are derived from nothing and are the same everywhere.
*/
const SOURCES_RAIL_X = 24
const CHANNEL_RAIL_X = 1400

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
  consoles,
  micItems,
  standItems,
  itemLabelById,
  search = '',
  selection,
  onSelectionChange,
  zoom: zoomProp,
  onFitChange,
  onZoomChange,
  onChanged,
  readOnly = false,
  ready = false,
}: {
  eventId: number
  sources: InputSource[]
  channels: InputChannel[]
  devices: InputDevice[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  cables: InputCable[]
  cableItems: InventoryItem[]
  /** The event's desks — one node each in the Channels lane (Slice 23). */
  consoles: Console[]
  /** Catalog picks the inspector offers for a source (Slice 23 retires the Sources card). */
  micItems: InventoryItem[]
  standItems: InventoryItem[]
  itemLabelById: Map<number, string>
  /**
   * The shell's search term. A graph never *hides* on search — removing a
   * node would remove edges that exist, so a partly-filtered patch would
   * read as an unpatched one (research.md R14). Non-matching nodes and rows
   * dim instead.
   */
  search?: string
  /**
   * Which node the inspector is open on. Owned by the tab, not by this canvas
   * (Slice 25 FR-002): the canvas is unmounted while the sheet is showing, so a
   * selection it owned could not survive the view toggle — and the sheet's
   * "Edit in Flow" could not set one it cannot see.
   */
  selection: InputFlowSelection | null
  onSelectionChange: (selection: InputFlowSelection | null) => void
  /**
   * The zoom level, owned by the tab because its control lives in the panel's
   * toolbar (Slice 25 FR-020). Read here for geometry, never set.
   *
   * `null` means *fit, not yet measured* — the phone opens at the scale where the whole
   * graph fits its window, and only this component can know what that is. The desktop
   * never passes it (Slice 36 R3).
   */
  zoom: number | null
  /** The fit scale, reported after each measurement so the bar's readout can name it. */
  onFitChange?: (fit: number) => void
  /**
   * Set by the pinch gesture only. The bar's control is still the tab's, and still the
   * only other thing that changes the zoom — this is the one input the canvas owns,
   * because two fingers on the canvas is not something the bar can see.
   */
  onZoomChange?: (zoom: number) => void
  onChanged: () => Promise<void>
  readOnly?: boolean
  /** Whether the graph's own data has arrived — see `usePlaneView`. */
  ready?: boolean
}) {
  const isMobile = useIsMobile()
  /*
    The one desk job, withheld by the gesture doing nothing (patterns.md §7g).

    It is **not** a permission and it does not vary with role: `readOnly` is a separate
    expression and still applies at both widths. What a phone withholds is direct
    manipulation of a spatial artifact — dragging a cable from one port to another, and
    dragging a box to a new position — and withholding it is also what leaves the
    platform's own pan gesture unobstructed, because those are the gestures that would
    otherwise compete for the same finger.

    The cable picker and the cable info dialog go with it rather than gaining a phone
    form: both are reached only from a port, and a port is drawn rather than tapped.
  */
  const spatial = !isMobile
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  /** Holds only the nodes, so the plane's extent cannot be measured from its own answer. */
  const nodesRef = useRef<HTMLDivElement>(null)
  const portEls = useRef(new Map<string, HTMLElement>())
  const [paths, setPaths] = useState<{ id: number; d: string; hasItem: boolean; network: boolean; color: string | undefined }[]>([])
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map())
  const [pendingPort, setPendingPort] = useState<PortRef | null>(null)
  const [dragGhost, setDragGhost] = useState<{ from: PortRef; x: number; y: number } | null>(null)
  const [pickerPair, setPickerPair] = useState<{ from: PortRef; to: PortRef; suggestedItemId?: number } | null>(null)
  const [infoCable, setInfoCable] = useState<InputCable | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The wrapper's real, measured box — the window, not the plane.
  const [viewport, setViewport] = useState({ width: 1180, height: CANVAS_HEIGHT })
  /*
    The plane's own size, in logical px, **measured** rather than computed (Slice 37).

    Deriving it would mean re-deriving every node's height from its port count, in a
    second place, and being wrong the first time a node grows a row. Absolutely
    positioned children contribute to a positioned ancestor's scroll area, so the content
    element reports its own extent exactly. It converges in one extra render because
    nothing inside the plane depends on the plane's size.
  */
  const [content, setContent] = useState({ width: 0, height: 0 })
  /*
    The plane: the content plus the same margin the origin already puts on the other two
    sides (FR-006). Without it a node against the right edge is against the edge of the
    scrollable area too, with nowhere to drop the one beside it.
  */
  const plane = useMemo(
    () => ({ width: content.width + PLANE_MARGIN, height: content.height + PLANE_MARGIN }),
    [content],
  )

  /*
    The scale at which the whole graph fits its window (patterns.md §7f).

    Since Slice 37 this is measured on **both** axes of both boxes — the window, and the
    plane's real extent rather than a nominal 820 × 640 rectangle. So *fit* frames the
    graph that exists. It is a control and not the opening state: for a real graph it
    lands near 20 % on a phone, where a 200 px node draws 42 px wide and no label in it
    is legible (research.md R6).
  */
  const fit = useMemo(() => fitScale(viewport.width, viewport.height, plane.width, plane.height), [viewport, plane])
  const zoom = zoomProp ?? fit

  useLayoutEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      // A zero measurement is the element being hidden, not a viewport of nothing.
      if (!box || !box.width || !box.height) return
      setViewport((current) =>
        Math.floor(box.width) === current.width && Math.floor(box.height) === current.height
          ? current
          : { width: Math.floor(box.width), height: Math.floor(box.height) },
      )
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Reported rather than returned, because the control that shows it lives in the bar
  // and the bar belongs to the shell (Slice 25 FR-020, unchanged by this). Reported at
  // both widths since Slice 37: the plane can be wider than a desk's window too.
  useEffect(() => {
    onFitChange?.(fit)
  }, [fit, onFitChange])

  const portContext = { sources, channels, devices, stageboxes, stageMultis, consoles }
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
  // A new source starts blank and selected, so the inspector is where it gets
  // its mic, connector and width — the Sources card's whole job, relocated.
  const addSourceMutation = useMutation({
    mutationFn: () =>
      createInputSource(eventId, {
        name: `Source ${sources.length + 1}`,
        kind: 'line',
        phantom_power: false,
        connector_type: 'xlr',
        width: 'mono',
        position_x: 24,
        position_y: 24 + sources.length * 24,
      }),
    onSuccess: async (created) => {
      onSelectionChange({ kind: 'source', id: created.id })
      await onChanged()
    },
  })
  // The desk's channel rail. Both axes since Slice 37 — it used to be pinned to the
  // canvas's right edge, so an x would have been overwritten on the next render.
  const moveConsoleMutation = useMutation({
    mutationFn: ({ id, x, y }: { id: number; x: number; y: number }) =>
      updateConsole(eventId, id, { input_position_x: x, input_position_y: y }),
    onSuccess: onChanged,
  })
  // Its jack panel is free in both axes, and stores its own pair — dragging it
  // here must not move the panel on the Outputs canvas (Slice 24 FR-013).
  const moveConsoleJacksMutation = useMutation({
    mutationFn: ({ id, x, y }: { id: number; x: number; y: number }) =>
      updateConsole(eventId, id, { local_input_position_x: x, local_input_position_y: y }),
    onSuccess: onChanged,
  })
  const registerPort = (key: string) => (el: HTMLElement | null) => {
    if (el) portEls.current.set(key, el)
    else portEls.current.delete(key)
  }

  /** What the rail shows beside a source's name: the mic it carries, or its connector. */
  const micLabel = (source: InputSource) => {
    if (source.mic_item_id) {
      const label = micItems.find((item) => item.id === source.mic_item_id)?.name ?? itemLabelById.get(source.mic_item_id)
      if (label) return label.split(' — ')[0]
    }
    return source.connector_type
  }

  const orphanChannels = useMemo(() => channels.filter((channel) => channel.console_id == null), [channels])

  const layout = useMemo<NodeLayout[]>(() => {
    const nodes: NodeLayout[] = []
    // The Sources rail: a constant, because it has no row to store a position on (A1).
    nodes.push({ kind: 'source', id: 0, x: SOURCES_RAIL_X, y: 24 })

    let nextY = 24
    for (const desk of consoles) {
      // The desk's channel rail, keyed by the kind of port it carries. Console
      // ids start at 1, so this never collides with the `channel:0` node below.
      //
      // Its x is the coordinate it holds, not the canvas's right edge. That pin is what
      // forced the whole coordinate space to be measured from the browser window, and
      // deleting it is what makes every other node in this function mean one place
      // (Slice 37 FR-004).
      const override = positions.get(`channel:${desk.id}`)
      const y = override?.y ?? desk.input_position_y ?? nextY
      nodes.push({ kind: 'channel', id: desk.id, x: override?.x ?? desk.input_position_x, y })
      // Below the desk actually placed, not below a counter that ignores where
      // it sits — the arithmetic that let the orphan node open on top of a desk
      // whose stored y had already moved past it (Slice 24 FR-007).
      nextY = Math.max(nextY + 220, y + 220)

      // The desk's own jack panel is a second node since Slice 24, in the
      // processing lane rather than beside the strips: signal passes *through*
      // it on the way to a channel, and drawing it as a two-sided pass-through
      // is what lets a local jack reach a channel at all (FR-008 to FR-010).
      // No jacks declared, no node (FR-014).
      if (desk.local_input_count > 0) {
        const jackOverride = positions.get(`console_local:${desk.id}`)
        nodes.push({
          kind: 'console_local',
          id: desk.id,
          x: jackOverride?.x ?? desk.local_input_position_x,
          y: jackOverride?.y ?? desk.local_input_position_y,
        })
      }
    }
    // Channels belonging to no desk keep a node of their own rather than
    // disappearing — the state an event is in after its only desk is
    // deleted, and it must stay patchable.
    if (orphanChannels.length > 0 || consoles.length === 0) {
      const override = positions.get('channel:0')
      nodes.push({ kind: 'channel', id: 0, x: override?.x ?? CHANNEL_RAIL_X, y: override?.y ?? nextY })
    }

    for (const sb of stageboxes) {
      const override = positions.get(`stagebox:${sb.id}`)
      nodes.push({ kind: 'stagebox', id: sb.id, x: override?.x ?? sb.input_position_x, y: override?.y ?? sb.input_position_y })
    }
    for (const sm of stageMultis) {
      const override = positions.get(`stage_multi:${sm.id}`)
      nodes.push({ kind: 'stage_multi', id: sm.id, x: override?.x ?? sm.input_position_x, y: override?.y ?? sm.input_position_y })
    }
    for (const device of devices) {
      const override = positions.get(`device:${device.id}`)
      nodes.push({ kind: 'device', id: device.id, x: override?.x ?? device.position_x, y: override?.y ?? device.position_y })
    }
    return nodes
  }, [consoles, orphanChannels, stageboxes, stageMultis, devices, positions])

  /*
    Where the plane starts (Slice 37 R4).

    A node may sit left of or above every other one — the approved answer to "should a
    node be draggable into negative space" was yes, because a floor at zero is an
    arbitrary limit. But panning is the platform's own scrolling and a scroll container
    has no negative side, so the origin the plane counts from is derived from the content
    instead of fixed at 0,0. A node is drawn at `x - origin.x`.
  */
  const origin = useMemo(() => planeOrigin(layout), [layout])

  /* Opening where it was last left on this device, and remembering where that is. */
  const { onScroll: rememberView } = usePlaneView({
    eventId,
    tab: 'inputs',
    wrapperRef,
    zoom,
    zoomProp,
    origin,
    content,
    ready,
    onZoom: onZoomChange,
  })

  /*
    The plane's extent, read back off the DOM after each layout.

    `scrollWidth`/`scrollHeight` on the positioned content element account for its
    absolutely positioned descendants, so this is the exact box the nodes occupy — port
    counts, rail lengths and all — without a second implementation of how tall a node is.
  */
  useLayoutEffect(() => {
    const el = nodesRef.current
    if (!el) return
    const width = el.scrollWidth
    const height = el.scrollHeight
    setContent((current) => (current.width === width && current.height === height ? current : { width, height }))
  }, [layout, sources, channels, consoles, stageboxes, stageMultis, devices])


  /*
    Keeping the view still while the plane grows under it (R4).

    The origin is derived from the content, so dragging one node past the left edge moves
    **every other node's** DOM offset by the same delta. Without this the whole graph
    lurches sideways under the finger that is holding the node — once per frame, for as
    long as the drag keeps extending the plane.

    Read from the ref rather than a dependency so the effect sees the previous origin, and
    `+=` rather than `=` so it composes with momentum still running from the last flick.

    `lastOrigin` is seeded with the first origin and updated on every run including the
    early return, so this can never compose with `usePlaneView`'s absolute restore in one
    commit: by the time a restore happens the ref already agrees with the current origin.
  */
  const lastOrigin = useRef(origin)
  useLayoutEffect(() => {
    const el = wrapperRef.current
    const before = lastOrigin.current
    lastOrigin.current = origin
    if (!el || (before.x === origin.x && before.y === origin.y)) return
    const shift = originShift(before, origin, zoom)
    el.scrollLeft += shift.x
    el.scrollTop += shift.y
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin])

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
        return { id: cable.id, d, hasItem: cable.cable_item_id != null, network: isCablelessEdge(cable.from_kind, cable.to_kind), color }
      })
      .filter((p): p is { id: number; d: string; hasItem: boolean; network: boolean; color: string | undefined } => p !== null)
    setPaths(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cables, layout, zoom, content])

  /*
    Whether a node matches the search term — **one** predicate, used both to dim and to
    aim the window (Slice 36 R6). Deriving the focused node from a second predicate is
    how the dimmed set and the window's target come to disagree.
  */
  const matchesNode = useCallback(
    (node: NodeLayout): boolean => {
      if (!search.trim()) return true
      switch (node.kind) {
        case 'source':
          return sources.some((source) => matchesSearch(search, source.name, micLabel(source)))
        case 'stagebox': {
          const sb = stageboxes.find((candidate) => candidate.id === node.id)
          return !!sb && matchesSearch(search, sb.name, sb.model)
        }
        case 'stage_multi': {
          const sm = stageMultis.find((candidate) => candidate.id === node.id)
          return !!sm && matchesSearch(search, sm.name)
        }
        case 'device': {
          const device = devices.find((candidate) => candidate.id === node.id)
          return !!device && matchesSearch(search, device.name)
        }
        case 'console_local': {
          const deskFor = consoles.find((candidate) => candidate.id === node.id)
          return !!deskFor && matchesSearch(search, deskFor.name, 'local')
        }
        default: {
          // A desk's own channel rail, or the box holding channels with no desk. It
          // matches when any channel on it does — the rows are inside the node, so the
          // node is what the window can be aimed at.
          const owned = node.id === 0 ? orphanChannels : channels.filter((channel) => channel.console_id === node.id)
          return owned.some((channel) => matchesSearch(search, channel.channel_number, channel.channel_name, channel.notes))
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, sources, stageboxes, stageMultis, devices, consoles, channels, orphanChannels],
  )

  const lastFocused = useRef('')
  /*
    The window follows the search (Slice 36 FR-030), at **every** width.

    On a 1180 px desk, dimming the rest is a highlight. In a 341 px window over an 820 px
    graph it has to be a direction, or the match is dimmed-in somewhere you cannot see —
    and a 60-channel graph scrolls on a desk too, which is why this is not guarded on
    reach. A node already comfortably in view does not move the window.
  */
  useEffect(() => {
    const el = wrapperRef.current
    if (!el || !search.trim()) {
      lastFocused.current = ''
      return
    }
    const target = firstMatch(layout, matchesNode)
    if (!target) return
    /*
      Only when the *answer* changes. `layout` gets a new identity on every node
      position update, so without this a term left in the search box would re-aim the
      window on every frame of a desktop drag — the search would fight the hand.
    */
    const key = `${target.kind}:${target.id}`
    if (key === lastFocused.current) return
    lastFocused.current = key
    const { left, top } = focusOffset({ x: target.x - origin.x, y: target.y - origin.y }, {
      zoom,
      viewportW: el.clientWidth,
      viewportH: el.clientHeight,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      nodeW: NODE_WIDTH,
      contentW: plane.width * zoom,
      contentH: plane.height * zoom,
    })
    el.scrollTo({ left, top, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, layout, zoom])

  /*
    And a selection made on a phone is scrolled clear of the inspector, which rises from
    the bottom edge and would otherwise cover the box you just tapped (FR-019). Half the
    window is the sheet's own natural height for these fields; the arithmetic clamps, so
    an over-estimate costs nothing.
  */
  useEffect(() => {
    const el = wrapperRef.current
    if (!isMobile || !el || !selection) return
    const target = layout.find((node) => node.kind === selection.kind && (node.kind === 'source' || node.id === selection.id))
    if (!target) return
    const { left, top } = focusOffset({ x: target.x - origin.x, y: target.y - origin.y }, {
      zoom,
      viewportW: el.clientWidth,
      viewportH: el.clientHeight,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      nodeW: NODE_WIDTH,
      clearBottom: el.clientHeight / 2,
      contentW: plane.width * zoom,
      contentH: plane.height * zoom,
    })
    el.scrollTo({ left, top, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, isMobile])

  /*
    Pinch, about the midpoint of the contacts (patterns.md §7f). The tab owns the zoom,
    so this reports where the window has to land and the caller sets the scale.
  */
  /*
    Pinch, about the midpoint of the contacts (patterns.md §7f).

    The correction is **stashed and applied after the new scale has been laid out**, not
    written beside the state update. Setting `scrollLeft` while the content box is still
    at the old scale hands the browser an offset it clamps to the old maximum — and
    starting from *fit* the old maximum is ~0, so every frame of a pinch-in would be
    clamped away and the graph would slide out from under the fingers. That is precisely
    the failure `usePinchZoom` exists to prevent, one layer up from where it was fixed.
  */
  const pendingAnchor = useRef<{ target: number; logicalX: number; logicalY: number; pointX: number; pointY: number } | null>(null)
  const onPinch = useCallback(
    (next: number, anchor: { logicalX: number; logicalY: number; pointX: number; pointY: number }) => {
      pendingAnchor.current = { ...anchor, target: next }
      onZoomChange?.(next)
    },
    [onZoomChange],
  )
  useLayoutEffect(() => {
    const el = wrapperRef.current
    const pending = pendingAnchor.current
    if (!el || !pending) return
    /*
      **The scale this anchor was computed for**, and it is checked rather than assumed.

      A pinch emits on every pointer move with no equality test, so the moment it reaches
      either end of `[fit, 1]` — which is the normal way a pinch finishes, over a range
      this short — `setZoom` is a no-op, React bails, and this effect never runs. The
      anchor would then sit in the ref until the *next* zoom change from any source, and
      a tap on the bar's `+` would re-scroll the window to a midpoint from a gesture that
      finished minutes ago.

      Cleared either way: a stale anchor is dropped rather than applied late.
    */
    pendingAnchor.current = null
    if (pending.target !== zoom) return
    el.scrollLeft = pending.logicalX * zoom - pending.pointX
    el.scrollTop = pending.logicalY * zoom - pending.pointY
  }, [zoom])
  usePinchZoom(wrapperRef, { enabled: isMobile, zoom, min: fit, max: 1, onZoom: onPinch })

  function persistPosition(kind: PortRef['kind'], id: number, x: number, y: number) {
    const onError = (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to save position')
    if (kind === 'channel') {
      if (id === 0) {
        // The node holding channels with no desk. It moves for the session — the
        // canvas's own `positions` map already holds it — but there is no row to
        // store it on, so nothing is persisted (Slice 24 FR-006, research.md R4).
        return
      }
      moveConsoleMutation.mutate({ id, x, y }, { onError })
      return
    }
    if (kind === 'console_local') {
      moveConsoleJacksMutation.mutate({ id, x, y }, { onError })
      return
    }
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

  /*
    Tap versus pan (Slice 36 R5).

    Slice 35 found this exact defect on the stage plot: a thumb on a riser opened the
    riser instead of panning, so the plot could only be moved from empty floor. Here the
    pan is the platform's, so the threshold is all that is needed — but the browser
    cancels pointer events once it takes over a scroll, so the scroll offset is checked
    as well as the movement. Either signal means the press was a pan.
  */
  const press = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const moved = useRef(false)

  function beginPress(event: ReactPointerEvent) {
    const el = wrapperRef.current
    press.current = { x: event.clientX, y: event.clientY, left: el?.scrollLeft ?? 0, top: el?.scrollTop ?? 0 }
    moved.current = false
  }
  function trackPress(event: ReactPointerEvent) {
    const start = press.current
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 3) moved.current = true
  }
  /* `pointercancel` is the browser saying *I have taken this gesture as a scroll*, and it
     is the only signal that is certain: once it fires, `pointermove` stops, so a flick
     whose scroll has not yet started would otherwise read as a clean tap. */
  function cancelPress() {
    moved.current = true
  }
  function pressWasPan(): boolean {
    if (moved.current) return true
    const el = wrapperRef.current
    const start = press.current
    return !!el && !!start && (Math.abs(el.scrollLeft - start.left) > 3 || Math.abs(el.scrollTop - start.top) > 3)
  }
  /** A selection handler that yields to the pan. Every `onSelect` on this canvas goes through it. */
  const onTap = (select: () => void) => () => {
    if (pressWasPan()) return
    select()
  }

  function startNodeDrag(kind: PortRef['kind'], id: number, event: ReactPointerEvent) {
    // Two statements, never one expression: the first is a **gesture** withheld by reach
    // and the second is a **permission** withheld by role, and `audit.md`'s own rule is
    // that the two never share an expression (P9, §7g).
    if (!spatial) return
    if (readOnly) return
    const node = layout.find((n) => n.kind === kind && n.id === id)
    if (!node) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startY = event.clientY
    // `start`, not `origin`: the plane has an origin of its own now, and two different
    // meanings for that word in one function is how the wrong one gets used.
    const start = { x: node.x, y: node.y }
    let latest = start
    const key = `${kind}:${id}`

    function onMove(moveEvent: PointerEvent) {
      // Node positions live in the canvas's unscaled logical coordinate
      // space, but pointer movement is measured in real screen pixels —
      // dividing by the current zoom converts back to the matching
      // logical delta (mirrors the Output graph's own canvas).
      //
      // Unclamped in both axes since Slice 37. There is no lane to stay inside and no
      // floor at zero: a node dragged past the edge extends the plane instead (FR-005).
      const dx = (moveEvent.clientX - startX) / zoom
      const dy = (moveEvent.clientY - startY) / zoom
      latest = { x: start.x + dx, y: start.y + dy }
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
    // A port is drawn, never a target (patterns.md §7f). Nothing selects, nothing
    // connects, and the cable info dialog behind this is unreachable with it.
    if (!spatial) return
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
    // Not stopped, and not handled: the press belongs to the pan.
    if (!spatial) return
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
    <div className={isMobile ? 'flex min-h-0 flex-1 flex-col' : undefined}>
      {error && <div className="border-b border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-300">{error}</div>}
      {pendingPort && !dragGhost && (
        <div className="border-b border-amber-500/30 bg-amber-500/[0.05] px-3 py-1.5 text-[11px] text-amber-300">
          Selected {pendingPort.label} — click a free {pendingPort.direction === 'out' ? 'input' : 'output'} port to connect, or click it again to cancel.
        </div>
      )}
      <div className={isMobile ? 'flex min-h-0 flex-1 flex-col' : 'flex items-start gap-3'}>
      {/*
        The viewport. On a phone it is `overflow: auto` and nothing else — the pan is the
        platform's own scrolling, with momentum, both axes and unbounded, which is better
        than anything we would write and is available only because §7g withholds the
        gestures that would compete for the same finger (Slice 36 R4). `touch-action`
        leaves one finger to the browser and the two-finger case to `usePinchZoom`.
      */}
      <div
        ref={wrapperRef}
        className={isMobile ? 'min-h-0 flex-1 overflow-auto' : 'min-w-0 flex-1 overflow-auto'}
        onPointerDown={isMobile ? beginPress : undefined}
        onPointerCancel={isMobile ? cancelPress : undefined}
        onPointerMove={isMobile ? trackPress : undefined}
        onScroll={rememberView}
        style={isMobile ? { touchAction: 'pan-x pan-y' } : { height: CANVAS_HEIGHT }}
      >
        {/*
          The scrolled box, sized to the plane at the current scale, and the plane itself.
          The inner element is given **no** width or height: its size is its content's,
          which is exactly what the measurement above reads back off it. Setting a size
          here from that measurement would be a loop.

          No lane bands. They were three regions computed from the canvas width, and there
          is no canvas width any more — but the reason they are gone rather than pinned to
          constants is that a band saying *Rig* is a claim about where nodes are, and
          nothing constrains that now (Slice 37 FR-013, research.md R7).
        */}
        <div style={{ width: plane.width * zoom, height: plane.height * zoom }}>
          <div ref={canvasRef} className="relative" style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
            <svg className="pointer-events-none absolute left-0 top-0" width={plane.width} height={plane.height}>
              {/* Two independent encodings (Slice 23): hue says which channel this
                  run reaches, dash pattern says what kind of link it is — so a
                  network hop can wear its channel's colour and still read as a
                  network hop, which a fixed cyan could not. */}
              {paths.map((p) => (
                <path
                  key={p.id}
                  d={p.d}
                  fill="none"
                  stroke={p.color ?? (p.hasItem || p.network ? '#f59e0b' : '#71717a')}
                  strokeWidth={2 / zoom}
                  strokeDasharray={p.network ? `${7 / zoom} ${3 / zoom}` : p.hasItem ? undefined : `${4 / zoom} ${3 / zoom}`}
                />
              ))}
              {ghostPath && <path d={ghostPath} fill="none" stroke="#f59e0b" strokeWidth={2 / zoom} strokeDasharray={`${5 / zoom} ${4 / zoom}`} opacity={0.85} />}
            </svg>
            {/*
              The measured element, and it holds **only the nodes** (Slice 37, review).

              Two things would otherwise feed the measurement its own previous answer. The
              `<svg>` above is sized to the plane, and a positioned child contributes its
              own edge to `scrollWidth` — so the extent could grow and never shrink, and a
              node dragged back from the far right would leave the space behind. And a
              *block* element inherits its parent's width, so its `scrollWidth` has a floor
              of the outer box's `plane.width * zoom`, which above 100 % inflates on every
              remeasure. Absolutely positioned with no width, this element shrink-to-fits
              over nothing — abs-positioned children do not contribute — so its scroll area
              is exactly the nodes, and nothing derived from the previous answer.
            */}
            <div ref={nodesRef} className="absolute left-0 top-0">
            {layout.map((node) => {
              if (node.kind === 'source') {
                return (
                  <SourcesNode
                    key="sources"
                    x={node.x - origin.x}
                    y={node.y - origin.y}
                    sources={sources}
                    cables={cables}
                    pendingPort={pendingPort}
                    onPortClick={handlePortClick}
                    onPortPointerDown={handlePortPointerDown}
                    registerPort={registerPort}
                    colorContext={colorContext}
                    search={search}
                    micLabel={micLabel}
                    selectedId={selection?.kind === 'source' ? selection.id : undefined}
                    onSelect={(source) => onTap(() => onSelectionChange({ kind: 'source', id: source.id }))()}
                    onAdd={readOnly ? undefined : () => addSourceMutation.mutate()}
                  />
                )
              }
              if (node.kind === 'console_local') {
                const desk = consoles.find((c) => c.id === node.id)
                if (!desk) return null
                return (
                  <LocalJackNode
                    key={`jacks-${desk.id}`}
                    x={node.x - origin.x}
                    y={node.y - origin.y}
                    desk={desk}
                    cables={cables}
                    pendingPort={pendingPort}
                    onPortClick={handlePortClick}
                    onPortPointerDown={handlePortPointerDown}
                    registerPort={registerPort}
                    colorContext={colorContext}
                    /* Gated on `spatial` alone; the role is handled inside
                       `startNodeDrag`. The outputs canvas gates on both, in a
                       `dragHandle` helper, because it already passed `undefined` for a
                       read-only role at the call site — so the two express one rule in
                       two shapes. Each preserves its own desktop markup, which is why
                       neither was made to match the other. */
                    onDragStart={spatial ? (e) => startNodeDrag('console_local', desk.id, e) : undefined}
                    selected={selection?.kind === 'console_local' && selection.id === desk.id}
                    onSelect={onTap(() => onSelectionChange({ kind: 'console_local', id: desk.id }))}
                    dimmed={!matchesNode(node)}
                  />
                )
              }
              if (node.kind === 'channel') {
                // id 0 is the node for channels belonging to no desk; anything
                // else is a desk's own channel rail (see the layout above).
                const desk = node.id === 0 ? undefined : consoles.find((c) => c.id === node.id)
                if (node.id !== 0 && !desk) return null
                return desk ? (
                  <ConsoleNode
                    key={`desk-${desk.id}`}
                    x={node.x - origin.x}
                    y={node.y - origin.y}
                    desk={desk}
                    channels={channels.filter((channel) => channel.console_id === desk.id)}
                    cables={cables}
                    pendingPort={pendingPort}
                    onPortClick={handlePortClick}
                    onPortPointerDown={handlePortPointerDown}
                    registerPort={registerPort}
                    colorContext={colorContext}
                    onDragStart={spatial ? (e) => startNodeDrag('channel', desk.id, e) : undefined}
                    selected={selection?.kind === 'channel' && selection.id === desk.id}
                    onSelect={onTap(() => onSelectionChange({ kind: 'channel', id: desk.id }))}
                    search={search}
                  />
                ) : (
                  <ChannelsNode
                    key="channels"
                    x={node.x - origin.x}
                    y={node.y - origin.y}
                    channels={orphanChannels}
                    cables={cables}
                    pendingPort={pendingPort}
                    onPortClick={handlePortClick}
                    onPortPointerDown={handlePortPointerDown}
                    registerPort={registerPort}
                    colorContext={colorContext}
                    onDragStart={spatial ? (e) => startNodeDrag('channel', 0, e) : undefined}
                    search={search}
                  />
                )
              }
              if (node.kind === 'stagebox') {
                const sb = stageboxes.find((s) => s.id === node.id)
                if (!sb) return null
                return (
                  <StageboxNode
                    key={`sb-${sb.id}`}
                    x={node.x - origin.x}
                    y={node.y - origin.y}
                    stagebox={sb}
                    cables={cables}
                    pendingPort={pendingPort}
                    onPortClick={handlePortClick}
                    onPortPointerDown={handlePortPointerDown}
                    registerPort={registerPort}
                    onDragStart={spatial ? (e) => startNodeDrag('stagebox', sb.id, e) : undefined}
                    selected={selection?.kind === 'stagebox' && selection.id === sb.id}
                    onSelect={onTap(() => onSelectionChange({ kind: 'stagebox', id: sb.id }))}
                    colorContext={colorContext}
                    dimmed={!matchesNode(node)}
                  />
                )
              }
              if (node.kind === 'stage_multi') {
                const sm = stageMultis.find((s) => s.id === node.id)
                if (!sm) return null
                return (
                  <StageMultiNode
                    key={`sm-${sm.id}`}
                    x={node.x - origin.x}
                    y={node.y - origin.y}
                    stageMulti={sm}
                    cables={cables}
                    pendingPort={pendingPort}
                    onPortClick={handlePortClick}
                    onPortPointerDown={handlePortPointerDown}
                    registerPort={registerPort}
                    onDragStart={spatial ? (e) => startNodeDrag('stage_multi', sm.id, e) : undefined}
                    selected={selection?.kind === 'stage_multi' && selection.id === sm.id}
                    onSelect={onTap(() => onSelectionChange({ kind: 'stage_multi', id: sm.id }))}
                    colorContext={colorContext}
                    dimmed={!matchesNode(node)}
                  />
                )
              }
              const device = devices.find((d) => d.id === node.id)
              if (!device) return null
              return (
                <DeviceNode
                  key={`dev-${device.id}`}
                  x={node.x - origin.x}
                  y={node.y - origin.y}
                  device={device}
                  cables={cables}
                  pendingPort={pendingPort}
                  onPortClick={handlePortClick}
                  onPortPointerDown={handlePortPointerDown}
                  registerPort={registerPort}
                  onDragStart={spatial ? (e) => startNodeDrag('device', device.id, e) : undefined}
                  selected={selection?.kind === 'device' && selection.id === device.id}
                  onSelect={onTap(() => onSelectionChange({ kind: 'device', id: device.id }))}
                  colorContext={colorContext}
                  dimmed={!matchesNode(node)}
                />
              )
            })}
            </div>
          </div>
        </div>
      </div>
      {selection && (
        <FlowInspector
          eventId={eventId}
          selection={selection}
          sources={sources}
          channels={channels}
          devices={devices}
          stageboxes={stageboxes}
          stageMultis={stageMultis}
          consoles={consoles}
          cables={cables}
          micItems={micItems}
          standItems={standItems}
          itemLabelById={itemLabelById}
          onClose={() => onSelectionChange(null)}
          onChanged={onChanged}
          readOnly={readOnly}
        />
      )}
      </div>

      {devices.length === 0 && stageboxes.length === 0 && stageMultis.length === 0 && (
        <p className="border-t border-zinc-800 px-3 py-1.5 text-[11px] text-zinc-500">
          No processing gear yet — click or drag from a source's port directly to a channel to start cabling. Boxes are declared in the Rig drawer.
        </p>
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

/**
 * Adapters over the shared graph primitives (Slice 25 FR-036). The two canvases
 * used to each hold their own copy of these, which is why their boxes drifted apart;
 * the drawing now lives in `graph/` and these only bind it to this graph's own
 * `PortRef` union, port keys and colour rule.
 */
function PortDot({ port, connected, selected, color, onClick, onPointerDown, registerRef }: {
  port: PortRef
  connected: boolean
  selected: boolean
  color?: string
  onClick: () => void
  onPointerDown: (e: ReactPointerEvent) => void
  registerRef: (el: HTMLElement | null) => void
}) {
  return (
    <SharedPortDot
      port={port}
      dataKey={portKey(port.kind, port.id, port.port, port.direction)}
      connected={connected}
      selected={selected}
      color={color}
      onClick={onClick}
      onPointerDown={onPointerDown}
      registerRef={registerRef}
    />
  )
}

function NodeShell({ x, y, title, badge, dimmed, selected, footer, footerAlarm, onDragStart, onDelete, onSelect, children }: {
  x: number
  y: number
  title: string
  badge?: string
  dimmed?: boolean
  selected?: boolean
  footer?: ReactNode
  footerAlarm?: boolean
  onDragStart?: (e: ReactPointerEvent) => void
  onDelete?: () => void
  onSelect?: () => void
  children: ReactNode
}) {
  return (
    <SharedNodeShell
      x={x}
      y={y}
      width={NODE_WIDTH}
      title={title}
      badge={badge}
      footer={footer}
      footerAlarm={footerAlarm}
      dimmed={dimmed}
      selected={selected}
      desk={badge === 'DESK'}
      onDragStart={onDragStart}
      onDelete={onDelete}
      onSelect={onSelect}
    >
      {children}
    </SharedNodeShell>
  )
}

interface ColorContext {
  channels: InputChannel[]
  devices: InputDevice[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  cables: InputCable[]
}

function PortRow({ label, port, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, align, colorContext, dimmed }: {
  label: string
  port: PortRef
  cables: InputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  align: 'left' | 'right'
  colorContext: ColorContext
  dimmed?: boolean
}) {
  return (
    <SharedPortRow
      port={port}
      label={label}
      align={align}
      dimmed={dimmed}
      wiring={wiringFor(cables, pendingPort, colorContext, onPortClick, onPortPointerDown, registerPort)}
    />
  )
}

/** Binds this graph's cables, gesture state and colour rule to the shared rows. */
function wiringFor(
  cables: InputCable[],
  pendingPort: PortRef | null,
  colorContext: ColorContext,
  onPortClick: (port: PortRef) => void,
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void,
  registerPort: (key: string) => (el: HTMLElement | null) => void,
): PortWiring {
  return {
    isConnected: (port) => isPortConnected(port.kind as PortRef['kind'], port.id, port.port, port.direction, cables),
    isPending: (port) =>
      !!pendingPort && pendingPort.kind === port.kind && pendingPort.id === port.id && pendingPort.port === port.port && pendingPort.direction === port.direction,
    colorOf: (port) => derivedPortColor(port as PortRef, colorContext),
    keyOf: (port) => portKey(port.kind as PortRef['kind'], port.id, port.port, port.direction),
    onPortClick: (port) => onPortClick(port as PortRef),
    onPortPointerDown: (port, event) => onPortPointerDown(port as PortRef, event),
    registerPort,
  }
}

/**
 * The source rail (Slice 23 FR-027/FR-028), rebuilt to the mockup's row anatomy
 * (Slice 25 FR-032 to FR-035).
 *
 * One consolidated node of fixed-height rows rather than a card per source: at 54px
 * a card each, a 32-source festival patch is ~1,700px of lane and the graph stops
 * being readable exactly where it matters most. The saved space goes on information
 * the row previously lacked — the derived colour tape, the picked model, and phantom
 * power.
 *
 * Since Slice 37 the rail does **not** scroll inside itself — see the note at its own
 * body. It is a node on a plane, as tall as its contents.
 *
 * The mockup's "drag to reorder" hint in the footer is deliberately not reproduced:
 * sources are not drag-reorderable and this slice does not add it, so the hint would
 * be a lie (research.md R10).
 */
function SourcesNode({ x, y, sources, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, colorContext, search = '', micLabel, selectedId, onSelect, onAdd }: {
  x: number
  y: number
  sources: InputSource[]
  cables: InputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  colorContext: ColorContext
  search?: string
  /** The picked mic's own name, or the connector for a line source. */
  micLabel: (source: InputSource) => string
  selectedId?: number
  onSelect?: (source: InputSource) => void
  /** Adds a source, from the rail's own footer where the mockup puts it. */
  onAdd?: () => void
}) {
  const wiring = wiringFor(cables, pendingPort, colorContext, onPortClick, onPortPointerDown, registerPort)
  return (
    <div
      className={`absolute ${NODE_CHROME} ${NODE_BORDER} overflow-hidden`}
      style={{ left: x, top: y, width: NODE_WIDTH }}
    >
      <div className="flex h-5 items-center gap-1.5 border-b border-zinc-800 bg-zinc-950/60 px-1.5">
        <span className={`${MICRO_LABEL} text-zinc-400`}>Sources</span>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-zinc-600">{sources.length}</span>
      </div>

      {/*
        No height cap and no scroll of its own since Slice 37. On a fixed-height canvas the
        cap earned its place; on a plane it is a second viewport nested inside the first —
        the finger that meant to pan scrolls the rail instead, and every cable landing on it
        has to be re-attached for a movement the plane could have expressed by panning. The
        rail is as tall as its contents and the plane scrolls (research.md R8).
      */}
      <div>
        {sources.map((source) => (
          <SourceRow
            key={source.id}
            source={source}
            wiring={wiring}
            colorContext={colorContext}
            dimmed={!matchesSearch(search, source.name, micLabel(source))}
            selected={selectedId === source.id}
            modelLabel={micLabel(source)}
            onSelect={onSelect ? () => onSelect(source) : undefined}
          />
        ))}
        {sources.length === 0 && <p className="px-1.5 py-1 text-[11px] text-zinc-600">No sources yet</p>}
      </div>

      {onAdd && (
        <div className="flex h-6 items-center border-t border-zinc-800 bg-zinc-950/60 px-1.5">
          <Button size="sm" variant="ghost" className="h-[18px] px-1.5 text-[10px]" onClick={onAdd}>
            <Plus className="mr-1 h-3 w-3" />Source
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * One source, one row: a full-height colour tape, the name, the model in quiet mono,
 * the 48 V bar, the port flush right. A stereo source is two port slots tall with
 * `L` above `R`, each side taking its own cable — which is what the data model has
 * always said, since `sourcePorts` returns two independently cablable ports.
 *
 * The tape runs the whole height of the row rather than sitting centred in it, which
 * is the single most visible difference from the mockup and a one-property fix
 * (`self-stretch`). It reads as the tape wrapped round the cable end, which is what
 * it stands for.
 *
 * Phantom power is a **red bar**, never a dot: every circle in this rail is a port
 * you can patch, so the indicator differs from one in both hue and shape.
 */
function SourceRow({ source, wiring, colorContext, dimmed, selected, modelLabel, onSelect }: {
  source: InputSource
  wiring: PortWiring
  colorContext: ColorContext
  dimmed?: boolean
  selected?: boolean
  modelLabel: string
  onSelect?: () => void
}) {
  const ports = sourcePorts(source)
  const tape = derivedSourceColor(source, colorContext)
  const stereo = ports.length > 1
  /*
    No `scrollIntoView` here since Slice 37.

    It was written for a rail with `max-h-[420px] overflow-y-auto` — "a selection arriving
    from the sheet may point at a row below the fold" — and FR-014 removed that cap. With
    no scroll container of its own, the nearest scrollable ancestor is the plane's viewport,
    so selecting a source would pan the whole graph *instantly*, and on a phone it would do
    it in the same commit as, and just before, the sheet-clearance `scrollTo({behavior:
    'smooth'})` that is supposed to own that scroll. The rail is now as tall as its
    contents, so there is no fold for a row to be below.
  */

  return (
    <div
      // The height is set here rather than in the token, one slot per port, so a
      // stereo source is genuinely twice as tall and its two dots cannot overlap.
      style={{ height: ports.length * SOURCE_ROW_HEIGHT }}
      className={`${SOURCE_ROW} transition-opacity ${dimmed ? 'opacity-30' : ''} ${selected ? 'bg-amber-500/10' : ''} last:border-b-0`}
    >
      <span aria-hidden className="w-[3px] shrink-0 self-stretch" style={{ backgroundColor: tape ?? TAPE_NEUTRAL }} />
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-1.5 pl-1 text-left" title={source.name}>
        <span className={`min-w-0 flex-1 truncate ${selected ? 'font-semibold text-zinc-50' : tape ? 'text-zinc-300' : 'text-zinc-400'}`}>
          {source.name}
        </span>
        <span className="max-w-[4.5rem] shrink-0 truncate font-mono text-[10px] text-zinc-500">{modelLabel}</span>
      </button>
      <span
        aria-label={source.phantom_power ? '48 V on' : '48 V off'}
        title={source.phantom_power ? '48 V phantom power on' : '48 V off'}
        className={source.phantom_power ? PHANTOM_BAR : PHANTOM_BAR_OFF}
      />
      <div className="flex shrink-0 flex-col justify-center">
        {ports.map((port) => (
          <div key={port.port} className="flex items-center justify-end gap-1" style={{ height: SOURCE_ROW_HEIGHT }}>
            {stereo && <span className="font-mono text-[9px] text-zinc-600">{port.port === 0 ? 'L' : 'R'}</span>}
            <PortDot
              port={port}
              connected={wiring.isConnected(port)}
              selected={wiring.isPending(port)}
              color={wiring.colorOf(port)}
              onClick={() => wiring.onPortClick(port)}
              onPointerDown={(event) => wiring.onPortPointerDown(port, event)}
              registerRef={wiring.registerPort(portKey(port.kind, port.id, port.port, 'out'))}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Channels belonging to no desk — the state an event is in after its only desk
 * is deleted, or while it has several and a channel has not been assigned to one.
 *
 * Draggable like every other node (Slice 24 FR-006), but its position is
 * session-only: there is no row to store it on, and inventing a table for the
 * placement of a box that should usually be empty is speculative. What matters is
 * that it can always be moved off whatever it landed on.
 */
function ChannelsNode({ x, y, channels, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, colorContext, onDragStart, search = '' , selected, onSelect }: {
  x: number
  y: number
  channels: InputChannel[]
  cables: InputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  colorContext: ColorContext
  onDragStart?: (e: ReactPointerEvent) => void
  search?: string
  selected?: boolean
  onSelect?: () => void
}) {
  const ports = channels.flatMap((channel) => channelPorts(channel))
  const dimmedIds = new Set(
    channels.filter((channel) => !matchesSearch(search, channel.channel_number, channel.channel_name, channel.notes)).map((channel) => channel.id),
  )
  return (
    <NodeShell x={x} y={y} title="No desk" badge={channels.length > 0 ? String(channels.length) : undefined} onDragStart={onDragStart} selected={selected} onSelect={onSelect}>
      {ports.map((port) => (
        <PortRow key={portKey(port.kind, port.id, port.port, 'in')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} align="left" colorContext={colorContext} dimmed={dimmedIds.has(port.id)} />
      ))}
      {ports.length === 0 && <p className="px-1.5 text-[11px] text-zinc-600">No channels without a desk</p>}
    </NodeShell>
  )
}

/**
 * The desk on the input graph (Slice 23): its channel strips. Where the Channels
 * rail used to be an anonymous list, it now belongs to a named desk with a stated
 * capacity — which is what makes "15 / 96 in" sayable at all.
 *
 * Its local jacks used to be drawn here too, as a second block of input-side
 * ports after a divider. That made them a dead end — a cable could land on one
 * and never leave it — so since Slice 24 they are their own node
 * (`LocalJackNode`).
 */
function ConsoleNode({ x, y, desk, channels, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, colorContext, onDragStart, search = '' , selected, onSelect }: {
  x: number
  y: number
  desk: Console
  channels: InputChannel[]
  cables: InputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  colorContext: ColorContext
  onDragStart?: (e: ReactPointerEvent) => void
  search?: string
  selected?: boolean
  onSelect?: () => void
}) {
  const ports = channels.flatMap((channel) => channelPorts(channel))
  const dimmedIds = new Set(
    channels.filter((channel) => !matchesSearch(search, channel.channel_number, channel.channel_name, channel.notes)).map((channel) => channel.id),
  )
  const over = desk.input_count > 0 && channels.length > desk.input_count

  return (
    <NodeShell
      x={x}
      y={y}
      title={desk.name || 'Console'}
      badge="DESK"
      onDragStart={onDragStart}
      selected={selected}
      onSelect={onSelect}
      footerAlarm={over}
      footer={
        <>
          {channels.length}
          {desk.input_count > 0 ? ` / ${desk.input_count}` : ''} in
          {desk.local_input_count > 0 ? ` · local ${desk.local_input_count}` : ''}
        </>
      }
    >
      {ports.map((port) => (
        <PortRow key={portKey(port.kind, port.id, port.port, 'in')} label={port.label} port={port} cables={cables} pendingPort={pendingPort} onPortClick={onPortClick} onPortPointerDown={onPortPointerDown} registerPort={registerPort} align="left" colorContext={colorContext} dimmed={dimmedIds.has(port.id)} />
      ))}
      {ports.length === 0 && <p className="px-1.5 text-[11px] text-zinc-600">No channels on this desk yet</p>}
    </NodeShell>
  )
}

/**
 * A desk's own input jacks, as their own node (Slice 24 FR-008/FR-009).
 *
 * Deliberately the same two-column shape as `StageboxNode` below: a cable lands
 * on a jack on the left, and the desk's own routing carries that same jack on to
 * a channel from the right. Drawn identically because it *is* the same thing to
 * the graph — which is what lets a planner pick either without learning a second
 * idiom (FR-009).
 *
 * It lives in the processing lane rather than beside the desk's strips because
 * the two ports of one pass-through must be on opposite edges of the node for
 * their cable to be drawable at all: inside one box the run would have to loop
 * right, back across the box, and in from the left (research.md R6).
 */
function LocalJackNode({ x, y, desk, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, colorContext, onDragStart, dimmed , selected, onSelect }: {
  x: number
  y: number
  desk: Console
  cables: InputCable[]
  pendingPort: PortRef | null
  onPortClick: (port: PortRef) => void
  onPortPointerDown: (port: PortRef, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
  colorContext: ColorContext
  onDragStart?: (e: ReactPointerEvent) => void
  dimmed?: boolean
  selected?: boolean
  onSelect?: () => void
}) {
  const { inputs, outputs } = consoleLocalPorts(desk)
  const wiring = wiringFor(cables, pendingPort, colorContext, onPortClick, onPortPointerDown, registerPort)
  return (
    <NodeShell x={x} y={y} title={desk.name || 'Console'} badge="LOCAL" onDragStart={onDragStart} dimmed={dimmed} selected={selected} onSelect={onSelect}>
      {inputs.map((inPort, index) => (
        <SplitPortRow key={inPort.port} inPort={inPort} outPort={outputs[index]} label={String(inPort.port + 1)} wiring={wiring} />
      ))}
    </NodeShell>
  )
}

function StageboxNode({ x, y, stagebox, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, onDragStart, colorContext, dimmed , selected, onSelect }: {
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
  dimmed?: boolean
  selected?: boolean
  onSelect?: () => void
}) {
  const { inputs, outputs } = stageboxPorts(stagebox)
  const wiring = wiringFor(cables, pendingPort, colorContext, onPortClick, onPortPointerDown, registerPort)
  return (
    <NodeShell x={x} y={y} title={stagebox.name} badge="SB" onDragStart={onDragStart} dimmed={dimmed} selected={selected} onSelect={onSelect}>
      {inputs.map((inPort, index) => (
        <SplitPortRow key={inPort.port} inPort={inPort} outPort={outputs[index]} label={String(inPort.port + 1)} wiring={wiring} />
      ))}
    </NodeShell>
  )
}

function StageMultiNode({ x, y, stageMulti, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, onDragStart, colorContext, dimmed , selected, onSelect }: {
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
  dimmed?: boolean
  selected?: boolean
  onSelect?: () => void
}) {
  const { inputs, outputs } = stageMultiPorts(stageMulti)
  const wiring = wiringFor(cables, pendingPort, colorContext, onPortClick, onPortPointerDown, registerPort)
  return (
    <NodeShell x={x} y={y} title={stageMulti.name} badge="Multi" onDragStart={onDragStart} dimmed={dimmed} selected={selected} onSelect={onSelect}>
      {inputs.map((inPort, index) => (
        <SplitPortRow key={inPort.port} inPort={inPort} outPort={outputs[index]} label={String(inPort.port + 1)} wiring={wiring} />
      ))}
    </NodeShell>
  )
}

function DeviceNode({ x, y, device, cables, pendingPort, onPortClick, onPortPointerDown, registerPort, onDragStart, colorContext, dimmed , selected, onSelect }: {
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
  dimmed?: boolean
  selected?: boolean
  onSelect?: () => void
}) {
  const { inputs, outputs } = devicePorts(device)
  return (
    <NodeShell x={x} y={y} title={device.name} onDragStart={onDragStart} dimmed={dimmed} selected={selected} onSelect={onSelect}>
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
