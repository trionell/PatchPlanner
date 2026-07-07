import { useState, type Dispatch, type SetStateAction } from 'react'

/**
 * A locally editable draft of server state (inline-edit rows over TanStack
 * Query data) that re-syncs whenever the server value changes.
 *
 * Uses the render-time "adjust state when props change" pattern from the
 * React docs instead of a useEffect, so the sync happens before paint and
 * without cascading renders.
 */
export function useDraftState<S, D>(source: S | undefined, toDraft: (source: S) => D, initial: D): [D, Dispatch<SetStateAction<D>>] {
  const [draft, setDraft] = useState<D>(initial)
  const [synced, setSynced] = useState<S | undefined>(undefined)
  if (source !== undefined && source !== synced) {
    setSynced(source)
    setDraft(toDraft(source))
  }
  return [draft, setDraft]
}
