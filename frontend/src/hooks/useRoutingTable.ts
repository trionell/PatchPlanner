import { useCallback, useState } from 'react'
import { ROUTING_TABLES, type RoutingTable } from '../lib/deskRouting'

const storageKey = (eventId: number) => `patchplanner.routingTable.${eventId}`

function read(eventId: number): RoutingTable {
  try {
    const stored = window.localStorage.getItem(storageKey(eventId))
    return (ROUTING_TABLES as string[]).includes(stored ?? '') ? (stored as RoutingTable) : 'mains'
  } catch {
    return 'mains'
  }
}

/**
 * Which Desk Routing table is showing (Slice 48, C2): per viewer and per event on
 * the device, like the remembered view — a viewing preference, never the plan.
 */
export function useRoutingTable(eventId: number): [RoutingTable, (table: RoutingTable) => void] {
  const [table, setTable] = useState<RoutingTable>(() => read(eventId))
  const select = useCallback(
    (next: RoutingTable) => {
      setTable(next)
      try {
        window.localStorage.setItem(storageKey(eventId), next)
      } catch {
        // The choice simply doesn't persist.
      }
    },
    [eventId],
  )
  return [table, select]
}
