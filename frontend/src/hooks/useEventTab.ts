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

/**
 * The selection, written into a URL. Pure, so the invariant above is testable without a
 * browser navigation — which is the one thing this project's test method cannot perform.
 */
export function withSelection(prev: URLSearchParams, next: string): URLSearchParams {
  const params = new URLSearchParams(prev)
  params.set('tab', next)
  params.set('section', next)
  return params
}

export function useEventTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const param = searchParams.get('tab')
  const tab: EventTab = (EVENT_TABS as readonly string[]).includes(param ?? '')
    ? (param as EventTab)
    : DEFAULT_EVENT_TAB

  /*
    Writes **both** params, and that is the fix for a hand-off that did nothing on a
    phone (Slice 35 field test).

    The desktop selection is `?tab=`; the phone's is `?section=`, and it predates it.
    They carry the same vocabulary — `EVENT_TABS` and `MOBILE_SECTIONS` are the same nine
    strings — but nothing kept them in step, so every hand-off built since Wave 3 changed
    the URL and left the phone on the section it was already showing: *See on rental
    order*, Overview's readiness rows, `onOpenPlot`, `onOpenEquipment`. The URL moved and
    the screen did not, which is the worst kind of broken link because it looks like
    nothing happened.

    Setting both is what makes a hand-off a *link* at either width — the property this
    hook exists for — and it keeps the two in step when a URL is pasted across devices.
  */
  const openTab = useCallback(
    (next: string) => {
      setSearchParams((prev) => withSelection(prev, next))
    },
    [setSearchParams],
  )

  return { tab, openTab }
}
