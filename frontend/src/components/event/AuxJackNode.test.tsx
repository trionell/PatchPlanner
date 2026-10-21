import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Console, InputCable } from '../../types'
import { AuxJackNode } from './InputGraphCanvas'

/** D9 as markup: the aux socket node's badge, rows, and the over flag after a switch. */

const foh: Console = {
  id: 3, event_id: 1, name: 'FOH', role: 'foh', input_count: 32, output_count: 16,
  local_input_count: 32, local_output_count: 16, position_x: 0, position_y: 0, input_position_x: 0, input_position_y: 0,
  local_position_x: 260, local_position_y: 320, local_input_position_x: 260, local_input_position_y: 320,
  aux_socket_count: 6, aux_input_position_x: 260, aux_input_position_y: 960, desk_model: 'x32', bus_mode: '',
}

function render(desk: Console, cables: InputCable[] = []): string {
  return renderToStaticMarkup(
    <AuxJackNode
      x={0}
      y={0}
      desk={desk}
      cables={cables}
      pendingPort={null}
      onPortClick={() => {}}
      onPortPointerDown={() => {}}
      registerPort={() => () => {}}
      colorContext={{ channels: [], devices: [], stageboxes: [], stageMultis: [], cables }}
    />,
  )
}

describe('AuxJackNode', () => {
  it('is titled with the desk and badged LOCAL AUX, one row per socket', () => {
    const html = render(foh)
    expect(html).toContain('FOH')
    expect(html).toContain('LOCAL AUX')
    for (const n of [1, 2, 3, 4, 5, 6]) expect(html).toContain(`>${n}<`)
    expect(html).not.toContain('>7<')
    expect(html).not.toContain('over')
  })

  it('keeps a socket a switch took away, flagged over', () => {
    const core = { ...foh, desk_model: 'x32core', aux_socket_count: 0 }
    const html = render(core, [{ id: 1, event_id: 1, from_kind: 'source', from_id: 1, from_port: 0, to_kind: 'console_aux', to_id: 3, to_port: 1 }])
    expect(html).toContain('>2<')
    expect((html.match(/over</g) ?? []).length).toBe(2)
  })
})
