import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MobileOverviewPanel } from './MobileOverviewPanel'
import type { EventSummary } from '../../lib/eventSummary'

/**
 * Overview's phone composition (Wave 6c, audit.md M9).
 *
 * Three of the four things pinned here are invisible in a screenshot of a healthy event,
 * which is why they are here rather than in the handset pass:
 *
 * - **No tile draws a border, a radius or a ground of its own.** Five bordered tiles
 *   inside a frame is `M1` applied to something that is not a row, and it is the one
 *   mistake this composition is most likely to acquire later.
 * - **Undeclared is not zero.** An event has not got zero channels; it has no patch.
 * - **The strip is a sentence.** The first one in the application that is not a control,
 *   which `patterns.md` §7b has always allowed and nothing had demonstrated.
 */

function summaryOf(over: Partial<EventSummary> = {}): EventSummary {
  return {
    readiness: [
      { area: 'audio', tab: 'audio-inputs', label: '3 gaps', tone: 'warn' },
      { area: 'lighting', tab: 'lighting-rig', label: 'addressed', tone: 'ok' },
      { area: 'rental', tab: 'rentals', label: '2 over stock', tone: 'error' },
      { area: 'equipment', tab: 'equipment', label: '12 lines', tone: 'ok' },
      { area: 'plots', tab: 'stage-plots', label: '2 plots', tone: 'ok' },
    ],
    ...over,
  }
}

function render(summary: EventSummary, onEdit?: () => void): string {
  return renderToStaticMarkup(
    <MobileOverviewPanel
      accessSubtitle="You are the owner · 2 contributors, 1 viewer"
      accessTitle="4 people have access"
      inventoryNote="Imported from LL.xlsx"
      inventoryName="Bluebox 2026"
      meta={['Created 2026-07-01']}
      onEdit={onEdit}
      onOpenAccess={() => {}}
      onOpenInventory={() => {}}
      onOpenTab={() => {}}
      subtitle="Kulturhuset · 12–14 Aug 2026"
      summary={summary}
    />,
  )
}

describe('MobileOverviewPanel', () => {
  it('the figures are not cards: hairlines only, no border, radius or ground', () => {
    const markup = render(summaryOf({ inputChannels: 16, outputChannels: 8, fixtures: 24 }))
    // The figures grid alone: the ribbons below it are drawings and their nodes
    // legitimately carry a border (patterns.md §7f).
    const grid = markup.slice(markup.indexOf('grid grid-cols-2'), markup.indexOf('pt-2.5'))
    expect(grid).not.toContain('rounded-md')
    expect(grid).not.toContain('bg-zinc-900')
    expect(grid).not.toContain('border border-')
  })

  it('the countdown spans both columns, and is the only figure that does', () => {
    const markup = render(summaryOf({ daysToLoadIn: 12 }))
    expect(markup.match(/col-span-2/g)).toHaveLength(1)
    // …and it is set larger than the four quantities beside it.
    expect(markup).toContain('text-[34px]')
    expect(markup.match(/text-\[26px\]/g)).toHaveLength(4)
  })

  it('the column divider is on the right column only', () => {
    // The countdown spans, so the left column is the *even* child — inferring it from
    // `nth-child(odd)` draws the divider down the panel's own edge instead.
    const markup = render(summaryOf({ inputChannels: 16, fixtures: 24, cablesPicked: 38 }))
    // Four quantity tiles, two of them in the right column — so exactly two dividers.
    expect(markup.match(/pb-2\.5 pt-2\.5 border-l/g)).toHaveLength(2)
    expect(markup.match(/pb-2\.5 pt-2\.5(?! border-l)/g)).toHaveLength(2)
  })

  it('undeclared is a dash, never a zero', () => {
    // Nothing loaded: no patch, no rig, no order.
    const markup = render(summaryOf())
    expect(markup).toContain('—')
    expect(markup).not.toContain('>0<')
  })

  it('every readiness verdict is a 44px row that routes, in the summary’s own order', () => {
    const markup = render(summaryOf({ inputChannels: 16, outputChannels: 8 }))
    // Counted by the tone edge, which only a readiness row draws — the inventory
    // `CondensedListRow` below them is a 44px row too.
    expect(markup.match(/w-\[3px\] shrink-0 bg-(emerald|amber|red|zinc)-\d+/g)).toHaveLength(5)
    expect(markup.indexOf('Audio')).toBeLessThan(markup.indexOf('Lighting'))
    expect(markup.indexOf('Rental')).toBeLessThan(markup.indexOf('Equipment'))
  })

  it('the strip names the areas that need attention and offers no filter', () => {
    const markup = render(summaryOf())
    expect(markup).toContain('2 need')
    expect(markup).toContain('Audio · Rental')
    // A chevron is what makes a strip a control (patterns.md §7b).
    const strip = markup.slice(markup.lastIndexOf('need'))
    expect(strip).not.toContain('lucide-chevron-right')
  })

  it('says so plainly when nothing needs attention', () => {
    const clear = summaryOf({
      readiness: [{ area: 'audio', tab: 'audio-inputs', label: 'routed', tone: 'ok' }],
    })
    expect(render(clear)).toContain('everything clear')
  })

  it('a role that cannot act gets no edit control at all, rather than a disabled one', () => {
    expect(render(summaryOf())).not.toContain('aria-label="Edit details"')
    expect(render(summaryOf(), () => {})).toContain('aria-label="Edit details"')
  })

  it('does not repeat the event’s name — the shell’s header carries it', () => {
    const markup = render(summaryOf())
    expect(markup).toContain('Kulturhuset · 12–14 Aug 2026')
    expect(markup).toContain('>Overview<')
  })
})
