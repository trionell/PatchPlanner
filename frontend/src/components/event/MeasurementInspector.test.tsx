import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { StagePlotElement, StagePlotLayer, StagePlotMeasurement } from '../../types'
import { MeasurementInspector, StagePlotInspector } from './StagePlotInspector'

const layers: StagePlotLayer[] = [{ id: 1, plot_id: 1, name: 'Layer 1', sort_order: 0, visible: true, locked: false }]

const elements: StagePlotElement[] = [
  {
    id: 9, plot_id: 1, layer_id: 1, kind: 'shape', shape_kind: 'rect', name: 'Riser',
    x_cm: 0, y_cm: 0, z_cm: 0, width_cm: 200, depth_cm: 100, height_cm: 50,
    rotation_deg: 0, tilt_deg: 0, links: [],
  },
]

const measurement: StagePlotMeasurement = {
  id: 1, plot_id: 1, layer_id: 1, view: 'top', type: 'horizontal',
  from: { element_id: 9, feature: 'face:+x' },
  to: { u_cm: 500, v_cm: 0 },
  offset_cm: 120, note: 'PA span', sort_order: 0,
}

function render(spatial: boolean) {
  return renderToStaticMarkup(
    <MeasurementInspector
      measurement={measurement}
      elements={elements}
      layers={layers}
      view="top"
      onUpdate={() => {}}
      onDelete={() => {}}
      spatial={spatial}
    />,
  )
}

describe('MeasurementInspector', () => {
  it('states the value and offers no control to set it', () => {
    const html = render(true)
    // The +x face is at u = 100; the free point is at 500.
    expect(html).toContain('400 cm')
    // No input carries the value: a typed dimension can disagree with the
    // drawing, and then the drawing is not the plan.
    expect(html).not.toContain('value="400"')
  })

  it('names both ends without offering a control to change them', () => {
    const html = render(true)
    expect(html).toContain('Riser')
    expect(html).toContain('Free point')
    // Re-anchoring is a drag on the canvas; aiming at geometry is not a dropdown.
    expect(html).not.toContain('face:+x')
  })

  it('gives the desk the type, the offset and Delete', () => {
    const html = render(true)
    expect(html).toContain('Flip')
    expect(html).toContain('Delete')
    expect(html).toContain('aligned')
  })

  it('gives the phone the value and the note, and no Delete at all', () => {
    // A surface never destroys what it cannot author: the phone cannot draw a
    // measurement, so it does not get to delete one.
    const html = render(false)
    expect(html).toContain('400 cm')
    expect(html).toContain('PA span')
    expect(html).not.toContain('Delete')
    // The geometry goes with it — type and offset are desk gestures.
    expect(html).not.toContain('Flip')
  })
})

describe('StagePlotInspector on a phone', () => {
  const element = elements[0]

  function renderInspector(spatial: boolean) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <StagePlotInspector
          eventId={1}
          element={element}
          layers={layers}
          onUpdate={() => {}}
          onDuplicate={() => {}}
          onDelete={() => {}}
          onAddLink={() => {}}
          onReorderLink={() => {}}
          onDeleteLink={() => {}}
          spatial={spatial}
        />
      </QueryClientProvider>,
    )
  }

  it('keeps Delete at the desk', () => {
    expect(renderInspector(true)).toContain('Delete')
  })

  it('withholds Delete from the phone, which cannot place an element back', () => {
    // patterns.md §7g — a surface never destroys what it cannot author. The
    // element's own fields stay editable; only the ending of it is withheld.
    const html = renderInspector(false)
    expect(html).not.toContain('Delete')
    expect(html).toContain('Riser')
  })
})
