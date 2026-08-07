import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { StagePlotElement, StagePlotLayer, StagePlotMeasurement } from '../../types'
import { PlotMeasurementLayer } from './PlotMeasurementLayer'

function layer(overrides: Partial<StagePlotLayer>): StagePlotLayer {
  return { id: 1, plot_id: 1, name: 'Layer 1', sort_order: 0, visible: true, locked: false, ...overrides }
}

function element(overrides: Partial<StagePlotElement>): StagePlotElement {
  return {
    id: 1, plot_id: 1, layer_id: 1, kind: 'shape', shape_kind: 'rect', name: '',
    x_cm: 0, y_cm: 0, z_cm: 0, width_cm: 200, depth_cm: 100, height_cm: 50,
    rotation_deg: 0, tilt_deg: 0, links: [], ...overrides,
  }
}

function measurement(overrides: Partial<StagePlotMeasurement>): StagePlotMeasurement {
  return {
    id: 1, plot_id: 1, layer_id: 1, view: 'top', type: 'aligned',
    from: { u_cm: 0, v_cm: 0 }, to: { u_cm: 400, v_cm: 0 },
    offset_cm: 0, sort_order: 0, ...overrides,
  }
}

function render(props: Partial<Parameters<typeof PlotMeasurementLayer>[0]> = {}) {
  return renderToStaticMarkup(
    <svg>
      <PlotMeasurementLayer
        measurements={[measurement({})]}
        elementById={new Map()}
        layerById={new Map([[1, layer({})]])}
        view="top"
        zoom={1}
        selectedMeasurementId={null}
        {...props}
      />
    </svg>,
  )
}

describe('PlotMeasurementLayer', () => {
  it('states the value in centimetres', () => {
    const html = render()
    expect(html).toContain('400')
    expect(html).toContain(' cm')
  })

  it('draws every measurement in one annotation ink, whatever its layer colour', () => {
    // Layer colour tells equipment apart; a dimension spanning two layers
    // could not honestly claim either, so it borrows neither.
    const html = render({
      measurements: [measurement({ id: 1, layer_id: 1 }), measurement({ id: 2, layer_id: 2, to: { u_cm: 900, v_cm: 0 } })],
      layerById: new Map([
        [1, layer({ id: 1, color: '#ef4444' })],
        [2, layer({ id: 2, color: '#22c55e' })],
      ]),
    })
    expect(html).not.toContain('#ef4444')
    expect(html).not.toContain('#22c55e')
    expect(html).toContain('#71717a')
  })

  it('draws only the measurements belonging to the view being shown', () => {
    const measurements = [
      measurement({ id: 1, view: 'top', to: { u_cm: 400, v_cm: 0 } }),
      measurement({ id: 2, view: 'front', to: { u_cm: 900, v_cm: 0 } }),
    ]
    expect(render({ measurements, view: 'top' })).toContain('400')
    expect(render({ measurements, view: 'top' })).not.toContain('900')
    expect(render({ measurements, view: 'front' })).toContain('900')
    expect(render({ measurements, view: 'front' })).not.toContain('400')
  })

  it('does not draw a measurement whose own layer is hidden', () => {
    expect(render({ layerById: new Map([[1, layer({ visible: false })]]) })).not.toContain('400')
  })

  it('does not draw a measurement anchored to something no longer shown', () => {
    // The equipment layer is hidden, so one end of this measurement refers to
    // something that is not on the drawing.
    const html = render({
      measurements: [measurement({ from: { element_id: 9, feature: 'centre' }, to: { u_cm: 400, v_cm: 0 } })],
      elementById: new Map([[9, element({ id: 9, layer_id: 2 })]]),
      layerById: new Map([
        [1, layer({ id: 1 })],
        [2, layer({ id: 2, visible: false })],
      ]),
    })
    expect(html).not.toContain('<line')
  })

  it('gives a selected measurement its grips at the desk', () => {
    expect(render({ selectedMeasurementId: 1 })).toContain('#6366f1')
  })

  it('gives the hand no grips at all', () => {
    // The phone reads a measurement and authors none, so there is nothing to
    // grab: no offset tab and no end grips.
    const html = render({ selectedMeasurementId: 1, isMobile: true })
    expect(html).not.toContain('#6366f1')
    expect(html).toContain('400')
  })

  it('takes the grips away on a locked layer but keeps the measurement readable', () => {
    const html = render({ selectedMeasurementId: 1, layerById: new Map([[1, layer({ locked: true })]]) })
    expect(html).not.toContain('#6366f1')
    expect(html).toContain('400')
  })
})
