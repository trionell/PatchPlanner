import { afterEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PatchStatusRail } from './PatchStatusRail'
import { EquipmentStatusRail } from './EquipmentStatusRail'
import type { EquipmentRow } from '../../lib/equipmentRows'
import type { PatchStatus } from '../../lib/patchCapacity'

/**
 * The strip's phone form (Wave 6b).
 *
 * What has to be true is not how it looks — the derivation, the words and the tints are
 * the desktop's and do not change with width (P9) — but **what element it is**. On a
 * phone the strip is the control, because the desktop's `h-6` filter button is a 24px
 * target in the hand and giving it 44px would double the height of the one element on
 * the one surface where height is rows (audit.md M3, patterns.md §7b).
 *
 * Two mistakes are possible and both are invisible in a screenshot: a strip that is a
 * button when it has nothing to filter to, and a strip that is a button for a role that
 * cannot act on what it reports. Both are pinned here.
 *
 * The desktop return is not asserted in this file. It was verified byte-identical
 * across all eleven rail states by rendering every state before and after the change and
 * diffing the markup (research.md R10) — a stronger check than any assertion here, and
 * one that does not need re-stating as a test nobody would update.
 */

const setWidth = (mobile: boolean) => {
  // No DOM in this project's tests, so `useIsMobile`'s query is answered directly.
  ;(globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: mobile }) }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

const status: PatchStatus = {
  rowCount: 16,
  consoleLabels: ['SD10 16/96 ch'],
  boxes: [],
  cablesPicked: 14,
  gaps: ['Ch 16 Playback has no source'],
  overCapacity: [],
}
const clean: PatchStatus = { ...status, gaps: [] }

const overOwned = [
  { source: 'owned', name: 'SM58', type: 'mic', qty: 12, have: 8, over: true },
] as unknown as EquipmentRow[]

describe('the strip on a phone', () => {
  it('P4 · is the control when there is something to filter to', () => {
    setWidth(true)
    const markup = renderToStaticMarkup(
      <PatchStatusRail status={status} noun="channel" onShowGaps={() => {}} gapsOnly={false} />,
    )
    expect(markup.startsWith('<button')).toBe(true)
    expect(markup).toContain('min-h-[44px]')
    expect(markup).toContain('Show only gaps')
  })

  it('P5 · is a sentence when the state has nothing to filter to', () => {
    setWidth(true)
    const markup = renderToStaticMarkup(<PatchStatusRail status={clean} noun="channel" onShowGaps={() => {}} />)
    expect(markup.startsWith('<div')).toBe(true)
    expect(markup).not.toContain('<button')
    expect(markup).toContain('complete')
  })

  it('P5 · is a sentence for a role that was given no handler', () => {
    setWidth(true)
    const markup = renderToStaticMarkup(<PatchStatusRail status={status} noun="channel" />)
    expect(markup.startsWith('<div')).toBe(true)
    expect(markup).not.toContain('<button')
  })

  it('takes the phone’s text and drops the desktop’s 11px', () => {
    setWidth(true)
    const markup = renderToStaticMarkup(<PatchStatusRail status={status} noun="channel" onShowGaps={() => {}} />)
    expect(markup).toContain('text-xs')
    expect(markup).not.toContain('text-[11px]')
  })

  it('does not offer Open Rig, whose drawer a phone cannot open yet', () => {
    setWidth(true)
    const over: PatchStatus = { ...clean, overCapacity: ['SD10 is over capacity'] }
    const markup = renderToStaticMarkup(<PatchStatusRail status={over} noun="channel" onOpenRig={() => {}} />)
    expect(markup).not.toContain('Open Rig')
  })

  it('P4 · the same shape on a rail that is not the patch', () => {
    setWidth(true)
    const markup = renderToStaticMarkup(
      <EquipmentStatusRail rows={overOwned} filter={null} onFilterChange={() => {}} />,
    )
    expect(markup.startsWith('<button')).toBe(true)
    expect(markup).toContain('Show only problems')
  })

  it('P4 · is a div on a desktop, with its own control inside it', () => {
    setWidth(false)
    const markup = renderToStaticMarkup(
      <PatchStatusRail status={status} noun="channel" onShowGaps={() => {}} gapsOnly={false} />,
    )
    expect(markup.startsWith('<div')).toBe(true)
    expect(markup).toContain('<button')
    expect(markup).toContain('text-[11px]')
  })
})
