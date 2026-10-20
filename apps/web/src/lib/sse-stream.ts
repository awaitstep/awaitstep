import { parseSseChunk, type SseEvent } from './parse-sse'

/**
 * Reads a server-sent event body to completion, handing each event to
 * `onEvent`. Returns when the server closes the stream or the signal aborts.
 *
 * The read loop is the same everywhere; what differs is what the events mean.
 * Keeping it in one place is also the only way the decoder's trailing-chunk
 * handling stays right in every copy.
 */
export async function readSseStream(
  response: Response,
  onEvent: (event: SseEvent) => void | boolean,
  signal?: AbortSignal,
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read()
      if (done) return
      const parsed = parseSseChunk(buffer, decoder.decode(value, { stream: true }))
      buffer = parsed.buffer
      for (const event of parsed.events) {
        // A handler returning false means it is finished with the stream.
        if (onEvent(event) === false) return
      }
    }
  } finally {
    reader.cancel().catch(() => {
      // The stream is already going away; nothing to recover.
    })
  }
}

/**
 * How long to wait before reconnecting after the nth consecutive failure.
 * Capped, because a stream that cannot be re-established should keep costing
 * one request every few seconds rather than hammering the API.
 */
export function reconnectDelay(attempt: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt - 1))
}
