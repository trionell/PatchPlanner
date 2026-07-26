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
 * One patchable port, at the mockup's size (Slice 25 FR-030).
 *
 * The paint is 7px; the hit area is deliberately larger. The mockup is a picture
 * that nobody had to click, and a 7px target fails the moment a real hand with a
 * real trackpad tries to start a cable — so the button carries padding and a
 * negative margin, which keeps the dot's *visual* size and rhythm while giving the
 * pointer something to land on.
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
      ref={registerRef}
      data-port-key={dataKey}
      onClick={onClick}
      onPointerDown={onPointerDown}
      title={port.label}
      style={coloured ? { borderColor: color, backgroundColor: selected ? color : `${color}b3` } : undefined}
      className={`-m-1 box-content h-[7px] w-[7px] shrink-0 cursor-crosshair rounded-full border bg-clip-padding p-1 transition-colors ${
        coloured
          ? ''
          : selected
            ? 'border-amber-400 bg-amber-400'
            : connected
              ? 'border-amber-500 bg-amber-500/75 hover:bg-amber-400'
              : 'border-zinc-500 bg-zinc-800 hover:border-amber-400 hover:bg-amber-400/30'
      }`}
    />
  )
}
