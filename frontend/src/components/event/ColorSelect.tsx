import { useReferenceData } from '../../hooks/useReferenceData'
import { Select } from '../ui/Select'

/**
 * Palette picker for the console channel-strip color: a swatch plus a select
 * over the channel_colors vocabulary. A stored value no longer in the
 * palette stays offered on this row (the options() legacy merge), so
 * removing a palette entry never blanks existing rows.
 */
export function ColorSelect({
  eventId,
  value,
  onChange,
  disabled,
}: {
  eventId: number
  value?: string
  onChange: (color: string) => void
  disabled?: boolean
}) {
  const { options } = useReferenceData(eventId)

  return (
    <div className="flex min-w-28 items-center gap-1.5">
      <span
        aria-hidden
        className="h-4 w-4 shrink-0 rounded border border-zinc-600"
        style={value ? { backgroundColor: value } : undefined}
      />
      <Select value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">—</option>
        {options('channel_colors', value).map((color) => (
          <option key={color.value} value={color.value}>{color.label}</option>
        ))}
      </Select>
    </div>
  )
}
