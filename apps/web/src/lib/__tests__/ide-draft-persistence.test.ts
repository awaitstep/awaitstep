import { describe, expect, it, vi } from 'vitest'
import {
  DRAFT_RETENTION_MS,
  clearAllDrafts,
  draftKey,
  loadDrafts,
  mergeRestoredDrafts,
  sweepExpiredDrafts,
  saveDrafts,
  type DraftStorage,
  type StoredDrafts,
} from '../ide/draft-persistence'

function memoryStorage(): DraftStorage & { data: Map<string, StoredDrafts> } {
  const data = new Map<string, StoredDrafts>()
  return {
    data,
    get: async (key) => data.get(key),
    set: async (key, value) => void data.set(key, value),
    del: async (key) => void data.delete(key),
    keys: async () => [...data.keys()],
  }
}

const drafts = {
  'a.ts': { source: 'edit a', baseHash: 'ha' },
  'lib/b.ts': { source: 'edit b', baseHash: 'hb' },
}

describe('saveDrafts / loadDrafts', () => {
  it('round-trips the drafts for one user and workflow', async () => {
    const storage = memoryStorage()
    await saveDrafts(storage, 'u1', 'wf1', drafts, 1000)
    expect(await loadDrafts(storage, 'u1', 'wf1', 2000)).toEqual(drafts)
  })

  it('never shows one account’s drafts to another or to another workflow', async () => {
    const storage = memoryStorage()
    await saveDrafts(storage, 'u1', 'wf1', drafts, 1000)
    expect(await loadDrafts(storage, 'u2', 'wf1', 2000)).toBeNull()
    expect(await loadDrafts(storage, 'u1', 'wf2', 2000)).toBeNull()
  })

  it('removes the entry once nothing is unsaved, so a reload restores nothing', async () => {
    const storage = memoryStorage()
    await saveDrafts(storage, 'u1', 'wf1', drafts, 1000)
    await saveDrafts(storage, 'u1', 'wf1', {}, 2000)
    expect(storage.data.size).toBe(0)
    expect(await loadDrafts(storage, 'u1', 'wf1', 3000)).toBeNull()
  })

  it('drops drafts older than 14 days on read', async () => {
    const storage = memoryStorage()
    await saveDrafts(storage, 'u1', 'wf1', drafts, 0)
    expect(await loadDrafts(storage, 'u1', 'wf1', DRAFT_RETENTION_MS - 1)).toEqual(drafts)
    expect(await loadDrafts(storage, 'u1', 'wf1', DRAFT_RETENTION_MS + 1)).toBeNull()
    expect(storage.data.has(draftKey('u1', 'wf1'))).toBe(false)
  })
})

describe('clearAllDrafts', () => {
  it('removes every user’s and workflow’s drafts but nothing else', async () => {
    const storage = memoryStorage()
    await saveDrafts(storage, 'u1', 'wf1', drafts, 1)
    await saveDrafts(storage, 'u2', 'wf2', drafts, 1)
    storage.data.set('unrelated', { savedAt: 1, files: {} })
    await clearAllDrafts(storage)
    expect([...storage.data.keys()]).toEqual(['unrelated'])
  })
})

describe('mergeRestoredDrafts', () => {
  const baseline = new Map([
    ['a.ts', { source: 'base a', hash: 'ha' }],
    ['lib/b.ts', { source: 'base b', hash: 'hb-new' }],
  ])

  it('restores drafts that match their baseline hash without flagging them', () => {
    const result = mergeRestoredDrafts({ 'a.ts': drafts['a.ts'] }, baseline)
    expect(result.drafts).toEqual({ 'a.ts': drafts['a.ts'] })
    expect(result.changedOnServer).toEqual([])
  })

  it('still restores a draft whose file changed on the server, and names it', () => {
    const result = mergeRestoredDrafts(drafts, baseline)
    expect(Object.keys(result.drafts)).toEqual(['a.ts', 'lib/b.ts'])
    expect(result.changedOnServer).toEqual(['lib/b.ts'])
  })

  it('keeps a draft whose file was deleted meanwhile as a copy, and reports it', () => {
    const gone = { source: 'x', baseHash: 'hg' }
    const result = mergeRestoredDrafts({ 'gone.ts': gone }, baseline)
    expect(result.drafts).toEqual({ 'gone.ts': gone })
    expect(result.deleted).toEqual(['gone.ts'])
    expect(result.changedOnServer).toEqual([])
  })

  it('drops a draft of a never-stored file that is not in the project', () => {
    const result = mergeRestoredDrafts({ 'ghost.ts': { source: 'x', baseHash: null } }, baseline)
    expect(result.drafts).toEqual({})
    expect(result.deleted).toEqual([])
  })

  it('drops a draft that now equals the saved file', () => {
    const result = mergeRestoredDrafts({ 'a.ts': { source: 'base a', baseHash: 'old' } }, baseline)
    expect(result.drafts).toEqual({})
  })
})

describe('expiry sweep', () => {
  it('drops expired entries of other workflows and users when any drafts load', async () => {
    const storage = memoryStorage()
    await saveDrafts(storage, 'u2', 'never-reopened', drafts, 0)
    await saveDrafts(storage, 'u1', 'wf1', drafts, DRAFT_RETENTION_MS)
    await loadDrafts(storage, 'u1', 'wf1', DRAFT_RETENTION_MS + 10)
    expect([...storage.data.keys()]).toEqual([draftKey('u1', 'wf1')])
  })

  it('leaves fresh entries alone', async () => {
    const storage = memoryStorage()
    await saveDrafts(storage, 'u2', 'wf', drafts, 100)
    await sweepExpiredDrafts(storage, 200)
    expect(storage.data.size).toBe(1)
  })
})

describe('suspendDraftWrites', () => {
  it('turns later writes into no-ops, so a pending flush cannot undo a sign-out', async () => {
    vi.resetModules()
    const fresh = await import('../ide/draft-persistence')
    const storage = memoryStorage()
    fresh.suspendDraftWrites()
    await fresh.saveDrafts(storage, 'u1', 'wf1', drafts, 1)
    expect(storage.data.size).toBe(0)
  })
})
