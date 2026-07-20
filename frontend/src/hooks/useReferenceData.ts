import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getReferenceData } from '../api/reference'
import { getReferenceTemplate } from '../api/referenceTemplates'
import type { ReferenceData, ReferenceValue } from '../types'

/**
 * Options for one vocabulary's dropdown. When the row being edited stores
 * a value that is missing from the vocabulary (legacy data, or a value
 * deleted after the row was saved), it is appended as its own option so
 * the row still displays it and editing other fields never forces a
 * vocabulary change.
 */
function makeOptions(query: UseQueryResult<ReferenceData>) {
  return (vocabulary: string, currentValue?: string): ReferenceValue[] => {
    const values = query.data?.[vocabulary] ?? []
    if (currentValue && !values.some((v) => v.value === currentValue)) {
      return [...values, { id: -1, vocabulary, value: currentValue, label: currentValue }]
    }
    return values
  }
}

/**
 * Display label for one stored value, falling back to the raw value for
 * legacy/custom entries — the same text the dropdowns show.
 */
function makeLabel(query: UseQueryResult<ReferenceData>) {
  return (vocabulary: string, value: string | undefined): string => {
    if (!value) return ''
    return query.data?.[vocabulary]?.find((v) => v.value === value)?.label ?? value
  }
}

/**
 * Shared access to one event's editable planning vocabularies. All
 * dropdowns for that event read from one cached query
 * (`['reference-data', eventId]`); the event's Settings tab mutations
 * invalidate that key, so new values appear everywhere without a reload.
 */
export function useReferenceData(eventId: number) {
  const query = useQuery({ queryKey: ['reference-data', eventId], queryFn: () => getReferenceData(eventId) })
  return { ...query, options: makeOptions(query), label: makeLabel(query) }
}

/**
 * A user's own personal vocabulary template (Slice 17) — the seed copied
 * into a new event's own vocabulary at creation time, with no live link
 * afterward. Used only by the "My Defaults" page.
 */
export function useReferenceTemplate() {
  const query = useQuery({ queryKey: ['reference-template'], queryFn: getReferenceTemplate })
  return { ...query, options: makeOptions(query), label: makeLabel(query) }
}
