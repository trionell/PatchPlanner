import { useQuery } from '@tanstack/react-query'
import { getReferenceData } from '../api/reference'
import type { ReferenceValue } from '../types'

/**
 * Shared access to the editable planning vocabularies. All dropdowns read
 * from one cached query (`['reference-data']`); settings-page mutations
 * invalidate that key, so new values appear everywhere without a reload.
 */
export function useReferenceData() {
  const query = useQuery({ queryKey: ['reference-data'], queryFn: getReferenceData })

  /**
   * Options for one vocabulary's dropdown. When the row being edited stores
   * a value that is missing from the vocabulary (legacy data, or a value
   * deleted after the row was saved), it is appended as its own option so
   * the row still displays it and editing other fields never forces a
   * vocabulary change.
   */
  const options = (vocabulary: string, currentValue?: string): ReferenceValue[] => {
    const values = query.data?.[vocabulary] ?? []
    if (currentValue && !values.some((v) => v.value === currentValue)) {
      return [...values, { id: -1, vocabulary, value: currentValue, label: currentValue }]
    }
    return values
  }

  return { ...query, options }
}
