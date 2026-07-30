import type { PricingDefaults } from '../types'
import { request } from './client'

/**
 * The two answers a catalog copies when it is created (Slice 31).
 *
 * User-scoped from the session rather than by id, following
 * `api/referenceTemplates.ts` — and, like that one, seeding only. Changing
 * these reaches nothing that already exists.
 */
export const getPricingDefaults = () => request<PricingDefaults>('/pricing-defaults')

export const updatePricingDefaults = (defaults: PricingDefaults) =>
  request<PricingDefaults>('/pricing-defaults', { method: 'PUT', body: JSON.stringify(defaults) })
