import type { PointerEvent as ReactPointerEvent } from 'react'

/**
 * A port, as either graph sees it. Structural rather than either canvas's own
 * `PortRef` union, because the two unions differ (`mixer` on one side, `source` and
 * `channel` on the other) and this is the seam that lets both graphs share the
 * components that draw them (Slice 25 FR-036).
 */
export interface GraphPort {
  kind: string
  id: number
  port: number
  direction: 'in' | 'out'
  label: string
}

/**
 * One patchable port (Slice 25 FR-030).
 *
 * Two boxes, deliberately: an outer button that is the *hit area* and paints
 * nothing, and an inner span that is the 7px dot. A 7px target fails the first time
 * a real hand with a real trackpad tries to start a cable, so the button carries
 * padding and a negative margin — but the padding must stay invisible, and the first
 * attempt at this put the border and background on a padded single element, which
 * paints the padding box and renders a 15px dot (the reported "too big").
 *
 * The ref goes on the **inner** span, because the canvas measures these elements to
 * place its cable endpoints: measuring the hit area would put every cable's end a
 * few pixels off its own dot.
 *
 * Three states: hollow when nothing is patched, amber when patched, and the run's
 * own colour when the run reaches a channel (or comes from a coloured output).
 */
export function PortDot({
  port,
  connected,
  selected,
  color,
  dataKey,
  onClick,
  onPointerDown,
  registerRef,
}: {
  port: GraphPort
  connected: boolean
  /** Mid-gesture: this is the port a cable is being drawn from. */
  selected: boolean
  color?: string
  /** The canvas's own port key, which its cable geometry looks the element up by. */
  dataKey: string
  onClick: () => void
  onPointerDown: (e: ReactPointerEvent) => void
  registerRef: (el: HTMLElement | null) => void
}) {
  const coloured = color && (connected || selected)
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      title={port.label}
      className="-m-1 flex shrink-0 cursor-crosshair items-center justify-center bg-transparent p-1"
    >
      <span
        ref={registerRef}
        data-port-key={dataKey}
        style={coloured ? { borderColor: color, backgroundColor: selected ? color : `${color}b3` } : undefined}
        className={`block h-[7px] w-[7px] rounded-full border transition-colors ${
          coloured
            ? ''
            : selected
              ? 'border-amber-400 bg-amber-400'
              : connected
                ? 'border-amber-500 bg-amber-500/75'
                : 'border-zinc-500 bg-zinc-800'
        }`}
      />
    </button>
  )
}
