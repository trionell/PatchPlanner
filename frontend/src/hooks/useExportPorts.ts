import { useCallback, useState } from 'react'
import type { ExportPorts } from '../api/audio'

const storageKey = (eventId: number, deskId: number, engine: string) => `patchplanner.exportPorts.${eventId}.${deskId}.${engine}`

function read(key: string): ExportPorts {
  try {
    const stored = window.localStorage.getItem(key)
    return stored ? (JSON.parse(stored) as ExportPorts) : {}
  } catch {
    return {}
  }
}

/**
 * The export dialog's port map (Slice 49), remembered per viewer per event × desk ×
 * engine on the device — where the boxes sit on the desk is the planner's knowledge
 * of the rig on the night, not part of the plan.
 */
export function useExportPorts(eventId: number, deskId: number, engine: string): [ExportPorts, (next: ExportPorts) => void] {
  const key = storageKey(eventId, deskId, engine)
  const [state, setState] = useState<{ key: string; ports: ExportPorts }>(() => ({ key, ports: read(key) }))
  // A different desk or engine reads its own map.
  const ports = state.key === key ? state.ports : read(key)
  const set = useCallback(
    (next: ExportPorts) => {
      setState({ key, ports: next })
      try {
        window.localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // The map simply isn't remembered.
      }
    },
    [key],
  )
  return [ports, set]
}
