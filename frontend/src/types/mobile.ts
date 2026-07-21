/** Mobile capability of one event section — informational only; never overrides a user's actual role-based permission (FR-015). */
export type MobileCapability = 'editable' | 'read-only' | 'viewer'

export interface MobileSectionCapability {
  section: 'overview' | 'audio-inputs' | 'audio-outputs' | 'lighting-rig' | 'stage-plots' | 'signal-flow' | 'equipment' | 'rentals' | 'settings'
  label: string
  capability: MobileCapability
}

/**
 * Fixed mapping of every event tab to its mobile treatment (spec.md
 * FR-004–FR-013). Not user-configurable — see contracts/mobile-ui-contract.md.
 */
export const MOBILE_SECTION_CAPABILITIES: MobileSectionCapability[] = [
  { section: 'overview', label: 'Overview', capability: 'editable' },
  { section: 'audio-inputs', label: 'Audio Inputs', capability: 'editable' },
  { section: 'audio-outputs', label: 'Audio Outputs', capability: 'editable' },
  { section: 'lighting-rig', label: 'Lighting Rig', capability: 'editable' },
  { section: 'stage-plots', label: 'Stage Plots', capability: 'viewer' },
  { section: 'signal-flow', label: 'Signal Flow', capability: 'viewer' },
  { section: 'equipment', label: 'Equipment', capability: 'read-only' },
  { section: 'rentals', label: 'Rental Order', capability: 'read-only' },
  { section: 'settings', label: 'Settings', capability: 'editable' },
]
