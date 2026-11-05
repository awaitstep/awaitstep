import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  ProjectFileConflictError,
  type SourceFile,
  type WritePrecondition,
} from '../api-client'
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

function setup(baselineOverride = baseline, isCurrent: () => boolean = () => true) {
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
    convertHandlers: vi.fn(async () => ({
      source: 'file' as const,
      files: [{ path: 'handlers/fetch.ts', hash: 'h-fetch', size: 10, updatedAt: 'now' }],
      declarations: {},
      deploymentConfigUpdated: false,
    })),
  } satisfies ProjectFileClient
  const notify = { success: vi.fn(), error: vi.fn() } satisfies Notifier
  const refresh = vi.fn(async () => undefined)
  const actions = createProjectFileActions({
    workflowId: 'wf-1',
    target: 'workflow',
    client,
    notify,
    getBaseline: () => baselineOverride,
    getStore: useIdeStore.getState,
    isCurrent,
    getProjectPaths: () => new Set(baselineOverride.keys()),
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
    // Overwriting is a save like any other: it says so.
    await vi.waitFor(() => expect(notify.success).toHaveBeenCalledWith('Saved env.ts'))
  })

  it('starts a new handler entry from its scaffold rather than an empty file', async () => {
    const { client, actions } = setup()
    await actions.createFile('handlers/fetch.ts')
    expect(client.putProjectFile.mock.calls[0]![2]).toContain('env.WORKFLOW.create')
    await actions.createFile('handlers/queue/orders.ts')
    expect(client.putProjectFile.mock.calls[1]![2]).toContain('"orders" queue')
    // Ordinary files still start empty, and an explicit source wins.
    await actions.createFile('config/env.ts')
    expect(client.putProjectFile.mock.calls[2]![2]).toBe('')
    await actions.createFile('handlers/scheduled.ts', 'mine')
    expect(client.putProjectFile.mock.calls[3]![2]).toBe('mine')
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
    // The server's reason, as it sent it.
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

  it('convertHandlers saves a pending draft, converts on the server against the hash it read, and moves the tabs', async () => {
    const annotated = new Map<string, SourceFile>([
      ['handlers.ts', file('handlers.ts', '@fetch function handler() {}', 'h-handlers')],
    ])
    const store = useIdeStore.getState()
    store.openFile('handlers.ts')
    store.setDraft(
      'handlers.ts',
      '@fetch function handler() { return new Response("edited") }',
      'h-handlers',
    )
    const { client, notify, refresh, actions } = setup(annotated)

    const result = await actions.convertHandlers()
    expect(result?.files.map((f) => f.path)).toEqual(['handlers/fetch.ts'])
    // The draft went first, so the server converted the edited text.
    expect(client.putProjectFile).toHaveBeenCalledWith(
      'wf-1',
      'handlers.ts',
      '@fetch function handler() { return new Response("edited") }',
      { ifMatch: 'h-handlers' },
    )
    // ...and the conversion is conditional on the hash that save returned,
    // not the one the draft started from.
    expect(client.convertHandlers).toHaveBeenCalledWith(
      'wf-1',
      'saved:@fetch function handler() { return new Response("edited") }',
    )
    expect(client.deleteProjectFile).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
    expect(useIdeStore.getState()).toMatchObject({ openPaths: ['handlers/fetch.ts'], drafts: {} })
    expect(notify.success).toHaveBeenCalledWith('Created handlers/fetch.ts')
  })

  it('convertHandlers goes ahead when the draft merely matches the file', async () => {
    const annotated = new Map<string, SourceFile>([
      ['handlers.ts', file('handlers.ts', '@fetch function handler() {}', 'h-handlers')],
    ])
    useIdeStore.getState().setDraft('handlers.ts', '@fetch function handler() {}', 'h-handlers')
    const { client, actions } = setup(annotated)
    expect(await actions.convertHandlers()).not.toBeNull()
    expect(client.putProjectFile).not.toHaveBeenCalled()
    expect(client.convertHandlers).toHaveBeenCalledWith('wf-1', 'h-handlers')
  })

  it('convertHandlers reports a server refusal and reloads on a conflict', async () => {
    const seed = new Map<string, SourceFile>([
      ['handlers.ts', file('handlers.ts', 'return new Response("legacy")')],
    ])
    const { client, notify, refresh, actions } = setup(seed)
    client.convertHandlers.mockRejectedValueOnce(
      new ProjectFileConflictError('The project already uses handler modules', null),
    )
    expect(await actions.convertHandlers()).toBeNull()
    expect(notify.error).toHaveBeenCalledWith('The project already uses handler modules')
    expect(refresh).toHaveBeenCalledTimes(1)
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

  it('says each finished write in a general toast', async () => {
    useIdeStore.getState().setDraft('config/env.ts', 'edited env', 'h-env')
    const { notify, actions } = setup()
    await actions.saveFile('config/env.ts')
    await actions.createFile('services/new.ts')
    await actions.renameFile('config/other.ts', 'config/renamed.ts')
    await actions.deleteFile('config/env.ts')
    expect(notify.success.mock.calls.map((c) => c[0])).toEqual([
      'Saved env.ts',
      'Created. Import it as `#app/services/new`',
      'Renamed to renamed.ts',
      'Deleted env.ts',
    ])
  })

  it('says a refusal’s reason, and its own line for a server failure', async () => {
    const { client, notify, actions } = setup()
    client.deleteProjectFile.mockRejectedValueOnce(new ApiError('This workspace is locked', 423))
    expect(await actions.deleteFile('config/env.ts')).toBe(false)
    expect(notify.error).toHaveBeenLastCalledWith('This workspace is locked')
    client.deleteProjectFile.mockRejectedValueOnce(new ApiError('Internal server error', 500))
    expect(await actions.deleteFile('config/env.ts')).toBe(false)
    expect(notify.error).toHaveBeenLastCalledWith('Couldn’t delete env.ts')
  })

  it('does not call a rename done when the old file stayed behind', async () => {
    const { client, notify, actions } = setup()
    client.deleteProjectFile.mockRejectedValueOnce(new ApiError('This workspace is locked', 423))
    expect(await actions.renameFile('config/other.ts', 'config/renamed.ts')).toBe(true)
    expect(notify.error).toHaveBeenCalledWith('Created renamed.ts but couldn’t remove other.ts', {
      description: 'This workspace is locked',
    })
    expect(notify.success).not.toHaveBeenCalled()

    client.deleteProjectFile.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await actions.renameFile('config/env.ts', 'config/again.ts')
    expect(notify.error).toHaveBeenLastCalledWith(
      'Created again.ts but couldn’t remove env.ts',
      undefined,
    )
  })
})

describe('writes that outlive the workspace', () => {
  beforeEach(() => {
    useIdeStore.getState().resetSession()
  })

  // The user opens another workflow while the call is in flight: the shared
  // session now belongs to it and must come out untouched.
  function moveOn() {
    let current = true
    return {
      isCurrent: () => current,
      leave: () => {
        current = false
        const other = useIdeStore.getState()
        other.openFile('config/env.ts')
        other.setDraft('config/env.ts', 'other workflow draft', 'h-x')
        other.setDraft('lib/env.ts', 'other new draft', 'h-y')
      },
    }
  }

  it('renameFile leaves the other workflow’s tabs and drafts alone and does not offer its importers', async () => {
    const nav = moveOn()
    const { client, actions, notify } = setup(baseline, nav.isCurrent)
    client.putProjectFile.mockImplementationOnce(async (_id, path, source) => {
      nav.leave()
      return { path, hash: 'h', size: source.length, updatedAt: 'now' }
    })
    expect(await actions.renameFile('config/env.ts', 'lib/env.ts')).toBe(true)
    expect(useIdeStore.getState().openPaths).toEqual(['config/env.ts'])
    expect(Object.keys(useIdeStore.getState().drafts).sort()).toEqual([
      'config/env.ts',
      'lib/env.ts',
    ])
    expect(notify.success).toHaveBeenCalledTimes(1)
    expect(notify.success).toHaveBeenCalledWith('Renamed to env.ts')
  })

  it('renameFile counts importers over the drafts it started with, not the next workflow’s', async () => {
    const importer = file('worker2.ts', 'x', 'h-w2')
    const files = new Map(baseline).set('worker2.ts', importer)
    useIdeStore.getState().setDraft('worker2.ts', 'import a from "#app/config/env"', 'h-w2')
    const { client, actions, notify } = setup(files)
    client.deleteProjectFile.mockImplementationOnce(async () => {
      // Another workflow's session replaces the drafts mid-flight.
      useIdeStore.getState().replaceDrafts({})
    })
    await actions.renameFile('config/env.ts', 'lib/env.ts')
    expect(notify.success).toHaveBeenCalledWith(
      'Renamed to env.ts',
      expect.objectContaining({ description: '1 file still imports the old path.' }),
    )
  })

  it('createFile does not open the new file in the other workflow', async () => {
    const nav = moveOn()
    const { client, actions } = setup(baseline, nav.isCurrent)
    client.putProjectFile.mockImplementationOnce(async (_id, path) => {
      nav.leave()
      return { path, hash: 'h', size: 0, updatedAt: 'now' }
    })
    await actions.createFile('lib/new.ts', '')
    expect(useIdeStore.getState().openPaths).toEqual(['config/env.ts'])
  })

  it('deleteFile does not close tabs or drop drafts of the other workflow', async () => {
    const nav = moveOn()
    const { client, actions } = setup(baseline, nav.isCurrent)
    client.deleteProjectFile.mockImplementationOnce(async () => {
      nav.leave()
    })
    await actions.deleteFile('config/env.ts')
    expect(useIdeStore.getState().openPaths).toEqual(['config/env.ts'])
    expect(useIdeStore.getState().drafts['config/env.ts']).toBeDefined()
  })

  it('saveFile does not rebase a draft of the other workflow', async () => {
    const nav = moveOn()
    useIdeStore.getState().setDraft('config/env.ts', 'mine', 'h-env')
    const { client, actions } = setup(baseline, nav.isCurrent)
    client.putProjectFile.mockImplementationOnce(async (_id, path) => {
      nav.leave()
      return { path, hash: 'saved', size: 1, updatedAt: 'now' }
    })
    await actions.saveFile('config/env.ts')
    const draft = useIdeStore.getState().drafts['config/env.ts']
    expect(draft?.source).toBe('other workflow draft')
    expect(draft?.baseHash).not.toBe('saved')
  })

  it('convertHandlers does not close or open tabs of the other workflow', async () => {
    const nav = moveOn()
    const { client, actions } = setup(baseline, nav.isCurrent)
    client.convertHandlers.mockImplementationOnce(async () => {
      nav.leave()
      return {
        source: 'file' as const,
        files: [{ path: 'handlers/fetch.ts', hash: 'h', size: 1, updatedAt: 'now' }],
        declarations: {},
        deploymentConfigUpdated: false,
      }
    })
    await actions.convertHandlers()
    expect(useIdeStore.getState().openPaths).toEqual(['config/env.ts'])
  })
})
