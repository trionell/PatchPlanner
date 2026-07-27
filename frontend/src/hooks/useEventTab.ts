import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Which event tab is open, and how a tab opens another one (Slice 28 FR-084).
 *
 * The selection lives in `?tab=` rather than in `EventDetail`'s state, for the
 * reason the phone's `?section=` already does: a hand-off is then a *link*. It
 * survives a reload, it can be pasted to a colleague, and the back button walks
 * back to where you came from.
 *
 * Wave 3 built `RowEditor`'s `handoff` slot and `LightingSheet`'s `onOpenPlot`
 * prop and could never wire them, because the desktop `Tabs` was uncontrolled
 * and no child could reach the selection. This is the missing half.
 *
 * A hand-off carries the **tab and nothing else** (research.md R3). Selecting the
 * row once you are there lives inside `AudioPatchShell`, which Slice 28 promised
 * not to touch.
 */

export const EVENT_TABS = [
  'overview',
  'audio-inputs',
  'audio-outputs',
  'lighting-rig',
  'stage-plots',
  'signal-flow',
  'equipment',
  'rentals',
  'settings',
] as const

export type EventTab = (typeof EVENT_TABS)[number]

export const DEFAULT_EVENT_TAB: EventTab = 'overview'

export function useEventTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const param = searchParams.get('tab')
  const tab: EventTab = (EVENT_TABS as readonly string[]).includes(param ?? '')
    ? (param as EventTab)
    : DEFAULT_EVENT_TAB

  const openTab = useCallback(
    (next: string) => {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev)
        params.set('tab', next)
        return params
      })
    },
    [setSearchParams],
  )

  return { tab, openTab }
}
