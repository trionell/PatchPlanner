import { busTint } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Select } from '../ui/Select'

interface BusOption {
  id: number
  name: string
  color?: string
}

/**
 * Selection-only membership cell for groups and DCAs: assigned buses render
 * as removable badges (tinted by the bus color), the rest are offered in a
 * compact "+ add" select. Every add/remove calls onChange with the full
 * replacement set.
 */
export function BusMultiSelect({
  selected,
  options,
  onChange,
  disabled,
}: {
  selected: number[]
  options: BusOption[]
  onChange: (ids: number[]) => void
  disabled?: boolean
}) {
  const byId = new Map(options.map((option) => [option.id, option]))
  const remaining = options.filter((option) => !selected.includes(option.id))

  return (
    <div className="min-w-36 space-y-1">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((id) => {
            const bus = byId.get(id)
            return (
              <Badge key={id} style={busTint(bus?.color)}>
                {bus?.name ?? `#${id}`}
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`Remove ${bus?.name ?? id}`}
                    onClick={() => onChange(selected.filter((selectedID) => selectedID !== id))}
                    className="ml-1 leading-none opacity-60 hover:opacity-100"
                  >
                    ×
                  </button>
                )}
              </Badge>
            )
          })}
        </div>
      )}
      {!disabled && remaining.length > 0 && (
        <Select
          value=""
          onChange={(e) => {
            const id = Number(e.target.value)
            if (id) onChange([...selected, id])
          }}
        >
          <option value="">+ add…</option>
          {remaining.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </Select>
      )}
    </div>
  )
}
