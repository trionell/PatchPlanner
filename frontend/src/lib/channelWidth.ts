/**
 * Console channel-number label: a mono or stereo-channel row occupies one
 * number ("5"); a linked-channels row occupies its number and the next
 * ("5–6") — mirrors formatDMXRange's single-vs-range display convention.
 */
export function channelNumberLabel(channelNumber: number, mixerBehavior: string): string {
  if (mixerBehavior === 'linked_channels') return `${channelNumber}–${channelNumber + 1}`
  return `${channelNumber}`
}

/**
 * Smallest channel number not occupied by any existing row, accounting for
 * linked-channels rows occupying two numbers. Mono and stereo-channel rows
 * occupy only their own number.
 */
export function suggestNextChannelNumber(rows: { channel_number: number; mixer_behavior?: string }[]): number {
  let highest = 0
  for (const row of rows) {
    const occupiesTwo = row.mixer_behavior === 'linked_channels'
    const top = occupiesTwo ? row.channel_number + 1 : row.channel_number
    if (top > highest) highest = top
  }
  return highest + 1
}
