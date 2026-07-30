import { describe, expect, it } from 'vitest'
import { parseFlowView } from './useFlowView'

/**
 * Only the parse is testable here — the harness renders to static markup and has no
 * DOM, so it has no `localStorage`. That is not a gap worth apologising for: the read
 * and write are four lines copied from `usePatchView`, and every way this hook can
 * actually hurt is a bad value reaching `scale()`.
 */
describe('parseFlowView', () => {
  it('round-trips a view it wrote', () => {
    expect(parseFlowView(JSON.stringify({ zoom: 0.42, panX: -120, panY: 30 }))).toEqual({
      zoom: 0.42,
      panX: -120,
      panY: 30,
    })
  })

  it('treats a device that has never opened the surface as absent', () => {
    // Not an error, and not a zero — the caller opens at fit, which is a different
    // thing from opening at a remembered 0,0.
    expect(parseFlowView(null)).toBeNull()
    expect(parseFlowView('')).toBeNull()
  })

  it('survives a value that is not this', () => {
    expect(parseFlowView('{ not json')).toBeNull()
    expect(parseFlowView('"flow"')).toBeNull()   // what usePatchView stores under a neighbouring key
    expect(parseFlowView('null')).toBeNull()
    expect(parseFlowView('[0.42, 0, 0]')).toBeNull()
  })

  it('rejects a partial view rather than filling the gaps in', () => {
    // A remembered zoom with no pan is not half a view, it is a view whose pan would
    // silently become undefined and then NaN one arithmetic step later.
    expect(parseFlowView(JSON.stringify({ zoom: 0.42 }))).toBeNull()
    expect(parseFlowView(JSON.stringify({ panX: 10, panY: 10 }))).toBeNull()
    expect(parseFlowView(JSON.stringify({ zoom: '0.42', panX: 0, panY: 0 }))).toBeNull()
  })

  it('rejects a zoom that would render nothing', () => {
    // scale(0) is a content box of nothing and NaN scroll offsets; scale(NaN) is a
    // canvas that never appears. Both are recoverable only by clearing storage by hand.
    expect(parseFlowView(JSON.stringify({ zoom: 0, panX: 0, panY: 0 }))).toBeNull()
    expect(parseFlowView(JSON.stringify({ zoom: -1, panX: 0, panY: 0 }))).toBeNull()
    expect(parseFlowView('{"zoom":null,"panX":0,"panY":0}')).toBeNull()
  })

  it('keeps a negative pan, which is the whole point of the plane', () => {
    // A node placed left of the sources is legal now, so a view looking at it is too.
    expect(parseFlowView(JSON.stringify({ zoom: 1, panX: -400, panY: -80 }))).toEqual({
      zoom: 1,
      panX: -400,
      panY: -80,
    })
  })
})
