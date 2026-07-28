export interface MobileSectionCapability {
  section: 'overview' | 'audio-inputs' | 'audio-outputs' | 'lighting-rig' | 'stage-plots' | 'signal-flow' | 'equipment' | 'rentals' | 'settings'
  label: string
}

/**
 * Every event section, in tab order, for the phone's section switcher.
 *
 * It used to carry a `capability` per entry — `editable` / `read-only` /
 * `viewer` — which the switcher rendered as a badge. That was a vocabulary the
 * application does not otherwise use, describing the state of the *build*
 * rather than the state of the *show*, from a fixed table that could not know a
 * user's role: it told a viewer that Audio Inputs was "Editable". Slice 33
 * deleted it (design/audit.md M7).
 *
 * What a user may do is a role question (P7), and what a surface has built a
 * phone form for yet is a sentence in the panel naming the reason
 * (patterns.md §7g). Neither is a fixed grade on a list of destinations.
 *
 * The constant keeps its name: a rename in the same commit as a deletion makes
 * the deletion harder to read.
 */
export const MOBILE_SECTION_CAPABILITIES: MobileSectionCapability[] = [
  { section: 'overview', label: 'Overview' },
  { section: 'audio-inputs', label: 'Audio Inputs' },
  { section: 'audio-outputs', label: 'Audio Outputs' },
  { section: 'lighting-rig', label: 'Lighting Rig' },
  { section: 'stage-plots', label: 'Stage Plots' },
  { section: 'signal-flow', label: 'Signal Flow' },
  { section: 'equipment', label: 'Equipment' },
  { section: 'rentals', label: 'Rental Order' },
  { section: 'settings', label: 'Settings' },
]
