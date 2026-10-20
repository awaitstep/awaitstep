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

  // Any in-progress event goes back into the buffer to be completed by the
  // next chunk — including one whose `event:` line arrived without its
  // `data:` line yet. Keeping only events that already had data dropped the
  // name whenever a chunk boundary fell between the two lines, and a
  // consumer that switches on the name then ignored the event entirely.
  if (current.data !== undefined || current.event !== undefined || current.id !== undefined) {
    const reconstructed: string[] = []
    if (current.event) reconstructed.push(`event: ${current.event}`)
    if (current.id) reconstructed.push(`id: ${current.id}`)
    if (current.data !== undefined) reconstructed.push(`data: ${current.data}`)
    return { events, buffer: reconstructed.join('\n') + '\n' + remaining }
  }

  return { events, buffer: remaining }
}
