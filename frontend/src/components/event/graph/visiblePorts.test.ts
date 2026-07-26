import { describe, expect, it } from 'vitest'
import { visiblePorts } from './visiblePorts'

describe('visiblePorts', () => {
  it('hides nothing at or under the limit', () => {
    expect(visiblePorts([1, 2, 3], 8)).toEqual({ shown: [1, 2, 3], hidden: 0 })
    expect(visiblePorts([1, 2, 3, 4, 5, 6, 7, 8], 8)).toEqual({ shown: [1, 2, 3, 4, 5, 6, 7, 8], hidden: 0 })
  })

  it('says "1" one over the limit rather than rounding it away', () => {
    const { shown, hidden } = visiblePorts([1, 2, 3, 4, 5, 6, 7, 8, 9], 8)
    expect(shown).toHaveLength(8)
    expect(hidden).toBe(1)
  })

  it('keeps a 32-jack stagebox to the limit plus a count', () => {
    const jacks = Array.from({ length: 32 }, (_, i) => i)
    const { shown, hidden } = visiblePorts(jacks, 8)
    expect(shown).toHaveLength(8)
    expect(hidden).toBe(24)
  })
})
