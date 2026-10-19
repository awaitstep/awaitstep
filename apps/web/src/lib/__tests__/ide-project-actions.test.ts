import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectFileConflictError, type SourceFile, type WritePrecondition } from '../api-client'
import {
  createProjectFileActions,
  type Notifier,
  type ProjectFileClient,
} from '../ide/project-actions'
import { useIdeStore } from '../../stores/ide-store'

function file(path: string, source: string, hash?: string): SourceFile {
  return { path, source, role: 'module', ...(hash && { hash }) }
}

const baseline = new Map<string, SourceFile>([
  ['worker.ts', file('worker.ts', 'generated')],
  ['config/env.ts', file('config/env.ts', 'base env', 'h-env')],
  ['config/other.ts', file('config/other.ts', 'base other', 'h-other')],
  ['handlers.ts', file('handlers.ts', '@fetch function handler() {}')],
])

function setup(baselineOverride = baseline) {
  const client = {
    putProjectFile: vi.fn(
      async (_id: string, path: string, source: string, _p: WritePrecondition) => ({
        path,
        hash: `saved:${source}`,
        size: source.length,
        updatedAt: 'now',
      }),
    ),
    deleteProjectFile: vi.fn(async () => undefined),
  } satisfies ProjectFileClient
  const notify = { success: vi.fn(), error: vi.fn() } satisfies Notifier
  const refresh = vi.fn(async () => undefined)
  const actions = createProjectFileActions({
    workflowId: 'wf-1',
    client,
    notify,
    getBaseline: () => baselineOverride,
    getStore: useIdeStore.getState,
    refresh,
  })
  return { client, notify, refresh, actions }
}

describe('project file actions', () => {
  beforeEach(() => {
    useIdeStore.getState().resetSession()
  })

  it('saveAll writes exactly the dirty drafts, each against the hash it started from', async () => {
    const store = useIdeStore.getState()
    store.setDraft('config/env.ts', 'edited env', 'h-env')
    store.setDraft('config/other.ts', 'base other', 'h-other') // typed back to baseline
    const { client, notify, refresh, actions } = setup()

    expect(await actions.saveAll()).toBe(1)
    expect(client.putProjectFile).toHaveBeenCalledTimes(1)
    expect(client.putProjectFile).toHaveBeenCalledWith('wf-1', 'config/env.ts', 'edited env', {
      ifMatch: 'h-env',
    })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(notify.success).toHaveBeenCalledWith('Saved 1 file')
    // The draft now builds on the hash the server returned.
    expect(useIdeStore.getState().drafts['config/env.ts']?.baseHash).toBe('saved:edited env')
  })

  it('a second save before the refetch lands uses the rebased hash, not the stale one', async () => {
    useIdeStore.getState().setDraft('config/env.ts', 'v1', 'h-env')
    const { client, actions } = setup()
    await actions.saveFile('config/env.ts')
    useIdeStore.getState().setDraft('config/env.ts', 'v2', 'ignored-later-fetch')
    await actions.saveFile('config/env.ts')
    expect(client.putProjectFile.mock.calls.map((c) => c[3])).toEqual([
      { ifMatch: 'h-env' },
      { ifMatch: 'saved:v1' },
    ])
  })

  it('saving a virtual seed creates it and refuses to replace a file that appeared meanwhile', async () => {
    const { client, notify, actions } = setup()
    expect(await actions.saveFile('handlers.ts')).toBe(true)
    expect(client.putProjectFile).toHaveBeenCalledWith(
      'wf-1',
      'handlers.ts',
      '@fetch function handler() {}',
      { ifNoneMatch: true },
    )

    client.putProjectFile.mockRejectedValueOnce(
      new ProjectFileConflictError('File already exists', 'h-agent'),
    )
    useIdeStore.getState().setDraft('handlers.ts', '@fetch function mine() {}', null)
    expect(await actions.saveFile('handlers.ts')).toBe(false)
    expect(notify.error).toHaveBeenCalledWith(
      'handlers.ts was created on the server since you opened it',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Overwrite' }) }),
    )
  })

  it('a conflict offers Overwrite, which writes against the reported hash', async () => {
    useIdeStore.getState().setDraft('config/env.ts', 'mine', 'h-env')
    const { client, notify, refresh, actions } = setup()
    client.putProjectFile.mockRejectedValueOnce(
      new ProjectFileConflictError('File changed since it was read', 'h-agent'),
    )
    expect(await actions.saveFile('config/env.ts')).toBe(false)
    expect(refresh).not.toHaveBeenCalled()
    expect(useIdeStore.getState().drafts['config/env.ts']?.baseHash).toBe('h-env')

    const [, options] = notify.error.mock.calls[0]!
    options!.action!.onClick()
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(client.putProjectFile).toHaveBeenLastCalledWith('wf-1', 'config/env.ts', 'mine', {
      ifMatch: 'h-agent',
    })
    expect(useIdeStore.getState().drafts['config/env.ts']?.baseHash).toBe('saved:mine')
  })

  it('reports an ejected version plainly, without an Overwrite', async () => {
    useIdeStore.getState().setDraft('config/env.ts', 'mine', 'h-env')
    const { client, notify, actions } = setup()
    client.putProjectFile.mockRejectedValueOnce(
      new ProjectFileConflictError('Version is ejected', null, 'ejected'),
    )
    expect(await actions.saveFile('config/env.ts')).toBe(false)
    expect(notify.error).toHaveBeenCalledWith('Version is ejected')
  })

  it('createFile never replaces an existing file and shows the one that won', async () => {
    const { client, notify, refresh, actions } = setup()
    expect(await actions.createFile('services/stripe.ts')).toBe(true)
    expect(client.putProjectFile).toHaveBeenCalledWith('wf-1', 'services/stripe.ts', '', {
      ifNoneMatch: true,
    })
    expect(useIdeStore.getState().activePath).toBe('services/stripe.ts')

    client.putProjectFile.mockRejectedValueOnce(
      new ProjectFileConflictError('File already exists', 'h-agent'),
    )
    expect(await actions.createFile('services/taken.ts')).toBe(false)
    expect(notify.error).toHaveBeenCalledWith('File already exists')
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('renameFile creates the new path, removes the old one by its hash and moves the tab', async () => {
    const store = useIdeStore.getState()
    store.openFile('config/env.ts')
    store.setDraft('config/env.ts', 'edited env', 'h-env')
    const { client, actions } = setup()

    expect(await actions.renameFile('config/env.ts', 'lib/env.ts')).toBe(true)
    expect(client.putProjectFile).toHaveBeenCalledWith('wf-1', 'lib/env.ts', 'edited env', {
      ifNoneMatch: true,
    })
    expect(client.deleteProjectFile).toHaveBeenCalledWith('wf-1', 'config/env.ts', 'h-env')
    expect(useIdeStore.getState()).toMatchObject({ openPaths: ['lib/env.ts'], drafts: {} })
  })

  it('renameFile stops before deleting when the new path is taken', async () => {
    const { client, actions } = setup()
    client.putProjectFile.mockRejectedValueOnce(
      new ProjectFileConflictError('File already exists', 'h-agent'),
    )
    expect(await actions.renameFile('config/env.ts', 'config/other.ts')).toBe(false)
    expect(client.deleteProjectFile).not.toHaveBeenCalled()
  })

  it('deleteFile is conditional on the baseline hash and closes the tab', async () => {
    const store = useIdeStore.getState()
    store.openFile('config/env.ts')
    store.setDraft('config/env.ts', 'edited', 'h-env')
    const { client, actions } = setup()
    expect(await actions.deleteFile('config/env.ts')).toBe(true)
    expect(client.deleteProjectFile).toHaveBeenCalledWith('wf-1', 'config/env.ts', 'h-env')
    expect(useIdeStore.getState()).toMatchObject({ openPaths: [], drafts: {} })
  })
})
