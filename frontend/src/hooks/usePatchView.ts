import { useCallback, useState } from 'react'

export type PatchView = 'sheet' | 'flow'
export type PatchTab = 'inputs' | 'outputs'

const storageKey = (eventId: number, tab: PatchTab | 'routing') => `patchplanner.patchView.${eventId}.${tab}`

function read(eventId: number, tab: PatchTab | 'routing'): PatchView {
  try {
    return window.localStorage.getItem(storageKey(eventId, tab)) === 'flow' ? 'flow' : 'sheet'
  } catch {
    // Private-mode Safari throws on access; the default is not worth a crash.
    return 'sheet'
  }
}

/**
 * Which view an audio tab is showing, remembered per event and per tab
 * (Slice 23 FR-006). Deliberately localStorage rather than event_settings:
 * it's one user's viewing preference with no meaning to anyone else sharing
 * the event, so it needs neither a migration nor a round trip
 * (research.md R12). The search term and the selection are *not* persisted —
 * a stale filter on return would read as data loss.
 */
export function usePatchView(eventId: number, tab: PatchTab | 'routing'): [PatchView, (view: PatchView) => void] {
  const [view, setViewState] = useState<PatchView>(() => read(eventId, tab))

  const setView = useCallback(
    (next: PatchView) => {
      setViewState(next)
      try {
        window.localStorage.setItem(storageKey(eventId, tab), next)
      } catch {
        // Preference simply doesn't persist; the session still works.
      }
    },
    [eventId, tab],
  )

  return [view, setView]
}
