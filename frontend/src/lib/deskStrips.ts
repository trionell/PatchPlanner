import type { Console, DeskModel, InputChannel, StripPool } from '../types'

/** How many strips a channel takes on this model (Slice 47). Generic follows the row's own behaviour. */
export function stripWidth(model: DeskModel, channel: Pick<InputChannel, 'width' | 'mixer_behavior'>): number {
  if (channel.width !== 'stereo') return 1
  if (model.engine === 'x32') return 2
  if (model.engine === 'lv1') return 1
  return channel.mixer_behavior === 'linked_channels' ? 2 : 1
}

export const poolOf = (channel: Pick<InputChannel, 'strip_pool'>): StripPool => channel.strip_pool ?? 'channel'

/** The number cell: "5", "5–6", "6 S", "Aux 3", "Aux 1–2". */
export function stripLabel(model: DeskModel, channel: Pick<InputChannel, 'channel_number' | 'width' | 'mixer_behavior' | 'strip_pool'>): string {
  const width = stripWidth(model, channel)
  const n = channel.channel_number
  const number = width === 2 ? `${n}–${n + 1}` : channel.width === 'stereo' ? `${n} S` : `${n}`
  return poolOf(channel) === 'aux' ? `Aux ${number}` : number
}

/** A pool's capacity on this desk; Generic's channel pool is the typed count (0 = undeclared). */
export function poolCapacity(model: DeskModel, desk: Pick<Console, 'input_count'>, pool: StripPool): number {
  if (pool === 'aux') return model.aux_in
  return model.engine === 'generic' ? desk.input_count : model.strips
}

/** Strips the channels take in one pool. */
export function poolUsage(model: DeskModel, channels: InputChannel[], pool: StripPool): number {
  return channels.filter((channel) => poolOf(channel) === pool).reduce((sum, channel) => sum + stripWidth(model, channel), 0)
}

/** Past its pool's last strip: kept, flagged over (B2). Generic with nothing declared is never over. */
export function isOver(model: DeskModel, desk: Pick<Console, 'input_count'>, channel: InputChannel): boolean {
  const capacity = poolCapacity(model, desk, poolOf(channel))
  return capacity > 0 && channel.channel_number + stripWidth(model, channel) - 1 > capacity
}

/** Channels in desk order: channels before aux, then number. */
export function orderChannels(channels: InputChannel[]): InputChannel[] {
  return [...channels].sort((a, b) => {
    const pool = (poolOf(a) === 'aux' ? 1 : 0) - (poolOf(b) === 'aux' ? 1 : 0)
    return pool || a.channel_number - b.channel_number || a.id - b.id
  })
}

/** "FOH · M32 Live", the way every refusal and the strip names a desk. */
export function deskLabel(desk: Pick<Console, 'name'>, model: DeskModel): string {
  const name = desk.name || 'Console'
  return model.engine === 'generic' ? name : `${name} · ${model.label}`
}
