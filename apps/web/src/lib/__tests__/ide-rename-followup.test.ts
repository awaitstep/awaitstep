import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SourceFile } from '../api-client'
import { createProjectFileActions, type ProjectFileClient } from '../ide/project-actions'
import { useIdeStore } from '../../stores/ide-store'

function file(path: string, source: string, hash?: string): SourceFile {
  return { path, source, role: 'module', ...(hash && { hash }) }
}

const IMPORT = "import { refund } from '#app/lib/payments/refund'\n"

function baselineOf(extra: SourceFile[] = []) {
  return new Map<string, SourceFile>(
    [
      file('lib/payments/refund.ts', 'export const refund = 1', 'h-refund'),
      file('handlers/a.ts', IMPORT, 'h-a'),
      file('handlers/b.ts', IMPORT + 'refund()', 'h-b'),
      file('lib/c.ts', "import('#app/lib/payments/refund.js')", 'h-c'),
      file('lib/untouched.ts', 'export {}', 'h-u'),
      // Generated code mentions it too, but is not the project's to fix.
      file('worker.ts', IMPORT),
      ...extra,
    ].map((f) => [f.path, f]),
  )
}

// The project's own paths: everything but generated code (which has no entry here).
function ownedBy(baseline: Map<string, SourceFile>): ReadonlySet<string> {
  return new Set([...baseline.keys()].filter((path) => path !== 'worker.ts'))
}

function setup(baseline = baselineOf()) {
  const client = {
    putProjectFile: vi.fn(async (_i: string, path: string, source: string) => ({
      path,
      hash: `saved:${source}`,
      size: source.length,
      updatedAt: 'now',
    })),
    deleteProjectFile: vi.fn(async () => undefined),
    convertHandlers: vi.fn(),
  } as unknown as ProjectFileClient
  const notify = { success: vi.fn(), error: vi.fn() }
  const onShowImporters = vi.fn()
  const actions = createProjectFileActions({
    workflowId: 'wf-1',
    target: 'workflow',
    client,
    notify,
    getBaseline: () => baseline,
    getStore: useIdeStore.getState,
    getProjectPaths: () => ownedBy(baseline),
    refresh: async () => undefined,
    onShowImporters,
  })
  return { notify, actions, onShowImporters }
}

describe('rename follow-up', () => {
  beforeEach(() => useIdeStore.getState().resetSession())

  it('says how many files still import the old path and offers to show them', async () => {
    const { notify, actions, onShowImporters } = setup()
    await actions.renameFile('lib/payments/refund.ts', 'lib/payments/refunds.ts')
    expect(notify.success).toHaveBeenCalledTimes(1)
    const [line, options] = notify.success.mock.calls[0]!
    expect(line).toBe('Renamed to refunds.ts')
    expect(options.description).toBe('3 files still import the old path.')
    expect(options.action.label).toBe('Show')
    options.action.onClick()
    expect(onShowImporters).toHaveBeenCalledWith('#app/lib/payments/refund')
  })

  it("counts a virtual seed (no hash) as the project's own, as the Search list does", async () => {
    const withSeed = new Map(baselineOf())
    withSeed.set('lib/seed.ts', file('lib/seed.ts', IMPORT))
    const { notify, actions } = setup(withSeed)
    await actions.renameFile('lib/payments/refund.ts', 'lib/payments/refunds.ts')
    expect(notify.success.mock.calls[0]![1].description).toBe('4 files still import the old path.')
  })

  it('is singular for one importer', async () => {
    const only = new Map([
      ['lib/payments/refund.ts', file('lib/payments/refund.ts', 'x', 'h')],
      ['lib/a.ts', file('lib/a.ts', IMPORT, 'h-a')],
    ])
    const { notify, actions } = setup(only)
    await actions.renameFile('lib/payments/refund.ts', 'lib/payments/refunds.ts')
    expect(notify.success.mock.calls[0]![1].description).toBe('1 file still imports the old path.')
  })

  it('stays a plain toast when nobody imports the file', async () => {
    const { notify, actions } = setup()
    await actions.renameFile('lib/untouched.ts', 'lib/moved.ts')
    expect(notify.success).toHaveBeenCalledWith('Renamed to moved.ts')
  })

  it('counts an importer whose import is only in an unsaved edit, and not one whose draft removed it', async () => {
    const store = useIdeStore.getState()
    store.setDraft('lib/untouched.ts', IMPORT, 'h-u')
    store.setDraft('handlers/a.ts', 'export {}', 'h-a')
    store.setDraft('handlers/b.ts', 'export {}', 'h-b')
    const { notify, actions } = setup()
    await actions.renameFile('lib/payments/refund.ts', 'lib/payments/refunds.ts')
    // untouched (draft) + c.ts; a and b no longer import it.
    expect(notify.success.mock.calls[0]![1].description).toBe('2 files still import the old path.')
  })

  it('offers no follow-up for a file other files cannot import by #app/ (handlers)', async () => {
    const base = baselineOf([file('handlers/fetch.ts', 'export {}', 'h-f')])
    const { notify, actions } = setup(base)
    await actions.renameFile('handlers/fetch.ts', 'handlers/fetch2.ts')
    expect(notify.success).toHaveBeenCalledWith('Renamed to fetch2.ts')
  })

  it('does not announce anything when the old file could not be removed', async () => {
    const { notify } = setup()
    const client = {
      putProjectFile: vi.fn(async (_i: string, path: string) => ({
        path,
        hash: 'h',
        size: 1,
        updatedAt: 'now',
      })),
      deleteProjectFile: vi.fn(async () => {
        throw new Error('nope')
      }),
      convertHandlers: vi.fn(),
    } as unknown as ProjectFileClient
    const failing = createProjectFileActions({
      workflowId: 'wf-1',
      target: 'workflow',
      client,
      notify,
      getBaseline: () => baselineOf(),
      getStore: useIdeStore.getState,
      getProjectPaths: () => ownedBy(baselineOf()),
      refresh: async () => undefined,
    })
    await failing.renameFile('lib/payments/refund.ts', 'lib/payments/refunds.ts')
    expect(notify.success).not.toHaveBeenCalled()
  })
})
