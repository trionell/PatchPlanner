import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GENERIC } from '../../hooks/useDeskModels'
import type { Console, DeskModel, InputChannel } from '../../types'
import { ConsoleNode } from './InputGraphCanvas'

/** The desk rail's aux run (components.md §2): heading, fill, order and the footer's count. */

const X32: DeskModel = { ...GENERIC, key: 'x32', label: 'X32', engine: 'x32', stereo: 'linked', strips: 32, aux_in: 8, aux_sockets: 6, local_in: 32 }
const foh = { id: 3, event_id: 1, name: 'FOH', desk_model: 'x32', bus_mode: '', input_count: 2, local_input_count: 32, aux_socket_count: 6 } as Console
const ch = (id: number, n: number, name: string, extra: Partial<InputChannel> = {}) =>
  ({ id, event_id: 1, channel_number: n, channel_name: name, width: 'mono', mixer_behavior: 'linked_channels', console_id: 3, strip_pool: 'channel', ...extra }) as InputChannel

function render(channels: InputChannel[], search = ''): string {
  return renderToStaticMarkup(
    <ConsoleNode
      x={0}
      y={0}
      desk={foh}
      model={X32}
      channels={channels}
      cables={[]}
      pendingPort={null}
      onPortClick={() => {}}
      onPortPointerDown={() => {}}
      registerPort={() => () => {}}
      colorContext={{ channels, devices: [], stageboxes: [], stageMultis: [], cables: [] }}
      search={search}
    />,
  )
}

const rows = [
  ch(1, 1, 'Playback', { strip_pool: 'aux', width: 'stereo' }),
  ch(2, 2, 'Snare'),
  ch(3, 1, 'Kick'),
  ch(4, 3, 'Laptop', { strip_pool: 'aux' }),
]

describe('ConsoleNode · the aux run', () => {
  it('puts the aux strips under an Aux in heading with the pool fill', () => {
    const html = render(rows)
    const at = (text: string) => html.indexOf(text)
    expect(at('Kick')).toBeLessThan(at('Snare'))
    expect(at('Snare')).toBeLessThan(at('Aux in'))
    expect(at('Aux in')).toBeLessThan(at('Playback L'))
    expect(at('Playback R')).toBeLessThan(at('Laptop'))
    // 2 strips for the stereo pair on an X32, 1 for Laptop.
    expect(html).toContain('3/8')
  })

  it('counts only the channels against the inputs, so aux strips raise no alarm', () => {
    const html = render(rows)
    expect(html).toMatch(/2(<!-- -->)? \/ 2(<!-- -->)? in/)
    expect(html).not.toContain('text-red')
  })

  it('draws no heading on a desk with no aux strips', () => {
    expect(render([ch(2, 2, 'Snare'), ch(3, 1, 'Kick')])).not.toContain('Aux in')
  })

  it('dims the heading only when every aux row is dimmed', () => {
    const dimmedHeading = (html: string) => /border-t border-zinc-800 px-1.5 opacity-30/.test(html)
    expect(dimmedHeading(render(rows, 'Kick'))).toBe(true)
    expect(dimmedHeading(render(rows, 'Laptop'))).toBe(false)
  })
})
