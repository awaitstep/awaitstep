export interface SseEvent {
  event?: string
  data: string
  id?: string
}

/**
 * Parse a chunk of SSE text into discrete events, returning any incomplete
 * trailing text as the new buffer value.
 */
export function parseSseChunk(
  buffer: string,
  chunk: string,
): { events: SseEvent[]; buffer: string } {
  const text = buffer + chunk
  const lines = text.split('\n')
  const remaining = lines.pop() ?? ''

  const events: SseEvent[] = []
  let current: Partial<SseEvent> = {}

  for (const line of lines) {
    if (line === '') {
      if (current.data !== undefined) {
        events.push({ data: current.data, event: current.event, id: current.id })
      }
      current = {}
      continue
    }
    if (line.startsWith('data: ')) {
      current.data = (current.data ? current.data + '\n' : '') + line.slice(6)
    } else if (line.startsWith('event: ')) {
      current.event = line.slice(7)
    } else if (line.startsWith('id: ')) {
      current.id = line.slice(4)
    }
  }

  // If there's an in-progress event with data and no trailing blank line yet,
  // keep it in the buffer so it gets completed on the next chunk
  if (current.data !== undefined) {
    const reconstructed: string[] = []
    if (current.event) reconstructed.push(`event: ${current.event}`)
    if (current.id) reconstructed.push(`id: ${current.id}`)
    reconstructed.push(`data: ${current.data}`)
    return { events, buffer: reconstructed.join('\n') + '\n' + remaining }
  }

  return { events, buffer: remaining }
}
