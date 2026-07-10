export const API_BASE = 'http://localhost:7331/api/v1'
const BASE = API_BASE

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`
    try {
      const data = (await response.json()) as { error?: string }
      if (data.error) message = data.error
    } catch {
      // no-op
    }
    throw new Error(message)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })
  return parseResponse<T>(response)
}

/**
 * GET helper that forwards TanStack Query's AbortSignal, so a query that
 * gets invalidated again before its first fetch resolves properly
 * cancels the outdated request instead of leaving it in flight. Without
 * this, two overlapping GETs to the same query key can resolve out of
 * order — an old response landing after a newer one silently reverts a
 * just-saved change. The output graph invalidates ['audio-patch', id]
 * very frequently (every cable/device/position edit), which is exactly
 * the shape of traffic that triggers this.
 */
export function get<T>(path: string, signal?: AbortSignal) {
  return request<T>(path, { signal })
}
