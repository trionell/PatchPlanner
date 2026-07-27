import type { ChainCellModel } from './patchSheet'
import type { AudioPatchOutput } from '../types'

/**
 * The output inspector's derivations (Slice 26 US1), as pure functions.
 *
 * They live here rather than inside the rail so they can be tested without
 * rendering anything — the pattern `patchSheet.ts` and `patchCapacity.ts` already
 * set. All three are things that were easy to get subtly wrong by hand, and two of
 * them were wrong somewhere else in this codebase first.
 */

/**
 * The number a new output takes.
 *
 * `max + 1`, not `last + 1`. The tab's own Add button uses `outputs.at(-1)`, which is
 * only correct because the sheet happens to hand it a list sorted by number; the raw
 * query guarantees no order, and a rail that duplicates row 3 of an unsorted list
 * would otherwise mint a number that already exists.
 */
export function nextOutputNumber(outputs: AudioPatchOutput[]): number {
  return outputs.reduce((max, output) => Math.max(max, output.output_number), 0) + 1
}

/**
 * The payload for duplicating an output (FR-007).
 *
 * Every field of the row, the same desk, the next free number — and *not* its
 * cabling, so the copy starts unpatched. That matches what duplicating a source
 * already does, and it is the only honest reading: a second wedge send is a second
 * bus, not a second cable into the same amplifier input.
 *
 * An unnamed row's copy stays unnamed. `${name} copy` on an empty name produces
 * " copy", which is a row called nothing plus a word.
 */
export function duplicateOf(output: AudioPatchOutput, outputs: AudioPatchOutput[]): Omit<AudioPatchOutput, 'id'> {
  return {
    event_id: output.event_id,
    output_number: nextOutputNumber(outputs),
    output_name: output.output_name ? `${output.output_name} copy` : '',
    output_type: output.output_type,
    color: output.color,
    width: output.width,
    notes: output.notes,
    console_id: output.console_id,
  }
}

/** One end of a run, as the rail states it. */
export interface Landing {
  /** `L`/`R` when the two sides of a stereo output diverged into separate lines. */
  sideLabel?: string
  /** The last hop's label — where this side of the run actually ends up. */
  label: string
}

/**
 * Where an output lands (FR-006).
 *
 * Derived from the **sheet's own chain model** rather than from a second walk over
 * the cables, so the rail and the Chain column cannot disagree about where a run
 * goes — the same reasoning that made `derivedCableColor` be defined in terms of
 * `derivedOutputPortColor` instead of re-implementing the walk (research.md R6).
 *
 * The last segment of a line is the far end: an output chain reads outward from the
 * desk, so its head is the desk and its tail is the destination. A line whose tail is
 * a stated gap ("not patched") contributes no landing, which is what makes `patched`
 * false for a run that leaves the desk and stops halfway.
 */
export function landsOn(model: ChainCellModel): { landings: Landing[]; patched: boolean } {
  const landings: Landing[] = []
  for (const line of model.lines) {
    // The head is the desk itself, so a line of length one never left it. Anything
    // shorter than two segments is a bus that goes nowhere, not a bus that lands.
    if (line.segments.length < 2) continue
    const last = line.segments.at(-1)
    if (!last || last.missing) continue
    landings.push({ sideLabel: line.sideLabel, label: last.label })
  }
  return { landings, patched: landings.length > 0 }
}
