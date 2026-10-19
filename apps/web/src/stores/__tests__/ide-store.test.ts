import { beforeEach, describe, expect, it } from 'vitest'
import type { GeneratedFile } from '@awaitstep/codegen'
import { useIdeLayoutStore } from '../ide-layout-store'
import { useIdeStore } from '../ide-store'

const baseline = new Map<string, GeneratedFile>([
  ['a.ts', { path: 'a.ts', source: 'base', role: 'module' }],
])

describe('useIdeStore (session)', () => {
  beforeEach(() => {
    useIdeStore.getState().resetSession()
  })

  it('opens, activates and closes files through the tab rules', () => {
    const s = useIdeStore.getState()
    s.openFile('worker.ts')
    s.openFile('src/nodes/a.ts')
    s.openFile('worker.ts')
    expect(useIdeStore.getState()).toMatchObject({
      openPaths: ['worker.ts', 'src/nodes/a.ts'],
      activePath: 'worker.ts',
    })
    useIdeStore.getState().closeFile('worker.ts')
    expect(useIdeStore.getState().activePath).toBe('src/nodes/a.ts')
  })

  it('reveal opens the file and records the target until the editor clears it', () => {
    useIdeStore.getState().revealLocation({ path: 'src/nodes/a.ts', line: 7, column: 3 })
    expect(useIdeStore.getState()).toMatchObject({
      activePath: 'src/nodes/a.ts',
      reveal: { path: 'src/nodes/a.ts', line: 7, column: 3 },
    })
    useIdeStore.getState().clearReveal()
    expect(useIdeStore.getState().reveal).toBeNull()
  })

  it('allows only one dialog at a time and remembers its target', () => {
    useIdeStore.getState().showDialog('renameFile', 'a.ts')
    expect(useIdeStore.getState()).toMatchObject({ dialog: 'renameFile', dialogTarget: 'a.ts' })
    useIdeStore.getState().showDialog('quickOpen')
    expect(useIdeStore.getState()).toMatchObject({ dialog: 'quickOpen', dialogTarget: null })
    useIdeStore.getState().closeDialog()
    expect(useIdeStore.getState().dialog).toBeNull()
  })

  it('tracks drafts and reconciles them against the baseline', () => {
    const s = useIdeStore.getState()
    s.setDraft('a.ts', 'edited', 'h1')
    s.setDraft('b.ts', 'new', null)
    useIdeStore.getState().reconcileDrafts(baseline)
    expect(useIdeStore.getState().drafts).toEqual({
      'a.ts': { source: 'edited', baseHash: 'h1' },
      'b.ts': { source: 'new', baseHash: null },
    })
    useIdeStore.getState().setDraft('a.ts', 'base', 'h1')
    useIdeStore.getState().reconcileDrafts(baseline)
    expect(useIdeStore.getState().drafts).toEqual({ 'b.ts': { source: 'new', baseHash: null } })
    useIdeStore.getState().clearDraft('b.ts')
    expect(useIdeStore.getState().drafts).toEqual({})
  })

  it('keeps the hash an edit started from across keystrokes until a save rebases it', () => {
    useIdeStore.getState().setDraft('a.ts', 'e', 'h1')
    useIdeStore.getState().setDraft('a.ts', 'ed', 'h2-newer-fetch')
    expect(useIdeStore.getState().drafts['a.ts']).toEqual({ source: 'ed', baseHash: 'h1' })
    useIdeStore.getState().rebaseDraft('a.ts', 'h3')
    expect(useIdeStore.getState().drafts['a.ts']).toEqual({ source: 'ed', baseHash: 'h3' })
    useIdeStore.getState().rebaseDraft('missing.ts', 'h4')
    expect(useIdeStore.getState().drafts['missing.ts']).toBeUndefined()
  })

  it('moves a draft and its tab when a file is renamed', () => {
    const s = useIdeStore.getState()
    s.openFile('a.ts')
    s.openFile('z.ts')
    useIdeStore.getState().setDraft('a.ts', 'edited', 'h1')
    useIdeStore.getState().moveFile('a.ts', 'config/a.ts')
    expect(useIdeStore.getState()).toMatchObject({
      openPaths: ['z.ts', 'config/a.ts'],
      activePath: 'config/a.ts',
      drafts: { 'config/a.ts': { source: 'edited', baseHash: 'h1' } },
    })
  })

  it('drops tabs for files that vanished from the bundle', () => {
    const s = useIdeStore.getState()
    s.openFile('a.ts')
    s.openFile('b.ts')
    useIdeStore.getState().pruneFiles(['b.ts'])
    expect(useIdeStore.getState()).toMatchObject({ openPaths: ['b.ts'], activePath: 'b.ts' })
  })

  it('resetSession clears tabs, drafts, reveal and dialog', () => {
    const s = useIdeStore.getState()
    s.openFile('a.ts')
    s.setDraft('a.ts', 'x', null)
    s.showDialog('palette')
    useIdeStore.getState().resetSession()
    expect(useIdeStore.getState()).toMatchObject({
      openPaths: [],
      activePath: null,
      reveal: null,
      dialog: null,
      drafts: {},
    })
  })
})

describe('useIdeLayoutStore (preferences)', () => {
  it('toggles panels and remembers the requested dock tab', () => {
    const s = useIdeLayoutStore.getState()
    const before = s.explorerOpen
    s.toggleExplorer()
    expect(useIdeLayoutStore.getState().explorerOpen).toBe(!before)
    useIdeLayoutStore.setState({ dockOpen: false })
    useIdeLayoutStore.getState().showDock('run')
    expect(useIdeLayoutStore.getState()).toMatchObject({ dockOpen: true, dockTab: 'run' })
  })

  it('stores layouts per group without clobbering the other group', () => {
    useIdeLayoutStore.getState().setLayout('workspace', { explorer: 20, main: 80 })
    useIdeLayoutStore.getState().setLayout('editor', { editor: 70, dock: 30 })
    expect(useIdeLayoutStore.getState().layouts).toEqual({
      workspace: { explorer: 20, main: 80 },
      editor: { editor: 70, dock: 30 },
    })
  })
})
