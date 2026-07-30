import { describe, expect, it } from 'vitest'
import { firstMatch, focusOffset } from './canvasFocus'

const NODE_W = 200

/** A 375 px handset's canvas region, at 100 %. */
const phone = { zoom: 1, viewportW: 341, viewportH: 300, scrollLeft: 0, scrollTop: 0, nodeW: NODE_W, nodeH: 120 }

describe('firstMatch', () => {
  const layout = [
    { kind: 'channel', id: 1, x: 596, y: 24, name: 'SD10' },
    { kind: 'source', id: 0, x: 24, y: 24, name: 'Sources' },
    { kind: 'stagebox', id: 1, x: 330, y: 150, name: 'SB1' },
  ]

  it('takes layout order, not data order', () => {
    // Every node matches; the answer is the one nearest the top-left of the drawing,
    // which is not the one that happens to be first in the array.
    expect(firstMatch(layout, () => true)?.name).toBe('Sources')
  })

  it('finds a match that is nowhere near the start of the array', () => {
    expect(firstMatch(layout, (n) => n.name === 'SD10')?.id).toBe(1)
  })

  it('returns nothing for a term that matches nothing', () => {
    expect(firstMatch(layout, () => false)).toBeUndefined()
  })

  it('does not mutate the layout it was given', () => {
    const before = layout.map((n) => n.name)
    firstMatch(layout, () => true)
    expect(layout.map((n) => n.name)).toEqual(before)
  })
})

describe('focusOffset', () => {
  it('leaves the window alone when the node is already comfortably inside it', () => {
    // Typing a second character that still matches the same box must not jump the view.
    const at = focusOffset({ x: 60, y: 60 }, { ...phone, scrollLeft: 0, scrollTop: 0 })
    expect(at).toEqual({ left: 0, top: 0 })
  })

  it('centres a node that is off to the right', () => {
    // The desk lane at 100%: x 596, in a 341 px window showing 0–341.
    const at = focusOffset({ x: 596, y: 24 }, phone)
    expect(at.left).toBe(596 - (341 - 200) / 2)
  })

  it('clears the bottom for the inspector sheet', () => {
    // Without the sheet the node centres in 300 px; with 160 px of sheet it centres in
    // the 140 px that is left. To sit higher ON SCREEN the window scrolls FURTHER DOWN,
    // which is the sign that is easy to get backwards and costs a wrong direction.
    const open = focusOffset({ x: 24, y: 800 }, { ...phone, clearBottom: 160 })
    const shut = focusOffset({ x: 24, y: 800 }, phone)
    expect(open.top).toBeGreaterThan(shut.top)
    expect(open.top - shut.top).toBe(80)
  })

  it('counts a node hidden behind the sheet as not visible', () => {
    // A 120 px node at y 140 ends at 260: on screen in a 300 px window, and behind a
    // 160 px sheet. Selecting it must move the window — the case FR-019 exists for.
    const behind = { x: 24, y: 140 }
    expect(focusOffset(behind, { ...phone, clearBottom: 160 })).not.toEqual({ left: 0, top: 0 })
    expect(focusOffset(behind, phone)).toEqual({ left: 0, top: 0 })
  })

  it('clamps at the content edge rather than overshooting', () => {
    // The far-right node of an 820 px graph: centring it would ask for a scroll past the
    // end, which leaves a strip of nothing along the right edge.
    const at = focusOffset({ x: 596, y: 24 }, { ...phone, contentW: 820, contentH: 640 })
    expect(at.left).toBe(820 - 341)
    expect(at.left).toBeLessThan(596 - (341 - 200) / 2)
  })

  it('never asks for a negative scroll', () => {
    const at = focusOffset({ x: 0, y: 0 }, { ...phone, scrollLeft: 200, scrollTop: 200 })
    expect(at.left).toBe(0)
    expect(at.top).toBe(0)
  })

  it('scales the node with the zoom, not just its position', () => {
    // At 42% the same node is 84 px wide, so it centres differently from 200 px wide.
    const at = focusOffset({ x: 596, y: 24 }, { ...phone, zoom: 0.42 })
    expect(at.left).toBe(596 * 0.42 - (341 - 200 * 0.42) / 2)
  })

  it('treats an unknown node height as a point', () => {
    const noHeight = { ...phone, nodeH: undefined }
    expect(() => focusOffset({ x: 24, y: 24 }, noHeight)).not.toThrow()
  })
})
