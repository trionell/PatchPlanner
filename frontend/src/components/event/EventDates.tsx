import { dateOrderError, onSiteDays, resolveDates, showDays } from '../../lib/eventTimeline'
import { FieldLabel } from '../ui/Label'
import { Input } from '../ui/Input'

export interface EventDateValues {
  loadInDate: string
  startDate: string
  endDate: string
  loadOutDate: string
}

/**
 * An event's four dates, drawn as one object (Slice 30 US1).
 *
 * There is deliberately **no "is this multi-day?" toggle**. A field you leave
 * empty is the same statement with one fewer control, and it cannot get out of
 * step with the value it is supposed to describe. Each placeholder names its own
 * default, so the form never has an empty box whose meaning has to be guessed.
 *
 * The two brackets underneath are the derivation, drawn. They are not
 * decoration: *days on site* and *show days* are the numbers everything
 * downstream reads, and the fastest way to check you typed four dates correctly
 * is to watch them bracket the fields you typed. A one-day event draws one
 * bracket, one column wide.
 *
 * Ordering is validated here for immediate feedback and again on the server,
 * because the client's validation is a convenience and not a guarantee.
 */
export function EventDates({
  values,
  onChange,
  disabled,
}: {
  values: EventDateValues
  onChange: (next: EventDateValues) => void
  disabled?: boolean
}) {
  const set = (key: keyof EventDateValues) => (event: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...values, [key]: event.target.value })

  const dates = resolveDates(values)
  const error = dateOrderError(values)

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Load-in" placeholder="same as first day" value={values.loadInDate} onChange={set('loadInDate')} disabled={disabled} />
        <Field label="First day" value={values.startDate} onChange={set('startDate')} disabled={disabled} />
        <Field label="Last day" placeholder="same day" value={values.endDate} onChange={set('endDate')} disabled={disabled} />
        <Field label="Load-out" placeholder="same as last day" value={values.loadOutDate} onChange={set('loadOutDate')} disabled={disabled} />
      </div>

      {dates && !error && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {/* On-site spans all four columns; show days span the middle two. A
              one-day event collapses both to the single "1 day" bracket. */}
          {onSiteDays(dates) > showDays(dates) && (
            <Bracket className="col-span-2 md:col-span-4">{plural(onSiteDays(dates))} on site</Bracket>
          )}
          <Bracket className="col-span-2 md:col-span-2 md:col-start-2">
            {onSiteDays(dates) > showDays(dates) ? `${plural(showDays(dates))} of show` : plural(showDays(dates))}
          </Bracket>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

function plural(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

function Field({
  label,
  value,
  placeholder,
  onChange,
  disabled,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  disabled?: boolean
}) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <Input type="date" value={value} onChange={onChange} disabled={disabled} />
      {placeholder && !value && <p className="mt-1 truncate text-[11px] text-zinc-600">{placeholder}</p>}
    </div>
  )
}

/** A hairline with the derived duration sitting on it. */
function Bracket({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative h-4 ${className ?? ''}`}>
      <span className="absolute inset-x-1 top-2 border-t border-zinc-700" />
      <span className="absolute inset-x-1 top-1 h-2 border-x border-zinc-700" />
      <span className="relative mx-auto block w-fit bg-zinc-900 px-2 font-mono text-[10px] tracking-[0.06em] text-zinc-400">
        {children}
      </span>
    </div>
  )
}
