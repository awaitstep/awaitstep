// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DRAFT_RETENTION_MS, type StoredDrafts } from '../../lib/ide/draft-persistence'

const TS = 'awaitstep-test-session'
const QT = 'awaitstep-quick-test'

class FakeChannel {
  static all: FakeChannel[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  constructor(public name: string) {
    FakeChannel.all.push(this)
  }
  postMessage() {}
  close() {}
  /** What another tab's postMessage would do here. */
  static receive(data: unknown) {
    for (const c of FakeChannel.all) c.onmessage?.({ data } as MessageEvent)
  }
}

async function load() {
  vi.resetModules()
  const remembered = await import('../remembered-inputs')
  const session = await import('../test-session-store')
  const quick = await import('../quick-test-store')
  return { remembered, session, quick }
}

function seed(owner: unknown, savedAt: number | undefined) {
  const env = { ...(owner !== undefined && { owner }), ...(savedAt !== undefined && { savedAt }) }
  localStorage.setItem(
    TS,
    JSON.stringify({ state: { ...env, payloads: { wf: '{"token":"a"}' } }, version: 0 }),
  )
  localStorage.setItem(
    QT,
    JSON.stringify({ state: { ...env, remembered: { k: { inputs: '{"t":1}' } } }, version: 0 }),
  )
}

beforeEach(() => {
  localStorage.clear()
  FakeChannel.all = []
  vi.stubGlobal('BroadcastChannel', FakeChannel)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('sign-out in another tab', () => {
  it('leaves both keys empty when this tab sets state afterwards (BroadcastChannel)', async () => {
    const { remembered, session, quick } = await load()
    remembered.reconcileRememberedOwner('u1')
    session.useTestSessionStore.getState().setPayload('wf', '{"token":"secret"}')
    quick.useQuickTestStore.getState().setField('k', 'inputs', '{"token":"secret"}')
    expect(localStorage.getItem(TS)).not.toBeNull()

    FakeChannel.receive('signed-out')
    expect(localStorage.getItem(TS)).toBeNull()
    expect(localStorage.getItem(QT)).toBeNull()
    expect(session.useTestSessionStore.getState().payloads).toEqual({})
    expect(quick.useQuickTestStore.getState().remembered).toEqual({})

    // The running session's stream retrying: no write may come back.
    session.useTestSessionStore.getState().setStreamError('s1', 'Lost the log stream')
    session.useTestSessionStore.getState().setPayload('wf', '{"token":"again"}')
    quick.useQuickTestStore.getState().setField('k', 'inputs', 'x')
    expect(localStorage.getItem(TS)).toBeNull()
    expect(localStorage.getItem(QT)).toBeNull()
  })

  it('also hears it as a storage event where there is no BroadcastChannel', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const { remembered, session } = await load()
    remembered.reconcileRememberedOwner('u1')
    session.useTestSessionStore.getState().setPayload('wf', '{"token":"secret"}')

    window.dispatchEvent(
      new StorageEvent('storage', { key: 'awaitstep-signed-out', newValue: '123' }),
    )
    session.useTestSessionStore.getState().setStreamError('s1', 'x')
    expect(localStorage.getItem(TS)).toBeNull()
    expect(session.useTestSessionStore.getState().payloads).toEqual({})
  })

  it('ignores unrelated storage events and the signal being cleared', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const { remembered, session } = await load()
    remembered.reconcileRememberedOwner('u1')
    session.useTestSessionStore.getState().setPayload('wf', '{}')
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'awaitstep-signed-out', newValue: null }),
    )
    window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: '1' }))
    session.useTestSessionStore.getState().setPayload('wf', '{"a":1}')
    expect(localStorage.getItem(TS)).not.toBeNull()
  })

  it('suspends draft writes on the same signal', async () => {
    vi.resetModules()
    const drafts = await import('../../lib/ide/draft-persistence')
    const data = new Map<string, StoredDrafts>()
    const storage = {
      get: async (k: string) => data.get(k),
      set: async (k: string, v: StoredDrafts) => void data.set(k, v),
      del: async (k: string) => void data.delete(k),
      keys: async () => [...data.keys()],
    }
    const files = { 'a.ts': { source: 's', baseHash: null } }
    await drafts.saveDrafts(storage, 'u1', 'wf', files as never, 1)
    expect(data.size).toBe(1)
    data.clear()

    FakeChannel.receive('signed-out')
    await drafts.saveDrafts(storage, 'u1', 'wf', files as never, 2)
    expect(data.size).toBe(0)
  })
})

describe('whose remembered values these are', () => {
  it('wipes another user’s stored values when the user becomes known', async () => {
    const { remembered, session, quick } = await load()
    seed('u1', Date.now())
    // Hydration happened before the id was known only for stores loaded earlier;
    // load again so these hydrate from the seeded data.
    const again = await load()
    expect(again.session.useTestSessionStore.getState().payloads.wf).toBeDefined()
    again.remembered.reconcileRememberedOwner('u2')
    expect(localStorage.getItem(TS)).toBeNull()
    expect(localStorage.getItem(QT)).toBeNull()
    expect(again.session.useTestSessionStore.getState().payloads).toEqual({})
    expect(again.quick.useQuickTestStore.getState().remembered).toEqual({})
    void remembered
    void session
    void quick
  })

  it('keeps the same user’s fresh values', async () => {
    seed('u1', Date.now())
    const { remembered, session, quick } = await load()
    remembered.reconcileRememberedOwner('u1')
    expect(session.useTestSessionStore.getState().payloads.wf).toBe('{"token":"a"}')
    expect(quick.useQuickTestStore.getState().remembered.k?.inputs).toBe('{"t":1}')
    expect(localStorage.getItem(TS)).not.toBeNull()
  })

  it('does not load another user’s values into a store that hydrates after the user is known', async () => {
    vi.resetModules()
    const remembered = await import('../remembered-inputs')
    remembered.reconcileRememberedOwner('u2')
    seed('u1', Date.now())
    const session = await import('../test-session-store')
    const quick = await import('../quick-test-store')
    expect(session.useTestSessionStore.getState().payloads).toEqual({})
    expect(quick.useQuickTestStore.getState().remembered).toEqual({})
  })

  it('wipes values older than the draft retention', async () => {
    seed('u1', Date.now() - DRAFT_RETENTION_MS - 1000)
    const { remembered, session } = await load()
    expect(session.useTestSessionStore.getState().payloads).toEqual({})
    remembered.reconcileRememberedOwner('u1')
    expect(localStorage.getItem(TS)).toBeNull()
    expect(localStorage.getItem(QT)).toBeNull()
  })

  it('wipes old-format data that has no owner', async () => {
    seed(undefined, undefined)
    const { remembered, session, quick } = await load()
    expect(session.useTestSessionStore.getState().payloads).toEqual({})
    remembered.reconcileRememberedOwner('u1')
    expect(localStorage.getItem(TS)).toBeNull()
    expect(localStorage.getItem(QT)).toBeNull()
    expect(quick.useQuickTestStore.getState().remembered).toEqual({})
  })

  it('wipes what the previous user typed in this page when the user changes', async () => {
    const { remembered, session } = await load()
    remembered.reconcileRememberedOwner('u1')
    session.useTestSessionStore.getState().setPayload('wf', '{"token":"a"}')
    remembered.reconcileRememberedOwner('u2')
    expect(session.useTestSessionStore.getState().payloads).toEqual({})
    expect(localStorage.getItem(TS)).toBeNull()
  })

  it('stamps what it persists with the owner and a save time', async () => {
    const { remembered, session } = await load()
    remembered.reconcileRememberedOwner('u1')
    session.useTestSessionStore.getState().setPayload('wf', '{}')
    const saved = JSON.parse(localStorage.getItem(TS)!).state
    expect(saved.owner).toBe('u1')
    expect(typeof saved.savedAt).toBe('number')
  })
})

describe('a write that fails', () => {
  it('removes the remembered key rather than leaving the older value', async () => {
    const { remembered, session } = await load()
    remembered.reconcileRememberedOwner('u1')
    session.useTestSessionStore.getState().setPayload('wf', '{"token":"old"}')
    expect(localStorage.getItem(TS)).toContain('old')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    session.useTestSessionStore.getState().setPayload('wf', '{}')
    expect(localStorage.getItem(TS)).toBeNull()
  })

  it('keeps the old value for ordinary persisted state', async () => {
    vi.resetModules()
    const { browserStorage } = await import('../ssr-safe-storage')
    localStorage.setItem('layout', 'old')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    browserStorage().setItem('layout', 'new')
    expect(localStorage.getItem('layout')).toBe('old')
  })
})
