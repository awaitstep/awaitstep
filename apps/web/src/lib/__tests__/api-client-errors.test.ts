import { afterEach, describe, expect, it, vi } from 'vitest'
import { request, type ApiError } from '../api-client'

afterEach(() => vi.restoreAllMocks())

function failWith(status: number, body: string) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status }))
}

async function caught(): Promise<ApiError> {
  try {
    await request('/workflows/wf/source')
  } catch (error) {
    return error as ApiError
  }
  throw new Error('expected the request to fail')
}

describe('ApiError diagnostics', () => {
  it('keeps the findings a failed read lists, with the node each names', async () => {
    failWith(
      422,
      JSON.stringify({
        error: 'Bundle validation failed',
        diagnostics: [
          { source: 'library', message: 'Unknown custom node', nodeId: 'say_hello' },
          { source: 'provider', message: 'Codegen not yet implemented' },
          { message: 'no source' },
          'junk',
        ],
      }),
    )
    const error = await caught()
    expect(error.status).toBe(422)
    expect(error.diagnostics).toEqual([
      { source: 'library', message: 'Unknown custom node', nodeId: 'say_hello' },
      { source: 'provider', message: 'Codegen not yet implemented' },
    ])
  })

  it('has none when the response lists none or is not JSON', async () => {
    failWith(400, JSON.stringify({ error: 'Bad' }))
    expect((await caught()).diagnostics).toEqual([])
    failWith(502, '<html>Bad gateway</html>')
    expect((await caught()).diagnostics).toEqual([])
  })
})
