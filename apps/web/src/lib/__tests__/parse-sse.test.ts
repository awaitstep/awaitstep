import { describe, it, expect } from 'vitest'
import { parseSseChunk } from '../parse-sse'

describe('parseSseChunk', () => {
  it('parses a single complete event', () => {
    const { events, buffer } = parseSseChunk('', 'data: {"stage":"INIT"}\n\n')
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('{"stage":"INIT"}')
    expect(buffer).toBe('')
  })

  it('parses multiple events in one chunk', () => {
    const chunk = 'data: {"a":1}\n\ndata: {"b":2}\n\n'
    const { events } = parseSseChunk('', chunk)
    expect(events).toHaveLength(2)
    expect(events[0].data).toBe('{"a":1}')
    expect(events[1].data).toBe('{"b":2}')
  })

  it('buffers incomplete events across chunks', () => {
    const r1 = parseSseChunk('', 'data: {"partial":')
    expect(r1.events).toHaveLength(0)

    const r2 = parseSseChunk(r1.buffer, 'true}\n\n')
    expect(r2.events).toHaveLength(1)
    expect(r2.events[0].data).toBe('{"partial":true}')
  })

  it('parses event and id fields', () => {
    const chunk = 'id: 1\nevent: progress\ndata: {"stage":"DEPLOYING"}\n\n'
    const { events } = parseSseChunk('', chunk)
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      id: '1',
      event: 'progress',
      data: '{"stage":"DEPLOYING"}',
    })
  })

  it('handles empty chunks', () => {
    const { events, buffer } = parseSseChunk('', '')
    expect(events).toHaveLength(0)
    expect(buffer).toBe('')
  })
})
