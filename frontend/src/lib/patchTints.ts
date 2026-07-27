/**
 * Pill tints for the audio patch's vocabularies (Slice 26).
 *
 * Lifted out of `OutputSheet` because the flow inspector's header shows the same
 * pill for the same value, and a second copy of the mapping is how a `monitor` ends
 * up emerald in one view and green-ish in the other. The sheet imports it from here
 * now.
 *
 * These are *tints for known values*, not a whitelist: an output type the palette
 * doesn't know still renders, in neutral. Types come from the `output_types`
 * vocabulary and users can add their own (Principle II), so a lookup that failed
 * loudly would break the extensibility this mapping is decorating.
 */
export function outputTypeTint(type: string): string {
  switch (type) {
    case 'foh': return 'bg-cyan-500/15 text-cyan-300'
    case 'monitor': return 'bg-emerald-500/15 text-emerald-300'
    case 'iem': return 'bg-orange-500/15 text-orange-300'
    case 'sub': return 'bg-red-500/15 text-red-300'
    case 'matrix': return 'bg-indigo-500/15 text-indigo-300'
    case 'aux': return 'bg-pink-500/15 text-pink-300'
    default: return 'bg-zinc-700 text-zinc-100'
  }
}
