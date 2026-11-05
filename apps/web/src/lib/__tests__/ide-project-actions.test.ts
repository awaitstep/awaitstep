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
    expect(notify.success).not.toHaveBeenCalled()
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
    // No toast to time out: the editor's banner carries it.
    expect(notify.error).not.toHaveBeenCalled()
    expect(useIdeStore.getState().conflicts['handlers.ts']).toEqual({ currentHash: 'h-agent' })
  })

  it('a conflict is recorded for the banner instead of toasted, and the server copy is loaded', async () => {
    useIdeStore.getState().setDraft('config/env.ts', 'mine', 'h-env')
    const { client, notify, refresh, actions } = setup()
    client.putProjectFile.mockRejectedValueOnce(
      new ProjectFileConflictError('File changed since it was read', 'h-agent'),
    )
    expect(await actions.saveFile('config/env.ts')).toBe(false)
    expect(notify.error).not.toHaveBeenCalled()
    expect(useIdeStore.getState().conflicts['config/env.ts']).toEqual({ currentHash: 'h-agent' })
    // The file's own tab is where the banner shows.
    expect(useIdeStore.getState().activePath).toBe('config/env.ts')
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(useIdeStore.getState().drafts['config/env.ts']?.baseHash).toBe('h-env')
  })

  it('a refused save from a Compare tab stays in Compare and says why', async () => {
    const store = useIdeStore.getState()
    store.setDraft('config/env.ts', 'edited', 'h-env')
    store.openCompare('config/env.ts')
    const { client, notify, actions } = setup()
    client.putProjectFile.mockRejectedValueOnce(new ProjectFileConflictError('moved', 'h-newer'))
    expect(await actions.saveFile('config/env.ts')).toBe(false)
    expect(useIdeStore.getState().activePath).toBe('ide:compare:config/env.ts')
    expect(notify.error).toHaveBeenCalledWith(
      'Couldn’t save env.ts',
      expect.objectContaining({ description: expect.stringContaining('overwrite') }),
    )
  })

  it('overwriteFile writes against the hash of the copy that was compared', async () => {
    useIdeStore.getState().setDraft('config/env.ts', 'mine', 'h-env')
    useIdeStore.getState().setConflict('config/env.ts', { currentHash: 'h-agent' })
    const { client, notify, refresh, actions } = setup()
    expect(await actions.overwriteFile('config/env.ts', 'h-agent')).toBe(true)
    expect(client.putProjectFile).toHaveBeenLastCalledWith('wf-1', 'config/env.ts', 'mine', {
      ifMatch: 'h-agent',
    })
    expect(useIdeStore.getState().drafts['config/env.ts']?.baseHash).toBe('saved:mine')
    expect(useIdeStore.getState().conflicts['config/env.ts']).toBeUndefined()
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(notify.success).not.toHaveBeenCalled()
  })

  it('overwriteFile is a fresh conflict when another write landed after Compare opened', async () => {
    useIdeStore.getState().setDraft('config/env.ts', 'mine', 'h-env')
    const { client, notify, actions } = setup()
    client.putProjectFile.mockRejectedValueOnce(
      new ProjectFileConflictError('File changed since it was read', 'h-newer'),
    )
    expect(await actions.overwriteFile('config/env.ts', 'h-agent')).toBe(false)
    expect(useIdeStore.getState().conflicts['config/env.ts']).toEqual({ currentHash: 'h-newer' })
    expect(useIdeStore.getState().drafts['config/env.ts']?.baseHash).toBe('h-env')
    expect(notify.success).not.toHaveBeenCalled()
    expect(notify.error).not.toHaveBeenCalled()
  })

  it('overwriteFile of a file deleted meanwhile creates only if the path is still free', async () => {
    useIdeStore.getState().setDraft('config/env.ts', 'mine', 'h-env')
    const { client, actions } = setup()
    expect(await actions.overwriteFile('config/env.ts', null)).toBe(true)
    expect(client.putProjectFile).toHaveBeenLastCalledWith('wf-1', 'config/env.ts', 'mine', {
      ifNoneMatch: true,
    })
  })

  it('recreateFile creates a deleted file with If-None-Match and rebases the draft', async () => {
    useIdeStore.getState().setDraft('lib/gone.ts', 'my copy', 'h-gone')
    const { client, notify, refresh, actions } = setup()
    expect(await actions.recreateFile('lib/gone.ts')).toBe(true)
    expect(client.putProjectFile).toHaveBeenCalledWith('wf-1', 'lib/gone.ts', 'my copy', {
      ifNoneMatch: true,
    })
    expect(useIdeStore.getState().drafts['lib/gone.ts']?.baseHash).toBe('saved:my copy')
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(notify.success).not.toHaveBeenCalled()
  })

  it('recreateFile never replaces a file someone recreated first: it becomes a conflict', async () => {
    useIdeStore.getState().setDraft('lib/gone.ts', 'my copy', 'h-gone')
    const { client, notify, actions } = setup()
    client.putProjectFile.mockRejectedValueOnce(
      new ProjectFileConflictError('File already exists', 'h-theirs'),
    )
    expect(await actions.recreateFile('lib/gone.ts')).toBe(false)
    expect(useIdeStore.getState().conflicts['lib/gone.ts']).toEqual({ currentHash: 'h-theirs' })
    expect(notify.error).not.toHaveBeenCalled()
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

  it('renameFile refuses, writing and deleting nothing, when the file moved on after the edit began', async () => {
    useIdeStore.getState().setDraft('config/env.ts', 'edited env', 'h-env-old')
    const { client, notify, actions } = setup()
    expect(await actions.renameFile('config/env.ts', 'lib/env.ts')).toBe(false)
    expect(client.putProjectFile).not.toHaveBeenCalled()
    expect(client.deleteProjectFile).not.toHaveBeenCalled()
    expect(notify.error).toHaveBeenCalledWith(
      'Couldn’t rename env.ts',
      expect.objectContaining({ description: expect.stringContaining('changed on the server') }),
    )
    expect(useIdeStore.getState().drafts['config/env.ts']?.source).toBe('edited env')
  })

  it('renameFile refuses while a save of that file is in conflict', async () => {
    const store = useIdeStore.getState()
    store.setDraft('config/env.ts', 'edited env', 'h-env')
    store.setConflict('config/env.ts', { currentHash: 'h-newer' })
    const { client, actions } = setup()
    expect(await actions.renameFile('config/env.ts', 'lib/env.ts')).toBe(false)
    expect(client.putProjectFile).not.toHaveBeenCalled()
  })

  it('renameFile deletes the old path against the hash the edit began from', async () => {
    useIdeStore.getState().setDraft('config/env.ts', 'edited env', 'h-env')
    const { client, actions } = setup()
    await actions.renameFile('config/env.ts', 'lib/env.ts')
    expect(client.deleteProjectFile).toHaveBeenCalledWith('wf-1', 'config/env.ts', 'h-env')
  })

  it('deleteFile is conditional on the hash the edit began from, not the latest seen', async () => {
    useIdeStore.getState().setDraft('config/env.ts', 'edited', 'h-env-old')
    const { client, actions } = setup()
    await actions.deleteFile('config/env.ts')
    expect(client.deleteProjectFile).toHaveBeenCalledWith('wf-1', 'config/env.ts', 'h-env-old')
  })

  it('deleteFile refuses, deleting nothing, when the draft is built on no stored version but the file is stored', async () => {
    useIdeStore.getState().setDraft('config/env.ts', 'my text', null)
    const { client, notify, actions } = setup()
    expect(await actions.deleteFile('config/env.ts')).toBe(false)
    expect(client.deleteProjectFile).not.toHaveBeenCalled()
    expect(notify.error).toHaveBeenCalledWith(
      'Couldn’t delete env.ts',
      expect.objectContaining({ description: expect.stringContaining('changed on the server') }),
    )
    expect(useIdeStore.getState().drafts['config/env.ts']?.source).toBe('my text')
    expect(useIdeStore.getState().activePath).toBe('config/env.ts')
  })

  it('deleteFolder deletes each stored file under it against its own hash, refreshing and saying it once', async () => {
    useIdeStore.getState().setDraft('config/env.ts', 'edited', 'h-old')
    useIdeStore.getState().setDraft('config/unsaved.ts', 'new', null)
    const { client, notify, refresh, actions } = setup()
    expect(await actions.deleteFolder('config')).toBe(true)
    expect(client.deleteProjectFile).toHaveBeenCalledTimes(2)
    expect(client.deleteProjectFile).toHaveBeenCalledWith('wf-1', 'config/env.ts', 'h-old')
    expect(client.deleteProjectFile).toHaveBeenCalledWith('wf-1', 'config/other.ts', 'h-other')
    expect(useIdeStore.getState().drafts).toEqual({})
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(notify.success.mock.calls).toEqual([['Deleted config']])
  })

  it('deleteFolder leaves a sibling whose name only starts the same, and generated files', async () => {
    const { client, actions } = setup(
      new Map([...baseline, ['config-old/x.ts', file('config-old/x.ts', 'x', 'h-x')]]),
    )
    await actions.deleteFolder('config')
    expect(client.deleteProjectFile).not.toHaveBeenCalledWith('wf-1', 'config-old/x.ts', 'h-x')
    expect(client.deleteProjectFile).not.toHaveBeenCalledWith(
      'wf-1',
      'worker.ts',
      expect.anything(),
    )
  })

  it('deleteFolder says how many went when one is refused, and reports false', async () => {
    const { client, notify, actions } = setup()
    client.deleteProjectFile.mockRejectedValueOnce(new ApiError('This workspace is locked', 423))
    expect(await actions.deleteFolder('config')).toBe(false)
    expect(notify.error).toHaveBeenLastCalledWith(
      'Deleted 1 of 2 files in config',
      expect.anything(),
    )
    expect(notify.success).not.toHaveBeenCalled()
  })

  it('deleteFile never sends an unconditional delete for a path with no stored hash', async () => {
    useIdeStore.getState().setDraft('handlers.ts', 'seed edit', null)
    const { client, actions } = setup()
    expect(await actions.deleteFile('handlers.ts')).toBe(true)
    expect(client.deleteProjectFile).not.toHaveBeenCalled()
    expect(useIdeStore.getState().drafts['handlers.ts']).toBeUndefined()
  })

  it('renameFile of a draft-less file removes the old path by the baseline hash', async () => {
    const { client, actions } = setup()
    await actions.renameFile('config/other.ts', 'config/renamed.ts')
    expect(client.deleteProjectFile).toHaveBeenCalledWith('wf-1', 'config/other.ts', 'h-other')
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

  it('toasts structural changes (create, rename, delete) but saving a file is silent', async () => {
    useIdeStore.getState().setDraft('config/env.ts', 'edited env', 'h-env')
    const { notify, actions } = setup()
    await actions.saveFile('config/env.ts')
    await actions.createFile('services/new.ts')
    await actions.renameFile('config/other.ts', 'config/renamed.ts')
    await actions.deleteFile('config/env.ts')
    expect(notify.success.mock.calls.map((c) => c[0])).toEqual([
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

  it('a conflict that arrives after the workspace moved on does not touch the next workflow’s session', async () => {
    useIdeStore.getState().setDraft('config/env.ts', 'mine', 'h-env')
    let current = true
    const { client, actions } = setup(baseline, () => current)
    client.putProjectFile.mockImplementationOnce(async () => {
      current = false
      throw new ProjectFileConflictError('File changed since it was read', 'h-agent')
    })
    await actions.saveFile('config/env.ts')
    expect(useIdeStore.getState().conflicts).toEqual({})
    expect(useIdeStore.getState().activePath).toBeNull()
  })

  it('an overwrite that finishes after the workspace moved on does not rebase or toast', async () => {
    useIdeStore.getState().setDraft('config/env.ts', 'mine', 'h-env')
    let current = true
    const { client, notify, actions } = setup(baseline, () => current)
    client.putProjectFile.mockImplementationOnce(async (_i, path, source) => {
      current = false
      return { path, hash: 'saved', size: source.length, updatedAt: 'now' }
    })
    await actions.overwriteFile('config/env.ts', 'h-agent')
    expect(useIdeStore.getState().drafts['config/env.ts']?.baseHash).toBe('h-env')
    expect(notify.success).not.toHaveBeenCalled()
  })

  it('saveAll puts the first file whose save was refused in front of the person', async () => {
    const store = useIdeStore.getState()
    store.setDraft('config/env.ts', 'a', 'h-env')
    store.setDraft('config/other.ts', 'b', 'h-other')
    const { client, actions } = setup()
    client.putProjectFile.mockImplementation(async (_id, path, source) => {
      if (path === 'config/other.ts') throw new ProjectFileConflictError('changed', 'h-new')
      return { path, hash: `saved:${source}`, size: 1, updatedAt: 'now' }
    })
    expect(await actions.saveAll()).toBe(1)
    expect(useIdeStore.getState().activePath).toBe('config/other.ts')
    expect(useIdeStore.getState().conflicts['config/other.ts']).toEqual({ currentHash: 'h-new' })
  })

  it('converting handlers stops when the unsaved handlers.ts save is refused', async () => {
    useIdeStore.getState().setDraft('handlers.ts', 'mine', null)
    const { client, actions } = setup()
    client.putProjectFile.mockRejectedValueOnce(new ProjectFileConflictError('exists', 'h-x'))
    expect(await actions.convertHandlers()).toBeNull()
    expect(client.convertHandlers).not.toHaveBeenCalled()
  })

  it('saving a file that was deleted on the server writes nothing and says why, instead of failing silently', async () => {
    useIdeStore.getState().setDraft('lib/gone.ts', 'my copy', 'h-gone')
    const { client, notify, actions } = setup()
    expect(await actions.saveFile('lib/gone.ts')).toBe(false)
    expect(client.putProjectFile).not.toHaveBeenCalled()
    expect(notify.error).toHaveBeenCalledWith(
      'gone.ts was deleted on the server',
      expect.objectContaining({ description: expect.stringContaining('Save to recreate') }),
    )
    expect(useIdeStore.getState().activePath).toBe('lib/gone.ts')
    expect(useIdeStore.getState().drafts['lib/gone.ts']?.source).toBe('my copy')
  })

  it('saveAll leaves a deleted file’s copy alone and counts only what it wrote', async () => {
    const store = useIdeStore.getState()
    store.setDraft('lib/gone.ts', 'my copy', 'h-gone')
    store.setDraft('config/env.ts', 'edited env', 'h-env')
    const { client, notify, actions } = setup()
    expect(await actions.saveAll()).toBe(1)
    expect(client.putProjectFile).toHaveBeenCalledTimes(1)
    expect(notify.error).toHaveBeenCalledTimes(1)
  })
})
