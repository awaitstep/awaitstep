import { describe, it, expect } from 'vitest'
import { readSseStream, reconnectDelay } from '../sse-stream'
import type { SseEvent } from '../parse-sse'

function responseOf(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream)
}

describe('readSseStream', () => {
  it('delivers events split across chunks', async () => {
    const seen: SseEvent[] = []
    // The split lands mid-event: a reader that parsed each chunk alone would
    // lose it.
    await readSseStream(responseOf(['event: logs\ndata: {"a":', '1}\n\n']), (e) => {
      seen.push(e)
    })
    expect(seen).toEqual([{ event: 'logs', data: '{"a":1}', id: undefined }])
  })

  it('stops when the handler says it is finished', async () => {
    const seen: string[] = []
    await readSseStream(responseOf(['event: a\ndata: 1\n\nevent: b\ndata: 2\n\n']), (e) => {
      seen.push(e.event ?? '')
      return e.event !== 'a'
    })
    expect(seen).toEqual(['a'])
  })

  it('returns when the body ends', async () => {
    await expect(
      readSseStream(responseOf(['event: a\ndata: 1\n\n']), () => true),
    ).resolves.toBeUndefined()
  })

  it('does nothing for a response with no body', async () => {
    await expect(readSseStream(new Response(null), () => true)).resolves.toBeUndefined()
  })

  it('stops reading once the signal aborts', async () => {
    const controller = new AbortController()
    controller.abort()
    const seen: SseEvent[] = []
    await readSseStream(
      responseOf(['event: a\ndata: 1\n\n']),
      (e) => seen.push(e) > 0,
      controller.signal,
    )
    expect(seen).toEqual([])
  })
})

describe('reconnectDelay', () => {
  it('backs off and then holds', () => {
    // A stream that cannot be re-established should cost one request every
    // few seconds, not a tight loop.
    expect(reconnectDelay(1)).toBe(1_000)
    expect(reconnectDelay(2)).toBe(2_000)
    expect(reconnectDelay(5)).toBe(16_000)
    expect(reconnectDelay(99)).toBe(30_000)
  })

  it('treats a first failure as the first attempt', () => {
    expect(reconnectDelay(0)).toBe(1_000)
  })
})
