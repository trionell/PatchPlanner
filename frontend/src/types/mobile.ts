export interface MobileSection {
  section: 'overview' | 'audio-inputs' | 'desk-routing' | 'audio-outputs' | 'lighting-rig' | 'stage-plots' | 'signal-flow' | 'equipment' | 'rentals' | 'settings'
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
 * Slice 33 kept the *name* deliberately, so a rename would not be mixed into a
 * deletion and make it harder to read. That reason expired: the deletion is
 * several commits old and legible on its own, and Wave 6c is in this file for
 * an unrelated reason (design/audit.md F3).
 */
export const MOBILE_SECTIONS: MobileSection[] = [
  { section: 'overview', label: 'Overview' },
  { section: 'audio-inputs', label: 'Audio Inputs' },
  { section: 'desk-routing', label: 'Desk Routing' },
  { section: 'audio-outputs', label: 'Audio Outputs' },
  { section: 'lighting-rig', label: 'Lighting Rig' },
  { section: 'stage-plots', label: 'Stage Plots' },
  { section: 'signal-flow', label: 'Signal Flow' },
  { section: 'equipment', label: 'Equipment' },
  { section: 'rentals', label: 'Rental Order' },
  { section: 'settings', label: 'Settings' },
]
