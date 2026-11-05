import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSearchClient, SEARCH_TIMEOUT_MS } from '../ide/search-client'
import type { SearchFile, SearchOptions } from '../ide/search'
import { FakeSearchWorker } from './fixtures/search/fake-worker'

const files: SearchFile[] = [{ path: 'a.ts', generated: false, source: 'hello world' }]
const hello: SearchOptions = {
  query: 'hello',
  caseSensitive: false,
  wholeWord: false,
  regex: false,
}
const world: SearchOptions = { ...hello, query: 'world' }

function client() {
  return createSearchClient(() => new FakeSearchWorker())
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeSearchWorker.reset()
})
afterEach(() => vi.useRealTimers())

describe('createSearchClient', () => {
  it('answers a search through the worker', async () => {
    const outcome = await client().search(files, hello)
    expect(outcome).toMatchObject({ kind: 'results', results: { total: 1 } })
  })

  it('reuses an idle worker and sends the files only once', async () => {
    const c = client()
    await c.search(files, hello)
    await c.search(files, world)
    expect(FakeSearchWorker.created).toHaveLength(1)
    const [first, second] = FakeSearchWorker.created[0]!.received
    expect(first!.files).toBe(files)
    expect(second!.files).toBeUndefined()
  })

  it('sends the files again when they change', async () => {
    const c = client()
    await c.search(files, hello)
    const edited = [{ ...files[0]!, source: 'hello again' }]
    await c.search(edited, hello)
    expect(FakeSearchWorker.created[0]!.received[1]!.files).toBe(edited)
  })

  it('stops a runaway search after two seconds and says it timed out', async () => {
    FakeSearchWorker.reset('hang')
    const c = client()
    const pending = c.search(files, hello)
    await vi.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS - 1)
    expect(FakeSearchWorker.created[0]!.terminated).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toEqual({ kind: 'timeout' })
    expect(FakeSearchWorker.created[0]!.terminated).toBe(true)
  })

  it('recovers after a timeout: the next search gets a fresh worker and the files again', async () => {
    FakeSearchWorker.reset('hang')
    const c = client()
    const stuck = c.search(files, hello)
    await vi.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS)
    await stuck
    FakeSearchWorker.respond = 'sync'
    const outcome = await c.search(files, world)
    expect(outcome).toMatchObject({ kind: 'results' })
    expect(FakeSearchWorker.created).toHaveLength(2)
    expect(FakeSearchWorker.created[1]!.received[0]!.files).toBe(files)
  })

  it('a new query replaces a running one: the old worker is stopped and the old promise resolves null', async () => {
    FakeSearchWorker.reset('hang')
    const c = client()
    const first = c.search(files, hello)
    FakeSearchWorker.respond = 'sync'
    const second = c.search(files, world)
    await expect(first).resolves.toBeNull()
    expect(FakeSearchWorker.created[0]!.terminated).toBe(true)
    await expect(second).resolves.toMatchObject({ kind: 'results', results: { total: 1 } })
    expect(FakeSearchWorker.created).toHaveLength(2)
  })

  it('the superseded search timer cannot time out the newer search', async () => {
    FakeSearchWorker.reset('hang')
    const c = client()
    void c.search(files, hello)
    await vi.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS - 100)
    FakeSearchWorker.respond = 'sync'
    const second = c.search(files, world)
    await vi.advanceTimersByTimeAsync(200)
    await expect(second).resolves.toMatchObject({ kind: 'results' })
  })

  it('dispose terminates the worker and settles a running search with null', async () => {
    FakeSearchWorker.reset('hang')
    const c = client()
    const pending = c.search(files, hello)
    c.dispose()
    await expect(pending).resolves.toBeNull()
    expect(FakeSearchWorker.created[0]!.terminated).toBe(true)
  })

  it('reports a worker error as a failure, not a timeout, instead of hanging', async () => {
    FakeSearchWorker.reset('hang')
    const c = client()
    const pending = c.search(files, hello)
    FakeSearchWorker.created[0]!.onerror?.(new Error('boom'))
    await expect(pending).resolves.toEqual({ kind: 'failed' })
  })
})
