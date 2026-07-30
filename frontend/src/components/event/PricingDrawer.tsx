import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { putEventPricing } from '../../api/rentals'
import {
  billedSpanWords,
  chargedDaysWords,
  CHARGED_DAYS_LABELS,
  factorSourceWords,
  formatPercent,
  ledgerRows,
} from '../../lib/rentalPricing'
import type { Event, RentalPricing } from '../../types'
import { Button } from '../ui/Button'
import { Drawer } from '../ui/Drawer'
import { DrawerSection, GearCard, GearSpecs, GearTop, Spec } from '../ui/GearList'
import { Input } from '../ui/Input'
import { MicroLabel } from '../ui/Label'
import { Select } from '../ui/Select'

/**
 * What this hire costs, and why (Slice 31).
 *
 * Four cards that can be acted on and one that cannot. The ledger is last
 * because it is the consequence of the four above it, and it states every
 * *operation* rather than only its result — so a number that looks wrong can be
 * traced without leaving the drawer.
 *
 * **The three departures are absences.** An empty override field means *follow
 * the catalog*, which is why each field shows the inherited value as its
 * placeholder rather than as its value: a number you can see but did not type is
 * one the catalog can still correct.
 *
 * A viewer is passed no `onSave` and gets no field, only the numbers (P7). On a
 * phone this is a `ui/Sheet` with no work here at all — `ui/Drawer` branches on
 * `useIsMobile` itself, which is what gave all six drawers a phone form at once.
 */

interface PricingDrawerProps {
  open: boolean
  onClose: () => void
  eventId: number
  event?: Event
  pricing?: RentalPricing
  /** Omitted entirely for a role that cannot price this event (P7). */
  editable?: boolean
}

interface PricingDraft {
  chargedDays: '' | 'onsite' | 'show'
  rentFactorOverride: string
  vatPercent: string
  discountPercent: string
}

export function PricingDrawer({ open, onClose, eventId, event, pricing, editable = false }: PricingDrawerProps) {
  // Unmounted while closed, so the draft is built on open and destroyed on
  // close — the same reason EventDetailsDrawer splits into two components.
  if (!open || !event || !pricing) return null
  return (
    <PricingForm
      eventId={eventId}
      event={event}
      pricing={pricing}
      editable={editable}
      onClose={onClose}
    />
  )
}

function PricingForm({
  eventId,
  event,
  pricing,
  editable,
  onClose,
}: {
  eventId: number
  event: Event
  pricing: RentalPricing
  editable: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<PricingDraft>({
    chargedDays: event.chargedDays ?? '',
    rentFactorOverride: event.rentFactorOverride != null ? String(event.rentFactorOverride) : '',
    vatPercent: event.vatPercent != null ? String(event.vatPercent) : '',
    discountPercent: String(event.discountPercent ?? 0),
  })
  const [error, setError] = useState('')

  const save = useMutation({
    mutationFn: () =>
      putEventPricing(eventId, {
        charged_days: draft.chargedDays === '' ? null : draft.chargedDays,
        rent_factor_override: numberOrNull(draft.rentFactorOverride),
        vat_percent: numberOrNull(draft.vatPercent),
        discount_percent: Number(draft.discountPercent) || 0,
      }),
    onSuccess: async () => {
      // Both, and in this order: the order's price and the event's own record of
      // what it departed from are two reads of one write.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] }),
        queryClient.invalidateQueries({ queryKey: ['event', eventId] }),
        queryClient.invalidateQueries({ queryKey: ['events'] }),
      ])
      onClose()
    },
    onError: (failure: Error) => setError(failure.message),
  })

  const update = (patch: Partial<PricingDraft>) => setDraft((previous) => ({ ...previous, ...patch }))

  return (
    <Drawer
      open
      onClose={onClose}
      title="Pricing"
      subtitle="What this hire costs, and why"
      width="narrow"
      /*
        `info`, not `footer`. The footer states what a drawer's contents *mean*,
        in a line — "every row here is one line on the rental order". This is an
        explanation of what the drawer does, read once and in the way ever after,
        which is exactly what `ui/InfoNote` exists for: one `i` closed, the
        sentence open, the choice remembered. On a phone a footer this long is a
        fifth of the sheet, permanently (components.md §4).
      */
      info={
        <>
          Pricing changes no line on the order. Every price on the sheet is the catalog's{' '}
          <b className="font-medium text-zinc-300">day rate</b>, which is what the supplier's own list says.
        </>
      }
    >
      <DrawerSection label="Billed days">
        <GearCard>
          <GearTop
            name={`${pricing.billed_days} ${pricing.billed_days === 1 ? 'day' : 'days'}`}
            actions={<span className="font-mono text-[10px] text-zinc-500">{billedSpanWords(pricing)}</span>}
          />
          {editable ? (
            <Select
              size="sm"
              value={draft.chargedDays}
              onChange={(e) => update({ chargedDays: e.target.value as PricingDraft['chargedDays'] })}
            >
              {/* An empty value is how "follow the catalog" is sent. It names
                  the inherited rule so the choice is between two known things. */}
              <option value="">Use the catalog's rule — {CHARGED_DAYS_LABELS[pricing.charged_days].toLowerCase()}</option>
              <option value="onsite">{CHARGED_DAYS_LABELS.onsite}</option>
              <option value="show">{CHARGED_DAYS_LABELS.show}</option>
            </Select>
          ) : (
            <GearSpecs>
              <Spec label="rule" value={chargedDaysWords(pricing)} />
            </GearSpecs>
          )}
          <GearSpecs>
            {pricing.first_day && <Spec label="from" value={pricing.first_day} />}
            {pricing.last_day && <Spec label="to" value={pricing.last_day} />}
          </GearSpecs>
        </GearCard>
      </DrawerSection>

      <DrawerSection label="Rent factor">
        <GearCard>
          <GearTop
            name={`×${pricing.rent_factor.toFixed(2)}`}
            actions={<span className="font-mono text-[10px] text-zinc-500">{factorSourceWords(pricing)}</span>}
          />
          {editable && (
            <NumberField
              label="Override"
              hint="Leave empty to follow the catalog's table."
              step="0.05"
              /* The looked-up value as a placeholder, not as a value: a number
                 you can see but did not type is one the catalog's table can
                 still correct. */
              placeholder={pricing.rent_factor.toFixed(2)}
              value={draft.rentFactorOverride}
              onChange={(value) => update({ rentFactorOverride: value })}
            />
          )}
        </GearCard>
      </DrawerSection>

      <DrawerSection label="Discount">
        <GearCard>
          {editable ? (
            <NumberField
              label="Percent"
              hint="% off the equipment subtotal."
              max={100}
              value={draft.discountPercent}
              onChange={(value) => update({ discountPercent: value })}
            />
          ) : (
            <GearSpecs>
              <Spec label="discount" value={`${formatPercent(pricing.discount_percent)}%`} />
            </GearSpecs>
          )}
        </GearCard>
      </DrawerSection>

      <DrawerSection label="VAT">
        <GearCard>
          <GearTop
            name={`${formatPercent(pricing.vat_percent)}%`}
            actions={
              <span className="font-mono text-[10px] text-zinc-500">
                {pricing.vat_source === 'event' ? "this event's own" : 'from the catalog'}
              </span>
            }
          />
          {editable && (
            <NumberField
              label="Override"
              hint="Leave empty to follow the catalog."
              placeholder={formatPercent(pricing.vat_percent)}
              value={draft.vatPercent}
              onChange={(value) => update({ vatPercent: value })}
            />
          )}
        </GearCard>
      </DrawerSection>

      <DrawerSection label="This order">
        <GearCard>
          <Ledger pricing={pricing} />
        </GearCard>
      </DrawerSection>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {editable && (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="xs" onClick={onClose}>
            Cancel
          </Button>
          <Button size="xs" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
    </Drawer>
  )
}

/**
 * The ledger — subtotal, the operations on it, and both totals.
 *
 * **Not a new component.** It is `GearSpecs`' mono at `GearCard`'s density, laid
 * out as rows because a derivation is read down rather than across. Drawn
 * identically on the desktop and the phone, because it already fits 375 px.
 */
export function Ledger({ pricing }: { pricing: RentalPricing }) {
  return (
    <div className="flex flex-col font-mono text-[11px] tabular-nums">
      {ledgerRows(pricing).map((row) => (
        <div
          key={row.key}
          className={
            row.emphasis
              ? 'mt-1 flex items-baseline gap-3 border-t border-zinc-800 pt-1.5 text-[13px] text-zinc-100'
              : 'flex items-baseline gap-3 py-0.5 text-zinc-500'
          }
        >
          <span>{row.label}</span>
          <span className={row.emphasis ? 'ml-auto' : 'ml-auto text-zinc-300'}>{row.value}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * One editable number, with what it means to its left.
 *
 * **The field sits on the right, at both widths.** Two reasons, and the second
 * is why there is no `useIsMobile` branch here. On a phone the right edge is
 * where the thumb already is, so that is where a control belongs. And the
 * ledger directly below these cards puts its labels left and its numbers right
 * — so aligning the editable numbers with the derived ones makes the whole
 * drawer read in one direction rather than two.
 */
function NumberField({
  label,
  hint,
  value,
  placeholder,
  step,
  max,
  onChange,
}: {
  label: string
  hint: string
  value: string
  placeholder?: string
  step?: string
  max?: number
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <span className="pb-1.5 text-xs leading-snug text-zinc-500">{hint}</span>
      <label className="flex w-24 shrink-0 flex-col gap-1">
        <MicroLabel>{label}</MicroLabel>
        <Input
          size="sm"
          type="number"
          min={0}
          max={max}
          step={step}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  )
}

/** An empty field is an absence — "follow the catalog" — and not a zero. */
function numberOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}
