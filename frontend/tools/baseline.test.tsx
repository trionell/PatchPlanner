/* TEMPORARY — Wave 6c task T002/T003. Captures the desktop markup of the two shared
   components this slice touches, so the change can be diffed rather than trusted.
   Deleted before the slice lands. */
import { writeFileSync, mkdirSync } from 'node:fs'
import { describe, it } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { SignalFlowStatusRail } from '../src/components/event/SignalFlowStatusRail'
import { StagePlotInspector } from '../src/components/event/StagePlotInspector'
import type { StagePlotElement, StagePlotElementKind, StagePlotLayer } from '../src/types'

const OUT = process.env.BASELINE_DIR ?? '/tmp/6c-baseline'

const layers: StagePlotLayer[] = [
  { id: 1, plot_id: 1, name: 'Band', sort_order: 0, color: '#38bdf8', visible: true, locked: false },
  { id: 2, plot_id: 1, name: 'Lighting', sort_order: 1, visible: true, locked: true },
]

function element(kind: StagePlotElementKind, over: Partial<StagePlotElement> = {}): StagePlotElement {
  return {
    id: 7,
    plot_id: 1,
    layer_id: 1,
    kind,
    shape_kind: kind === 'shape' ? 'rect' : undefined,
    icon: kind === 'resource' ? 'riser' : undefined,
    name: 'Riser B',
    x_cm: 120,
    y_cm: 240,
    z_cm: 0,
    width_cm: 200,
    depth_cm: 100,
    height_cm: 40,
    rotation_deg: 15,
    tilt_deg: 0,
    notes: '2 × 1 m',
    links: [],
    ...over,
  }
}

const noop = () => {}

function wrap(node: React.ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

describe('baseline capture', () => {
  it('SignalFlowStatusRail — six desktop states', () => {
    const states: string[] = []
    for (const gaps of [0, 1, 3]) {
      for (const withFirst of [false, true]) {
        states.push(
          `--- gaps=${gaps} firstGap=${withFirst}\n` +
            renderToStaticMarkup(
              <SignalFlowStatusRail
                inputs={16}
                outputs={8}
                hops={42}
                gaps={gaps}
                firstGap={withFirst ? 'ch 9 Bass DI has no source' : undefined}
                filter={null}
                onFilterChange={noop}
              />,
            ),
          `--- gaps=${gaps} firstGap=${withFirst} FILTER-ON\n` +
            renderToStaticMarkup(
              <SignalFlowStatusRail
                inputs={16}
                outputs={8}
                hops={42}
                gaps={gaps}
                firstGap={withFirst ? 'ch 9 Bass DI has no source' : undefined}
                filter="gaps"
                onFilterChange={noop}
              />,
            ),
        )
      }
    }
    mkdirSync(OUT, { recursive: true })
    writeFileSync(`${OUT}/signal-flow-rail.txt`, states.join('\n\n'))
  })

  it('StagePlotInspector — every kind, locked and read-only', () => {
    const states: string[] = []
    for (const kind of ['shape', 'resource', 'truss', 'fixture'] as StagePlotElementKind[]) {
      for (const layerId of [1, 2]) {
        for (const readOnly of [false, true]) {
          states.push(
            `--- kind=${kind} layer=${layerId} readOnly=${readOnly}\n` +
              wrap(
                <StagePlotInspector
                  eventId={1}
                  element={element(kind, { layer_id: layerId })}
                  layers={layers}
                  onUpdate={noop}
                  onDuplicate={noop}
                  onDelete={noop}
                  onAddLink={noop}
                  onReorderLink={noop}
                  onDeleteLink={noop}
                  readOnly={readOnly}
                />,
              ),
          )
        }
      }
    }
    states.push('--- element=null\n' + wrap(
      <StagePlotInspector
        eventId={1}
        element={null}
        layers={layers}
        onUpdate={noop}
        onDuplicate={noop}
        onDelete={noop}
        onAddLink={noop}
        onReorderLink={noop}
        onDeleteLink={noop}
      />,
    ))
    mkdirSync(OUT, { recursive: true })
    writeFileSync(`${OUT}/stage-plot-inspector.txt`, states.join('\n\n'))
  })
})
