import { useCallback, useState } from 'react'
import type { Console } from '../types'

/** A console id, or `'none'` for the rows that are on no desk. */
export type DeskSelection = number | 'none'

const storageKey = (eventId: number) => `patchplanner.desk.${eventId}`

function read(eventId: number): DeskSelection | undefined {
  try {
    const stored = window.localStorage.getItem(storageKey(eventId))
    if (stored === 'none') return 'none'
    const id = Number(stored)
    return stored && Number.isFinite(id) ? id : undefined
  } catch {
    return undefined
  }
}

/**
 * Resolves a stored choice against what exists now: a deleted desk falls back
 * to the first in Rig order, and so does `'none'` once nothing is on no desk.
 * With no desk at all the only list there is is the deskless one.
 */
export function resolveDeskSelection(stored: DeskSelection | undefined, consoles: Console[], hasDeskless: boolean): DeskSelection {
  if (consoles.length === 0) return 'none'
  if (stored === 'none' && hasDeskless) return 'none'
  if (typeof stored === 'number' && consoles.some((desk) => desk.id === stored)) return stored
  return consoles[0].id
}

/**
 * Which desk the Inputs and Outputs sheets are showing (Slice 47, B6). One key
 * per event, so the two tabs share it; per viewer and per device, never on the
 * event, like the remembered view.
 */
export function useSelectedDesk(eventId: number, consoles: Console[], hasDeskless: boolean): [DeskSelection, (next: DeskSelection) => void] {
  const [stored, setStored] = useState<DeskSelection | undefined>(() => read(eventId))
  const select = useCallback(
    (next: DeskSelection) => {
      setStored(next)
      try {
        window.localStorage.setItem(storageKey(eventId), String(next))
      } catch {
        // The choice simply doesn't persist; the session still works.
      }
    },
    [eventId],
  )
  return [resolveDeskSelection(stored, consoles, hasDeskless), select]
}
