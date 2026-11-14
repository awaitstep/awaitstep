import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectFileConflictError, type SourceFile, type WritePrecondition } from '../api-client'
import { applyFileOps, deleteKey, fileOpLabel, type PendingFileOp } from '../ide/file-ops'
import { createPendingFileActions } from '../ide/pending-file-actions'
import { createProjectFileActions, type Notifier } from '../ide/project-actions'
import { persistedDrafts } from '../ide/draft-persistence'
import type { StepSaveOutcome } from '../ide/step-save'
import { useIdeStore } from '../../stores/ide-store'

function file(path: string, source: string, hash?: string): SourceFile {
  return { path, source, role: 'module', ...(hash && { hash }) }
}

/**
 * The Code view's actions over a fake server: the screen's baseline is the
 * stored files with the pending changes applied, as `useWorkspaceData` makes
 * it, and a refresh reads the server back.
 */
function setup() {
  let current = true
  const server = new Map<string, SourceFile>([
    ['lib/a.ts', file('lib/a.ts', 'a', 'ha')],
    ['lib/b.ts', file('lib/b.ts', 'b', 'hb')],
    ['lib/old/c.ts', file('lib/old/c.ts', 'c', 'hc')],
  ])
  let stored = new Map(server)
  const baseline = () => applyFileOps(stored, useIdeStore.getState().fileOps)
  let n = 0
  const client = {
    putProjectFile: vi.fn(
      async (_id: string, path: string, source: string, precondition: WritePrecondition) => {
        if ('ifNoneMatch' in precondition && server.has(path)) {
          throw new ProjectFileConflictError('exists', server.get(path)!.hash ?? null)
        }
        const hash = `h${++n}`
        server.set(path, file(path, source, hash))
        return { path, hash, size: source.length, updatedAt: 'now' }
      },
    ),
    deleteProjectFile: vi.fn(async (_id: string, path: string, ifMatch: string) => {
      // As the API: a missing file is a 404, a newer one a conflict.
      if (!server.has(path)) throw Object.assign(new Error('File not found'), { status: 404 })
      if (server.get(path)?.hash !== ifMatch) throw new ProjectFileConflictError('moved', null)
      server.delete(path)
    }),
    convertHandlers: vi.fn(),
  }
  const notify = { success: vi.fn(), error: vi.fn() } satisfies Notifier
  const commit = vi.fn(async () => undefined)
  const refresh = vi.fn(async () => {
    stored = new Map(server)
  })
  const pending = createPendingFileActions({
    workflowId: 'wf',
    client,
    notify,
    getBaseline: baseline,
    getStore: useIdeStore.getState,
    isCurrent: () => current,
    isStep: (path) => path.startsWith('steps/'),
  })
  const actions = createProjectFileActions({
    workflowId: 'wf',
    target: 'workflow',
    client,
    notify,
    getBaseline: baseline,
    getStore: useIdeStore.getState,
    getProjectPaths: () => new Set(baseline().keys()),
    ownerOf: (path) => (path.startsWith('steps/') ? 'step' : 'project'),
    saveSteps: vi.fn(async () => new Map<string, StepSaveOutcome>()),
    commit,
    refresh,
    canEdit: () => true,
    isCurrent: () => current,
    pending,
  })
  return {
    actions,
    pending,
    client,
    notify,
    commit,
    refresh,
    server,
    baseline,
    leave: () => {
      current = false
    },
  }
}

function labels() {
  return useIdeStore.getState().fileOps.map(fileOpLabel)
}

beforeEach(() => useIdeStore.getState().resetSession())

describe('Explorer changes wait for Save', () => {
  it('creates a file on screen only, opens it, and writes it on Save all', async () => {
    const h = setup()
    expect(await h.actions.createFile('lib/new.ts')).toBe(true)
    expect(h.client.putProjectFile).not.toHaveBeenCalled()
    expect(h.baseline().has('lib/new.ts')).toBe(true)
    expect(useIdeStore.getState().activePath).toBe('lib/new.ts')
    expect(labels()).toEqual(['Created lib/new.ts'])

    useIdeStore.getState().setDraft('lib/new.ts', 'export const x = 1', null)
    expect(await h.actions.saveAll()).toBe(1)
    expect(h.client.putProjectFile).toHaveBeenCalledWith('wf', 'lib/new.ts', 'export const x = 1', {
      ifNoneMatch: true,
    })
    expect(h.commit).toHaveBeenCalledTimes(1)
    expect(useIdeStore.getState().fileOps).toEqual([])
    // The draft builds on what was written, so the refetch finds it clean.
    expect(useIdeStore.getState().drafts['lib/new.ts']?.baseHash).toBe(
      h.server.get('lib/new.ts')!.hash,
    )
  })

  it('renames on screen, carrying the draft, and on Save writes the new path then deletes the old', async () => {
    const h = setup()
    useIdeStore.getState().openFile('lib/a.ts')
    useIdeStore.getState().setDraft('lib/a.ts', 'a edited', 'ha')
    expect(await h.actions.renameFile('lib/a.ts', 'lib/z.ts')).toBe(true)
    expect(h.client.putProjectFile).not.toHaveBeenCalled()
    expect(h.baseline().has('lib/a.ts')).toBe(false)
    expect(useIdeStore.getState().drafts['lib/z.ts']?.source).toBe('a edited')
    expect(useIdeStore.getState().openPaths).toContain('lib/z.ts')

    expect(await h.actions.saveAll()).toBe(1)
    expect(h.server.get('lib/z.ts')?.source).toBe('a edited')
    expect(h.client.deleteProjectFile).toHaveBeenCalledWith('wf', 'lib/a.ts', 'ha')
    expect(h.server.has('lib/a.ts')).toBe(false)
  })

  it('deletes on screen, keeping the text to bring back on Discard', async () => {
    const h = setup()
    useIdeStore.getState().setDraft('lib/b.ts', 'b edited', 'hb')
    expect(await h.actions.deleteFile('lib/b.ts')).toBe(true)
    expect(h.client.deleteProjectFile).not.toHaveBeenCalled()
    expect(h.baseline().has('lib/b.ts')).toBe(false)
    expect(useIdeStore.getState().drafts['lib/b.ts']).toBeUndefined()

    h.pending.discard(useIdeStore.getState().fileOps[0]!.id)
    expect(h.baseline().has('lib/b.ts')).toBe(true)
    expect(useIdeStore.getState().drafts['lib/b.ts']?.source).toBe('b edited')
  })

  it('writes a delete on Save, against the version that was read', async () => {
    const h = setup()
    await h.actions.deleteFile('lib/b.ts')
    expect(await h.actions.saveFiles([deleteKey('lib/b.ts')])).toEqual([true])
    expect(h.client.deleteProjectFile).toHaveBeenCalledWith('wf', 'lib/b.ts', 'hb')
    expect(useIdeStore.getState().fileOps).toEqual([])
  })

  it('keeps one entry per file: rename a new file, rename back, delete a renamed one', async () => {
    const h = setup()
    await h.actions.createFile('lib/new.ts')
    await h.actions.renameFile('lib/new.ts', 'lib/newer.ts')
    expect(labels()).toEqual(['Created lib/newer.ts'])
    await h.actions.deleteFile('lib/newer.ts')
    expect(labels()).toEqual([])

    await h.actions.renameFile('lib/a.ts', 'lib/z.ts')
    await h.actions.renameFile('lib/z.ts', 'lib/a.ts')
    expect(labels()).toEqual([])

    await h.actions.renameFile('lib/a.ts', 'lib/z.ts')
    await h.actions.deleteFile('lib/z.ts')
    expect(labels()).toEqual(['Deleted lib/a.ts'])
  })

  it('won’t reuse a path a pending rename or delete has freed until Save', async () => {
    const h = setup()
    await h.actions.deleteFile('lib/a.ts')
    expect(await h.actions.createFile('lib/a.ts')).toBe(false)
    expect(await h.actions.renameFile('lib/b.ts', 'lib/a.ts')).toBe(false)
    expect(h.notify.error).toHaveBeenCalledTimes(2)
    expect(labels()).toEqual(['Deleted lib/a.ts'])
  })

  it('deletes a folder’s files as pending deletes', async () => {
    const h = setup()
    expect(await h.actions.deleteFolder('lib/old')).toBe(true)
    expect(labels()).toEqual(['Deleted lib/old/c.ts'])
    expect(h.client.deleteProjectFile).not.toHaveBeenCalled()
  })

  it('keeps a new file pending when someone created the path meanwhile', async () => {
    const h = setup()
    await h.actions.createFile('lib/new.ts')
    h.server.set('lib/new.ts', file('lib/new.ts', 'theirs', 'ht'))
    expect(await h.actions.saveAll()).toBe(0)
    expect(labels()).toEqual(['Created lib/new.ts'])
    expect(h.notify.error).toHaveBeenCalledWith('Couldn’t create new.ts', {
      description: 'A file with that name was created meanwhile. Rename yours, then save.',
    })
  })

  it('keeps a delete pending when the file changed on the server', async () => {
    const h = setup()
    await h.actions.deleteFile('lib/b.ts')
    h.server.set('lib/b.ts', file('lib/b.ts', 'newer', 'hb2'))
    expect(await h.actions.saveAll()).toBe(0)
    expect(labels()).toEqual(['Deleted lib/b.ts'])
  })

  it('refuses the handler conversion while file changes are pending', async () => {
    const h = setup()
    await h.actions.createFile('lib/new.ts')
    expect(await h.actions.convertHandlers()).toBeNull()
    expect(h.client.convertHandlers).not.toHaveBeenCalled()
  })
})

describe('applyFileOps', () => {
  const files = new Map([
    ['a.ts', file('a.ts', 'a', 'ha')],
    ['b.ts', file('b.ts', 'b', 'hb')],
  ])

  it('shows deletes gone, renames at their new path with the read hash, new files unhashed', () => {
    const ops: PendingFileOp[] = [
      { kind: 'delete', id: '1', path: 'b.ts', hash: 'hb' },
      { kind: 'move', id: '2', from: 'a.ts', to: 'z.ts', source: 'a', hash: 'ha' },
      { kind: 'create', id: '3', path: 'n.ts', source: '' },
    ]
    const shown = applyFileOps(files, ops)
    expect([...shown.keys()].sort()).toEqual(['n.ts', 'z.ts'])
    expect(shown.get('z.ts')).toMatchObject({ source: 'a', hash: 'ha' })
    expect(shown.get('n.ts')?.hash).toBeUndefined()
  })

  it('returns the same map when nothing is pending', () => {
    expect(applyFileOps(files, [])).toBe(files)
  })
})

describe('persistedDrafts with pending file changes', () => {
  it('drops a new file’s text, keeps a renamed file’s at its old path and a deleted one’s stash', () => {
    const fileOps: PendingFileOp[] = [
      { kind: 'create', id: '1', path: 'n.ts', source: '' },
      { kind: 'move', id: '2', from: 'a.ts', to: 'z.ts', source: 'a', hash: 'ha' },
      {
        kind: 'delete',
        id: '3',
        path: 'b.ts',
        hash: 'hb',
        stashedDraft: { source: 'b mine', baseHash: 'hb' },
      },
    ]
    const drafts = {
      'n.ts': { source: 'new', baseHash: null },
      'z.ts': { source: 'a mine', baseHash: 'ha' },
    }
    expect(persistedDrafts({ drafts, graphOps: [], fileOps })).toEqual({
      'a.ts': { source: 'a mine', baseHash: 'ha' },
      'b.ts': { source: 'b mine', baseHash: 'hb' },
    })
  })
})

describe('Review fixes: what broke before', () => {
  it('writes a rename with the text that was read, even if the old file changed or went meanwhile', async () => {
    const h = setup()
    await h.actions.renameFile('lib/a.ts', 'lib/z.ts')
    // A teammate deletes the old file and the poll refetches it.
    h.server.delete('lib/a.ts')
    await h.refresh()
    expect(h.baseline().get('lib/z.ts')?.source).toBe('a')
    expect(await h.actions.saveAll()).toBe(1)
    expect(h.server.get('lib/z.ts')?.source).toBe('a')
    // The old file was already gone: no half-done warning.
    expect(h.notify.error).not.toHaveBeenCalled()
  })

  it('counts a delete of a file that is already gone as done', async () => {
    const h = setup()
    await h.actions.deleteFile('lib/b.ts')
    h.client.deleteProjectFile.mockRejectedValueOnce(
      Object.assign(new Error('File not found'), { status: 404 }),
    )
    expect(await h.actions.saveAll()).toBe(1)
    expect(useIdeStore.getState().fileOps).toEqual([])
  })

  it('drops a file deleted on the server without recording a delete', async () => {
    const h = setup()
    useIdeStore.getState().setDraft('lib/gone.ts', 'mine', 'hg')
    expect(await h.actions.deleteFile('lib/gone.ts')).toBe(true)
    expect(useIdeStore.getState().fileOps).toEqual([])
    expect(useIdeStore.getState().drafts['lib/gone.ts']).toBeUndefined()
  })

  it('says why a file deleted on the server can’t be renamed', async () => {
    const h = setup()
    useIdeStore.getState().setDraft('lib/gone.ts', 'mine', 'hg')
    expect(await h.actions.renameFile('lib/gone.ts', 'lib/x.ts')).toBe(false)
    expect(h.notify.error).toHaveBeenCalledWith('Couldn’t rename gone.ts', {
      description: 'It changed on the server since you edited it. Compare it first.',
    })
  })

  it('writes pending deletes before new files', async () => {
    const h = setup()
    await h.actions.deleteFile('lib/b.ts')
    await h.actions.createFile('lib/new.ts')
    let deleted = false
    h.client.deleteProjectFile.mockImplementationOnce(async (_id, path) => {
      await Promise.resolve()
      h.server.delete(path)
      deleted = true
    })
    h.client.putProjectFile.mockImplementationOnce(async (_id, path, source) => {
      expect(deleted).toBe(true)
      return { path, hash: 'hn', size: source.length, updatedAt: 'now' }
    })
    expect(await h.actions.saveAll()).toBe(2)
  })

  it('refuses Explorer changes while file changes are being written, and keeps what wasn’t written', async () => {
    const h = setup()
    await h.actions.createFile('lib/new.ts')
    let release!: () => void
    h.client.putProjectFile.mockImplementationOnce(async (_id, path, source) => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      h.server.set(path, file(path, source, 'hn'))
      return { path, hash: 'hn', size: source.length, updatedAt: 'now' }
    })
    const saving = h.actions.saveAll()
    await vi.waitFor(() => expect(h.client.putProjectFile).toHaveBeenCalled())
    expect(await h.actions.renameFile('lib/new.ts', 'lib/other.ts')).toBe(false)
    expect(await h.actions.deleteFile('lib/new.ts')).toBe(false)
    expect(h.notify.error).toHaveBeenCalledWith('Wait for the save to finish', {
      description: 'Your file changes are being written.',
    })
    release()
    expect(await saving).toBe(1)
    expect(useIdeStore.getState().fileOps).toEqual([])
    // Settled: changes are accepted again.
    expect(await h.actions.renameFile('lib/a.ts', 'lib/y.ts')).toBe(true)
  })

  it('drops a renamed virtual seed on delete without recording a delete', async () => {
    const h = setup()
    useIdeStore
      .getState()
      .replaceFileOps([
        { kind: 'move', id: 'm', from: 'handlers.ts', to: 'lib/h.ts', source: 'seed', hash: null },
      ])
    expect(await h.actions.deleteFile('lib/h.ts')).toBe(true)
    expect(useIdeStore.getState().fileOps).toEqual([])
  })
})

describe('Security review fix', () => {
  it('writes nothing more once the person has left while the deletes were in flight', async () => {
    const h = setup()
    await h.actions.deleteFile('lib/b.ts')
    useIdeStore.getState().setDraft('lib/a.ts', 'a edited', 'ha')
    h.client.deleteProjectFile.mockImplementationOnce(async (_id, path) => {
      // Discard and leave while the DELETE is answered; another workflow opens
      // and restores its own text at the same path.
      h.leave()
      useIdeStore.getState().resetSession()
      useIdeStore.getState().setDraft('lib/a.ts', 'another workflow’s code', 'ha')
      h.server.delete(path)
    })
    await h.actions.saveAll()
    expect(h.client.putProjectFile).not.toHaveBeenCalled()
  })
})
