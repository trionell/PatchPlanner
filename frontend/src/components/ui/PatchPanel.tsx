import type { ReactNode } from 'react'

interface PatchPanelProps {
  /** The toolbar: title, view toggle, search, drawers, print, add. */
  bar: ReactNode
  /**
   * The sheet or the canvas. Gets no border, padding or radius of its own — the
   * frame is here, once. The sheet closes itself with its own status strip; the
   * canvas has none, as the mockup has none.
   */
  children: ReactNode
}

/**
 * One frame for the audio patch surface: a bar on top, then the content
 * (Slice 25 FR-010).
 *
 * It used to be three separate rounded cards with gaps — the toolbar floating with
 * an `mb-4`, the table in its own `rounded-xl border`, the status strip in its own
 * `mt-3 rounded-lg`. The mockup is one panel, and the difference is not only
 * tidiness: with three cards the view toggle appears to rebuild the page, and with
 * one it changes the content of something that stays put.
 */
export function PatchPanel({ bar, children }: PatchPanelProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950/40">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2.5">{bar}</div>
      {children}
    </div>
  )
}
