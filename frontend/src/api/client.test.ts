import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from './client'

function mockResponse(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

describe('request 401 handling', () => {
  let windowStub: { location: { href: string } }

  beforeEach(() => {
    windowStub = { location: { href: '' } }
    vi.stubGlobal('window', windowStub)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('redirects to /login on a 401 from a non-auth endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(401, { error: 'not authenticated' })))

    await expect(request('/events')).rejects.toThrow()
    expect(windowStub.location.href).toBe('/login')
  })

  it('does not redirect on a 401 from /auth/me', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(401, { error: 'not authenticated' })))

    await expect(request('/auth/me')).rejects.toThrow()
    expect(windowStub.location.href).toBe('')
  })

  it('does not redirect on a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(200, { ok: true })))

    await request('/events')
    expect(windowStub.location.href).toBe('')
  })
})
