import type { Console, InputCable, OutputCable, StageMulti, Stagebox } from '../types'

/** One box's declared size against what the patch actually uses. */
export interface BoxUsage {
  name: string
  used: number
  declared: number
}

/** Everything the status rail states about a patch, in one derived object. */
export interface PatchStatus {
  /** How many rows the sheet has (channels or outputs). */
  rowCount: number
  /** One fragment per console, e.g. `FOH · SD10 15/96 ch`. */
  consoleLabels: string[]
  boxes: BoxUsage[]
  cablesPicked: number
  /** One line per row that is missing a link, e.g. "Ch 16 Playback L/R has no source". */
  gaps: string[]
  /** Non-empty when a desk's declared count is exceeded (research.md R15). */
  overCapacity: string[]
}

export type PatchStatusState = 'complete' | 'gaps' | 'over'

/**
 * Which of the rail's three states to show. Over-capacity outranks gaps: a
 * patch that doesn't fit the booked desk is a bigger problem than one that
 * isn't finished, and the fix is in a different place (the Rig drawer, not the
 * graph).
 */
export function patchStatusState(status: PatchStatus): PatchStatusState {
  if (status.overCapacity.length > 0) return 'over'
  if (status.gaps.length > 0) return 'gaps'
  return 'complete'
}

/**
 * Ports of a box that carry a cable on either side. A jack used in both
 * directions is still one jack, so the two sides are unioned rather than
 * summed — otherwise a fully-wired pass-through would read as double its size.
 */
export function usedPorts(kind: string, id: number, cables: { from_kind: string; from_id: number; from_port: number; to_kind: string; to_id: number; to_port: number }[]): number {
  const ports = new Set<number>()
  for (const cable of cables) {
    if (cable.from_kind === kind && cable.from_id === id) ports.add(cable.from_port)
    if (cable.to_kind === kind && cable.to_id === id) ports.add(cable.to_port)
  }
  return ports.size
}

export function boxUsage(
  stageboxes: Stagebox[],
  stageMultis: StageMulti[],
  cables: (InputCable | OutputCable)[],
): BoxUsage[] {
  return [
    ...stageboxes.map((box) => ({ name: box.name, used: usedPorts('stagebox', box.id, cables), declared: box.output_count })),
    ...stageMultis.map((multi) => ({ name: multi.name, used: usedPorts('stage_multi', multi.id, cables), declared: multi.channels })),
  ]
}

export function cablesPicked(cables: { cable_item_id?: number }[]): number {
  return cables.filter((cable) => cable.cable_item_id != null).length
}

/**
 * A console count of `0` means "not declared", never "over capacity by every
 * row" (research.md R15). Every event backfilled by migration 042 has all four
 * counts at zero, and none of them may start warning; nobody books a desk with
 * no inputs, so zero can only mean nobody has typed it in yet.
 */
export function overCapacityLine(consoleName: string, used: number, declared: number, noun: string): string | undefined {
  if (declared <= 0 || used <= declared) return undefined
  const short = used - declared
  return `${consoleName} takes ${declared} — ${short} ${short === 1 ? `${noun} has` : `${noun}s have`} nowhere to land`
}

/**
 * One `desk SD10 · 15 / 96 in` fragment per console, plus an over-capacity line
 * for any desk the patch has outgrown. `assignedTo` counts the rows (channels or
 * outputs) belonging to a console; `declaredOf` reads the matching count, which
 * differs per graph.
 */
export function consoleCapacity(
  consoles: Console[],
  assignedTo: (desk: Console) => number,
  declaredOf: (desk: Console) => number,
  noun: string,
): { labels: string[]; overCapacity: string[] } {
  const labels: string[] = []
  const overCapacity: string[] = []
  for (const desk of consoles) {
    const name = desk.name || 'desk'
    const used = assignedTo(desk)
    const declared = declaredOf(desk)
    labels.push(declared > 0 ? `${name} ${used}/${declared} ${noun.slice(0, 2)}` : `${name} ${used} ${noun.slice(0, 2)}`)
    const over = overCapacityLine(name, used, declared, noun)
    if (over) overCapacity.push(over)
  }
  return { labels, overCapacity }
}

/**
 * The two patches' status, assembled once.
 *
 * These lived inline in `InputSheet` and `OutputSheet` — about fifteen lines each,
 * identical in shape and differing only in a noun and a count. Wave 6b gave them a
 * second caller: the phone's status strip is rendered by the *tab*, which cannot reach
 * inside the sheet, and duplicating the assembly there would put one of the two copies
 * on the surface nobody looks at on a desk.
 *
 * Extraction at the second caller, not before (Principle V). What stays with the caller
 * is the gap predicate, because the sheet has chain models and the phone has list items
 * and both already know which of their rows is missing a link — what moves here is the
 * assembly and the wording, which is the part that drifts.
 */
export function inputPatchStatus(input: {
  channels: { console_id?: number }[]
  /** The channels the chain says have no source, in row order. */
  gaps: { channel_number: number; channel_name?: string }[]
  consoles: Console[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  cables: InputCable[]
}): PatchStatus {
  const capacity = consoleCapacity(
    input.consoles,
    (desk) => input.channels.filter((channel) => channel.console_id === desk.id).length,
    (desk) => desk.input_count,
    'channel',
  )
  return {
    rowCount: input.channels.length,
    consoleLabels: capacity.labels,
    boxes: boxUsage(input.stageboxes, input.stageMultis, input.cables),
    cablesPicked: cablesPicked(input.cables),
    gaps: input.gaps.map((channel) => `Ch ${channel.channel_number} ${channel.channel_name || ''} has no source`.replace('  ', ' ')),
    overCapacity: capacity.overCapacity,
  }
}

export function outputPatchStatus(input: {
  outputs: { console_id?: number }[]
  /** The outputs the chain says are not patched, in row order. */
  gaps: { output_number: number; output_name?: string }[]
  consoles: Console[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  cables: OutputCable[]
}): PatchStatus {
  const capacity = consoleCapacity(
    input.consoles,
    (desk) => input.outputs.filter((output) => output.console_id === desk.id).length,
    (desk) => desk.output_count,
    'output',
  )
  return {
    rowCount: input.outputs.length,
    consoleLabels: capacity.labels,
    boxes: boxUsage(input.stageboxes, input.stageMultis, input.cables),
    cablesPicked: cablesPicked(input.cables),
    gaps: input.gaps.map((output) => `Out ${output.output_number} ${output.output_name || ''} is not patched`.replace('  ', ' ')),
    overCapacity: capacity.overCapacity,
  }
}
