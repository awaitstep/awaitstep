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
import type { StepSaveOutcome } from '../ide/step-save'
import { useIdeStore } from '../../stores/ide-store'

function file(path: string, source: string, hash?: string): SourceFile {
  return { path, source, role: 'module', ...(hash && { hash }) }
}

const STEP = 'steps/validate.ts'
const baseline = new Map<string, SourceFile>([
  ['worker.ts', file('worker.ts', 'generated')],
  ['config/env.ts', file('config/env.ts', 'base env', 'h-env')],
  ['config/other.ts', file('config/other.ts', 'base other', 'h-other')],
  ['handlers.ts', file('handlers.ts', '@fetch function handler() {}')],
  [STEP, { path: STEP, source: 'return 1', role: 'source', hash: 'h-step' }],
])

function setup(
  baselineOverride = baseline,
  isCurrent: () => boolean = () => true,
  canEdit: () => boolean = () => true,
) {
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
  const commit = vi.fn(async () => undefined)
  // Stands in for the step saver: every step draft it is handed is 'saved'.
  const saveSteps = vi.fn(
    async (paths: readonly string[]): Promise<Map<string, StepSaveOutcome>> => {
      for (const path of paths) useIdeStore.getState().rebaseDraft(path, `saved:${path}`)
      return new Map(paths.map((path) => [path, 'saved' as const]))
    },
  )
  const actions = createProjectFileActions({
    workflowId: 'wf-1',
    target: 'workflow',
    client,
    notify,
    getBaseline: () => baselineOverride,
    getStore: useIdeStore.getState,
    isCurrent,
    getProjectPaths: () => new Set(baselineOverride.keys()),
    ownerOf: (path) => (path.startsWith('steps/') ? 'step' : 'project'),
    saveSteps,
    commit,
    refresh,
    canEdit,
  })
  return { client, notify, refresh, commit, saveSteps, actions }
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

  it('the create toast offers Copy import, which puts the import path on the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const { notify, actions } = setup()
    await actions.createFile('services/new.ts')
    const options = notify.success.mock.calls[0]![1] as {
      action: { label: string; onClick: () => void }
    }
    expect(options.action.label).toBe('Copy import')
    options.action.onClick()
    expect(writeText).toHaveBeenCalledWith('#app/services/new')
  })

  it('a file with no import path (package.json) gets no Copy import', async () => {
    const { notify, actions } = setup()
    await actions.createFile('package.json', '{}')
    expect(notify.success.mock.calls[0]![1]).toBeUndefined()
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

describe('project file actions and step sources', () => {
  beforeEach(() => {
    useIdeStore.getState().resetSession()
  })

  it('saveFile of a step source goes to the step saver, never to a file write, and does not commit', async () => {
    useIdeStore.getState().setDraft(STEP, 'return 2', 'h-step')
    const { client, saveSteps, commit, refresh, actions } = setup()
    expect(await actions.saveFile(STEP)).toBe(true)
    expect(saveSteps).toHaveBeenCalledWith([STEP])
    expect(client.putProjectFile).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
    // The saver refetches by itself.
    expect(refresh).not.toHaveBeenCalled()
  })

  it('saveAll posts every dirty step draft once and writes the files one by one, then commits once', async () => {
    const store = useIdeStore.getState()
    store.setDraft(STEP, 'return 2', 'h-step')
    store.setDraft('steps/other.ts', 'orphan edit', 'h-o')
    store.setDraft('config/env.ts', 'edited env', 'h-env')
    store.setDraft('config/other.ts', 'edited other', 'h-other')
    const { client, saveSteps, commit, refresh, actions } = setup()
    expect(await actions.saveAll()).toBe(4)
    expect(saveSteps).toHaveBeenCalledTimes(1)
    expect(new Set(saveSteps.mock.calls[0]![0])).toEqual(new Set([STEP, 'steps/other.ts']))
    expect(client.putProjectFile).toHaveBeenCalledTimes(2)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledTimes(1)
    // The commit comes before the refetch, so the refetch sees the recorded version.
    expect(commit.mock.invocationCallOrder[0]!).toBeLessThan(refresh.mock.invocationCallOrder[0]!)
  })

  it('saveFiles saves only the paths it was given and answers in their order', async () => {
    const store = useIdeStore.getState()
    store.setDraft(STEP, 'return 2', 'h-step')
    store.setDraft('config/env.ts', 'edited env', 'h-env')
    store.setDraft('config/other.ts', 'edited other', 'h-other')
    const { client, saveSteps, actions } = setup()
    expect(await actions.saveFiles(['config/env.ts', STEP])).toEqual([true, true])
    expect(saveSteps).toHaveBeenCalledWith([STEP])
    expect(client.putProjectFile).toHaveBeenCalledTimes(1)
    expect(useIdeStore.getState().drafts['config/other.ts']?.source).toBe('edited other')
  })

  it('a batch of files only does not touch the step saver; a batch of steps only does not commit', async () => {
    const store = useIdeStore.getState()
    store.setDraft('config/env.ts', 'edited env', 'h-env')
    const { saveSteps, commit, actions } = setup()
    expect(await actions.saveAll()).toBe(1)
    expect(saveSteps).not.toHaveBeenCalled()
    expect(commit).toHaveBeenCalledTimes(1)

    // The refetch would have found the saved draft clean and dropped it.
    useIdeStore.getState().clearDraft('config/env.ts')
    useIdeStore.getState().setDraft(STEP, 'return 2', 'h-step')
    expect(await actions.saveAll()).toBe(1)
    expect(saveSteps).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('reports a step draft the saver refused on its own tab, like a file conflict', async () => {
    useIdeStore.getState().setDraft(STEP, 'return 2', 'stale')
    const { saveSteps, actions } = setup()
    saveSteps.mockResolvedValueOnce(new Map([[STEP, 'conflict' as const]]))
    expect(await actions.saveFile(STEP)).toBe(false)
    expect(useIdeStore.getState().activePath).toBe(STEP)
  })

  it('says a step whose node is gone cannot be saved, in canvas terms, and shows the file', async () => {
    useIdeStore.getState().setDraft('steps/gone.ts', 'orphan', 'h-gone')
    const { saveSteps, notify, actions } = setup()
    saveSteps.mockResolvedValueOnce(new Map([['steps/gone.ts', 'deleted' as const]]))
    expect(await actions.saveFile('steps/gone.ts')).toBe(false)
    expect(notify.error).toHaveBeenCalledWith(
      'Couldn’t save gone.ts',
      expect.objectContaining({ description: expect.stringContaining('removed from the canvas') }),
    )
    expect(useIdeStore.getState().activePath).toBe('steps/gone.ts')
  })

  it('a graph conflict is not toasted and not shown as a file conflict; the notice carries it', async () => {
    useIdeStore.getState().setDraft(STEP, 'return 2', 'h-step')
    const { saveSteps, notify, actions } = setup()
    saveSteps.mockResolvedValueOnce(new Map([[STEP, 'graph-conflict' as const]]))
    expect(await actions.saveFile(STEP)).toBe(false)
    expect(notify.error).not.toHaveBeenCalled()
    expect(useIdeStore.getState().activePath).toBeNull()
  })

  it('overwriteFile of a step rebases the draft onto the compared code and posts it', async () => {
    useIdeStore.getState().setDraft(STEP, 'mine', 'stale')
    useIdeStore.getState().setConflict(STEP, { currentHash: 'h-step' })
    const { client, saveSteps, actions } = setup()
    expect(await actions.overwriteFile(STEP, 'h-step')).toBe(true)
    expect(saveSteps).toHaveBeenCalledWith([STEP])
    expect(client.putProjectFile).not.toHaveBeenCalled()
    // Rebased before the post, which the stand-in saver then rebased again.
    expect(useIdeStore.getState().drafts[STEP]?.baseHash).toBe(`saved:${STEP}`)
    expect(useIdeStore.getState().conflicts[STEP]).toBeUndefined()
  })

  it('recreateFile, renameFile and deleteFile do nothing for a step source', async () => {
    useIdeStore.getState().setDraft('steps/gone.ts', 'orphan', 'h-gone')
    const { client, actions } = setup()
    expect(await actions.recreateFile('steps/gone.ts')).toBe(false)
    expect(await actions.renameFile(STEP, 'lib/validate.ts')).toBe(false)
    expect(await actions.deleteFile(STEP)).toBe(false)
    expect(client.putProjectFile).not.toHaveBeenCalled()
    expect(client.deleteProjectFile).not.toHaveBeenCalled()
  })

  it('deleteFolder leaves step sources and their drafts alone', async () => {
    useIdeStore.getState().setDraft(STEP, 'return 2', 'h-step')
    const { client, actions, notify } = setup()
    expect(await actions.deleteFolder('steps')).toBe(true)
    expect(client.deleteProjectFile).not.toHaveBeenCalled()
    expect(useIdeStore.getState().drafts[STEP]?.source).toBe('return 2')
    expect(notify.success).toHaveBeenCalledWith('Deleted steps')
  })

  it('every landed file write records the version once, after the write and before the refetch', async () => {
    const { client, commit, refresh, actions } = setup()
    await actions.createFile('lib/new.ts')
    expect(commit).toHaveBeenCalledTimes(1)
    await actions.deleteFile('config/other.ts')
    expect(commit).toHaveBeenCalledTimes(2)
    useIdeStore.getState().setDraft('config/env.ts', 'v2', 'h-env')
    await actions.overwriteFile('config/env.ts', 'h-env')
    expect(commit).toHaveBeenCalledTimes(3)
    useIdeStore.getState().setDraft('lib/gone.ts', 'copy', 'h-gone')
    await actions.recreateFile('lib/gone.ts')
    expect(commit).toHaveBeenCalledTimes(4)
    expect(client.putProjectFile).toHaveBeenCalledTimes(3)
    expect(refresh).toHaveBeenCalledTimes(4)
  })

  it('a refused write records no version', async () => {
    useIdeStore.getState().setDraft('config/env.ts', 'mine', 'h-env')
    const { client, commit, actions } = setup()
    client.putProjectFile.mockRejectedValueOnce(new ProjectFileConflictError('moved', 'h-agent'))
    expect(await actions.saveFile('config/env.ts')).toBe(false)
    expect(commit).not.toHaveBeenCalled()
  })
})

describe('project file actions record a version only for a write that landed', () => {
  beforeEach(() => {
    useIdeStore.getState().resetSession()
  })

  it('deleteFolder commits nothing when every delete was refused, but still reads the files back', async () => {
    const { client, commit, refresh, actions } = setup()
    client.deleteProjectFile.mockRejectedValue(new ProjectFileConflictError('moved', 'h-new'))
    expect(await actions.deleteFolder('config')).toBe(false)
    expect(commit).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
  })

  it('a handlers.ts saved ahead of a conversion that then fails is still recorded and read back', async () => {
    useIdeStore.getState().setDraft('handlers.ts', '@fetch function mine() {}', null)
    const { client, commit, refresh, actions } = setup()
    client.convertHandlers.mockRejectedValueOnce(new ApiError('Nope', 500))
    expect(await actions.convertHandlers()).toBeNull()
    expect(client.putProjectFile).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

describe('project file actions in a workspace that cannot edit', () => {
  beforeEach(() => {
    useIdeStore.getState().resetSession()
  })

  it('sends nothing from any entry point: a view gone read-only under open drafts writes no file and no version', async () => {
    const store = useIdeStore.getState()
    store.setDraft(STEP, 'return 2', 'h-step')
    store.setDraft('config/env.ts', 'edited env', 'h-env')
    store.setDraft('lib/gone.ts', 'copy', 'h-gone')
    const { client, saveSteps, commit, actions } = setup(
      baseline,
      () => true,
      () => false,
    )
    expect(await actions.saveFile(STEP)).toBe(false)
    expect(await actions.saveFile('config/env.ts')).toBe(false)
    expect(await actions.saveFiles([STEP, 'config/env.ts'])).toEqual([false, false])
    expect(await actions.saveAll()).toBe(0)
    expect(await actions.overwriteFile('config/env.ts', 'h-env')).toBe(false)
    expect(await actions.recreateFile('lib/gone.ts')).toBe(false)
    expect(await actions.createFile('lib/new.ts')).toBe(false)
    expect(await actions.renameFile('config/env.ts', 'lib/env.ts')).toBe(false)
    expect(await actions.deleteFile('config/env.ts')).toBe(false)
    expect(await actions.deleteFolder('config')).toBe(false)
    expect(await actions.convertHandlers()).toBeNull()
    expect(saveSteps).not.toHaveBeenCalled()
    expect(client.putProjectFile).not.toHaveBeenCalled()
    expect(client.deleteProjectFile).not.toHaveBeenCalled()
    expect(client.convertHandlers).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
    // The drafts are untouched: nothing was saved, nothing was dropped.
    expect(useIdeStore.getState().drafts[STEP]?.source).toBe('return 2')
    expect(useIdeStore.getState().drafts['config/env.ts']?.source).toBe('edited env')
  })

  it('reads the flag when the action starts, not when the actions were built', async () => {
    useIdeStore.getState().setDraft('config/env.ts', 'edited env', 'h-env')
    let editable = true
    const { client, actions } = setup(
      baseline,
      () => true,
      () => editable,
    )
    editable = false
    expect(await actions.saveFile('config/env.ts')).toBe(false)
    editable = true
    expect(await actions.saveFile('config/env.ts')).toBe(true)
    expect(client.putProjectFile).toHaveBeenCalledTimes(1)
  })
})
