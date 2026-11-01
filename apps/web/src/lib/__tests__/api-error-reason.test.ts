import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { failureLine } from '../action-toast'
import { request, type ApiError } from '../api-client'

function answer(status: number, body: string, type = 'application/json') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status, headers: { 'content-type': type } })),
  )
}

async function refusal(): Promise<ApiError> {
  try {
    await request('/anything')
  } catch (err) {
    return err as ApiError
  }
  throw new Error('expected a refusal')
}

afterEach(() => vi.unstubAllGlobals())

describe('a refusal’s reason', () => {
  it('is the JSON error the API sent', async () => {
    answer(429, JSON.stringify({ error: 'This invite was sent less than ten minutes ago' }))
    const err = await refusal()
    expect(err.hasReason).toBe(true)
    expect(failureLine(err, 'Couldn’t resend the invite')).toBe(
      'This invite was sent less than ten minutes ago',
    )
  })

  it('is never a proxy’s HTML page', async () => {
    answer(404, '<html><body><h1>404 Not Found</h1>nginx</body></html>', 'text/html')
    const err = await refusal()
    expect(err.hasReason).toBe(false)
    expect(err.message).toBe('Request failed (404)')
    expect(failureLine(err, 'Couldn’t resend the invite')).toBe('Couldn’t resend the invite')
  })

  it('is not an empty or reasonless JSON body', async () => {
    answer(400, '{}')
    expect(failureLine(await refusal(), 'Couldn’t save it')).toBe('Couldn’t save it')
  })
})
