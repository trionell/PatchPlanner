import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GENERIC } from '../../hooks/useDeskModels'
import type { Console, DeskModel, InputCable, InputChannel, InputSource, Stagebox } from '../../types'
import { MobileChannelEditSheet } from './MobileChannelEditSheet'

/** D9 as markup: the phone's Into lists every jack panel, and a jack-fed channel opens filled. */

beforeEach(() => {
  ;(globalThis as { window?: unknown }).window = {
    matchMedia: () => ({ matches: true }),
    localStorage: { getItem: () => null, setItem: () => {} },
  }
})
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

const X32: DeskModel = { ...GENERIC, key: 'x32', family: 'Behringer X32', label: 'X32', engine: 'x32', stereo: 'linked', strips: 32, aux_in: 8, aux_sockets: 6, local_in: 32 }
const foh = { id: 3, event_id: 1, name: 'FOH', desk_model: 'x32', bus_mode: '', input_count: 32, local_input_count: 32, aux_socket_count: 6 } as Console
const core = { id: 4, event_id: 1, name: 'Mon', desk_model: 'x32core', bus_mode: '', input_count: 32, local_input_count: 0, aux_socket_count: 0 } as Console
const box = { id: 5, event_id: 1, name: 'Scen A', input_count: 16 } as Stagebox
const host = { id: 1, event_id: 1, channel_number: 20, channel_name: 'Host mic RX', width: 'mono', mixer_behavior: 'linked_channels', console_id: 3, strip_pool: 'channel', mix_ids: [] } as unknown as InputChannel
const source = { id: 9, event_id: 1, name: 'Host mic RX', kind: 'line', connector_type: 'trs', width: 'mono' } as InputSource

function render(cables: InputCable[]): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MobileChannelEditSheet
        eventId={1}
        channel={host}
        sources={[source]}
        stageboxes={[box]}
        cables={cables}
        consoles={[foh, core]}
        models={[X32, { ...X32, key: 'x32core', label: 'X32 Core', aux_sockets: 0, local_in: 0 }]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </QueryClientProvider>,
  )
}

describe('MobileChannelEditSheet · Into + Jack', () => {
  it('lists stageboxes, then each desk with its local in and aux in apart', () => {
    const html = render([])
    expect(html).toContain('>Into<')
    expect(html).toContain('>Jack<')
    expect(html).toContain('<option value="stagebox:5">Scen A</option>')
    expect(html).toContain('<optgroup label="FOH">')
    expect(html).toContain('<option value="console_local:3">FOH local in</option>')
    expect(html).toContain('<option value="console_aux:3">FOH aux in</option>')
    // A desk with neither has no group.
    expect(html).not.toContain('label="Mon"')
  })

  it('opens a channel on an aux socket with both fields filled', () => {
    const html = render([
      { id: 1, event_id: 1, from_kind: 'source', from_id: 9, from_port: 0, to_kind: 'console_aux', to_id: 3, to_port: 2 },
      { id: 2, event_id: 1, from_kind: 'console_aux', from_id: 3, from_port: 2, to_kind: 'channel', to_id: 1, to_port: 0 },
    ])
    expect(html).toMatch(/<option value="console_aux:3" selected="">FOH aux in<\/option>/)
    expect(html).toMatch(/<option value="2" selected="">Aux 3<\/option>/)
    expect(html).not.toContain('Aux 7')
  })

  it('opens a channel on a local jack with Local N', () => {
    const html = render([
      { id: 1, event_id: 1, from_kind: 'source', from_id: 9, from_port: 0, to_kind: 'console_local', to_id: 3, to_port: 4 },
      { id: 2, event_id: 1, from_kind: 'console_local', from_id: 3, from_port: 4, to_kind: 'channel', to_id: 1, to_port: 0 },
    ])
    expect(html).toMatch(/<option value="console_local:3" selected="">FOH local in<\/option>/)
    expect(html).toMatch(/<option value="4" selected="">Local 5<\/option>/)
  })

  it('still shows a socket a switch took away while the channel is on it', () => {
    const html = render([
      { id: 1, event_id: 1, from_kind: 'source', from_id: 9, from_port: 0, to_kind: 'console_aux', to_id: 4, to_port: 1 },
      { id: 2, event_id: 1, from_kind: 'console_aux', from_id: 4, from_port: 1, to_kind: 'channel', to_id: 1, to_port: 0 },
    ])
    expect(html).toMatch(/<option value="console_aux:4" selected="">Mon aux in<\/option>/)
    expect(html).toMatch(/<option value="1" selected="">Aux 2<\/option>/)
    expect(html).not.toContain('Mon local in')
  })
})
