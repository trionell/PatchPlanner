import type { PointerEvent as ReactPointerEvent } from 'react'
import { PortDot, type GraphPort } from './PortDot'
import { PORT_ROW, PORT_ROW_TEXT } from './tokens'

/** Everything a row needs to draw a port, supplied by whichever canvas owns it. */
export interface PortWiring {
  isConnected: (port: GraphPort) => boolean
  isPending: (port: GraphPort) => boolean
  colorOf: (port: GraphPort) => string | undefined
  keyOf: (port: GraphPort) => string
  onPortClick: (port: GraphPort) => void
  onPortPointerDown: (port: GraphPort, e: ReactPointerEvent) => void
  registerPort: (key: string) => (el: HTMLElement | null) => void
}

function Dot({ port, wiring }: { port: GraphPort; wiring: PortWiring }) {
  const key = wiring.keyOf(port)
  return (
    <PortDot
      port={port}
      dataKey={key}
      connected={wiring.isConnected(port)}
      selected={wiring.isPending(port)}
      color={wiring.colorOf(port)}
      onClick={() => wiring.onPortClick(port)}
      onPointerDown={(event) => wiring.onPortPointerDown(port, event)}
      registerRef={wiring.registerPort(key)}
    />
  )
}

/**
 * One port on one side of a box — a mixer output, a channel strip, a device jack.
 *
 * Two gestures, one row (Slice 26 FR-009). The **dot** starts, completes or inspects
 * a cable, as it always has. The **label**, when the caller gives an `onSelect`,
 * opens the inspector on whatever the row stands for — which is the split the sources
 * rail already field-tested, and the only one that needs neither a modifier key nor a
 * second control. The dot's hit area is its own padded button and its pointer-down
 * stops propagation, so the two targets cannot be hit at once.
 *
 * Both new props are optional and unused by every existing call site, so a row
 * without them renders exactly as before.
 */
export function PortRow({
  port,
  label,
  wiring,
  align,
  dimmed,
  selected,
  onSelect,
}: {
  port: GraphPort
  label?: string
  wiring: PortWiring
  align: 'left' | 'right'
  dimmed?: boolean
  /** This row's subject is what the inspector is showing. */
  selected?: boolean
  /** Given: the label becomes clickable. Absent: the label is inert text. */
  onSelect?: () => void
}) {
  const color = wiring.colorOf(port)
  const labelClass = `truncate ${selected ? 'font-semibold text-zinc-50' : ''}`
  return (
    <div
      className={`${PORT_ROW} transition-opacity ${align === 'right' ? 'flex-row-reverse text-right' : ''} ${color ? '' : PORT_ROW_TEXT} ${
        dimmed ? 'opacity-30' : ''
      } ${selected ? 'bg-amber-500/10' : ''}`}
      style={color ? { color } : undefined}
    >
      <Dot port={port} wiring={wiring} />
      {onSelect ? (
        // `min-w-0 flex-1` so the label still truncates and the button spans the row's
        // free width — the whole label area is the target, not just the glyphs.
        <button type="button" onClick={onSelect} className={`min-w-0 flex-1 cursor-pointer ${labelClass} ${align === 'right' ? 'text-right' : 'text-left'}`}>
          {label ?? port.label}
        </button>
      ) : (
        <span className={labelClass}>{label ?? port.label}</span>
      )}
    </div>
  )
}

/**
 * One row per jack of a pass-through: the incoming port on the left edge, the
 * outgoing port on the right (Slice 25 FR-028).
 *
 * This is the structural half of the restyle. A stagebox, a stage multi and a desk's
 * local panel are all pass-throughs, and index N in *is the same jack* as index N
 * out. Both canvases used to draw them as two independent columns of rows, so a pair
 * only lined up when the two columns happened to be the same length — true by luck,
 * not by construction. One row per index makes the pairing something you can read.
 */
export function SplitPortRow({
  inPort,
  outPort,
  label,
  wiring,
  dimmed,
}: {
  inPort: GraphPort
  outPort: GraphPort
  /** Shown once, between the two dots — the jack's number, not each side's. */
  label: string
  wiring: PortWiring
  dimmed?: boolean
}) {
  // The two sides of one jack carry the same run, so either side's colour is the
  // jack's colour; the in side is the one that is always present.
  const color = wiring.colorOf(inPort) ?? wiring.colorOf(outPort)
  return (
    <div
      className={`${PORT_ROW} justify-between transition-opacity ${color ? '' : PORT_ROW_TEXT} ${dimmed ? 'opacity-30' : ''}`}
      style={color ? { color } : undefined}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <Dot port={inPort} wiring={wiring} />
        <span className="truncate">{label}</span>
      </span>
      <Dot port={outPort} wiring={wiring} />
    </div>
  )
}
