import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RigRibbon, type RibbonNode } from './OverviewBands'

/**
 * The ribbon's geometry, pinned.
 *
 * Every node used to sit in its own `flex-1` wrapper with the run before it, so
 * the wrappers split the width equally and each run got whatever its node did
 * not — gaps that tightened rightward, and a first wrapper that claimed a share
 * while holding no run, which left the line starting in mid-air. None of that is
 * visible in a screenshot review; all of it is visible in the element order.
 *
 * Tests run without a DOM here, so these read the rendered markup: what matters
 * is that runs and nodes are *siblings*, alternating, never nested.
 */

const NODE = 'rounded-[7px]'

/** The order in which runs and nodes appear, ignoring everything else. */
function sequence(markup: string): string[] {
  return [...markup.matchAll(/rounded-\[7px\]|min-w-4/g)].map((match) => (match[0] === NODE ? 'node' : 'run'))
}

const three: RibbonNode[] = [
  { label: 'sources', value: 12, count: 12 },
  { label: 'console', value: 'SD10', count: 1, desk: true },
  { label: 'outputs', value: 8, count: 8 },
]

describe('RigRibbon', () => {
  it('puts a run between every pair of nodes, and nowhere else', () => {
    expect(sequence(renderToStaticMarkup(<RigRibbon nodes={three} />))).toEqual([
      'node',
      'run',
      'node',
      'run',
      'node',
    ])
  })

  it('starts at the first node — nothing claims width before it', () => {
    expect(sequence(renderToStaticMarkup(<RigRibbon label="Audio" nodes={three} />))[0]).toBe('node')
  })

  it('gives every run the same claim on the free space, and no node any', () => {
    const markup = renderToStaticMarkup(<RigRibbon nodes={three} />)
    // Two runs, both flex-1: the leftover width is split between them and only
    // them, which is what makes the gaps equal.
    expect([...markup.matchAll(/min-w-4[^"]*flex-1|flex-1[^"]*min-w-4/g)]).toHaveLength(2)
    // Three nodes, none of them growing or shrinking.
    expect([...markup.matchAll(/shrink-0 rounded-\[7px\]/g)]).toHaveLength(3)
  })

  it('draws a single node with no run at all', () => {
    expect(sequence(renderToStaticMarkup(<RigRibbon nodes={[three[0]]} />))).toEqual(['node'])
  })

  it('withholds itself entirely when every node is empty', () => {
    const empty: RibbonNode[] = [
      { label: 'sources', value: 0, count: 0 },
      { label: 'outputs', value: 0, count: 0 },
    ]
    expect(renderToStaticMarkup(<RigRibbon label="Audio" nodes={empty} />)).toBe('')
  })

  it('drops an empty node without leaving its run behind', () => {
    const withGap: RibbonNode[] = [
      { label: 'sources', value: 12, count: 12 },
      { label: 'multis', value: 0, count: 0 },
      { label: 'outputs', value: 8, count: 8 },
    ]
    expect(sequence(renderToStaticMarkup(<RigRibbon nodes={withGap} />))).toEqual(['node', 'run', 'node'])
  })

  it('pulses only when asked, staggered along the runs', () => {
    const still = renderToStaticMarkup(<RigRibbon label="Audio" nodes={three} />)
    expect(still).not.toContain('pp-run')
    expect(still).not.toContain('--pp-delay')

    // The dashboard's copy. Overview is a working screen and must not move
    // (design/tokens.md §6) — one prop apart, not one component apart.
    const alive = renderToStaticMarkup(<RigRibbon nodes={three} pulse />)
    expect([...alive.matchAll(/pp-run/g)]).toHaveLength(2)
    expect(alive).toContain('--pp-delay:0.25s')
    expect(alive).toContain('--pp-delay:0.5s')
  })
})
