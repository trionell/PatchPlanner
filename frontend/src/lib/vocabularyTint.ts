/**
 * The one tint per vocabulary value, for both chip tiers.
 *
 * `Badge` (navigation surfaces) and `Pill` (work surfaces) are two sizes of the
 * same idea and must never disagree about what colour a `monitor` is. They had
 * two maps: `Badge`'s own `variantStyles` and `patchTints.outputTypeTint`, which
 * was lifted out of `OutputSheet` for exactly this reason one tier down. This is
 * that lift finished — the map moves somewhere both tiers read, rather than being
 * copied into `Pill`'s callers (design/audit.md A9).
 *
 * Tints are for *known* values, not a whitelist. Types come from the
 * `output_types` and `signal_types` vocabularies and users add their own
 * (Principle II), so an unknown value renders neutral rather than failing.
 *
 * The ground/ink pair is always `<hue>-500/15` over `<hue>-300` (design/tokens.md
 * §5). A new entry that departs from that formula is a bug, not a new colour.
 */
const TINTS: Record<string, string> = {
  // signal types
  mic: 'bg-sky-500/15 text-sky-300',
  line: 'bg-violet-500/15 text-violet-300',
  di: 'bg-emerald-500/15 text-emerald-300',
  return: 'bg-amber-500/15 text-amber-300',
  // output types
  foh: 'bg-cyan-500/15 text-cyan-300',
  monitor: 'bg-emerald-500/15 text-emerald-300',
  iem: 'bg-orange-500/15 text-orange-300',
  sub: 'bg-red-500/15 text-red-300',
  matrix: 'bg-indigo-500/15 text-indigo-300',
  aux: 'bg-pink-500/15 text-pink-300',
  stereo: 'bg-purple-500/15 text-purple-300',
  // states
  success: 'bg-emerald-500/15 text-emerald-300',
  warning: 'bg-amber-500/15 text-amber-300',
  danger: 'bg-red-500/15 text-red-300',
}

/** The neutral look, for a value the palette has no entry for. */
export const NEUTRAL_TINT = 'bg-zinc-700 text-zinc-100'

export function vocabularyTint(value?: string): string {
  return (value && TINTS[value]) || NEUTRAL_TINT
}
