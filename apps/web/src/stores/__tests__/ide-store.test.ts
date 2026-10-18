import { beforeEach, describe, expect, it } from 'vitest'
import { useIdeLayoutStore } from '../ide-layout-store'
import { useIdeStore } from '../ide-store'

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

  it('allows only one dialog at a time', () => {
    useIdeStore.getState().showDialog('palette')
    useIdeStore.getState().showDialog('quickOpen')
    expect(useIdeStore.getState().dialog).toBe('quickOpen')
    useIdeStore.getState().closeDialog()
    expect(useIdeStore.getState().dialog).toBeNull()
  })

  it('drops tabs for files that vanished from the bundle', () => {
    const s = useIdeStore.getState()
    s.openFile('a.ts')
    s.openFile('b.ts')
    useIdeStore.getState().pruneFiles(['b.ts'])
    expect(useIdeStore.getState()).toMatchObject({ openPaths: ['b.ts'], activePath: 'b.ts' })
  })

  it('resetSession clears tabs, reveal and dialog', () => {
    const s = useIdeStore.getState()
    s.openFile('a.ts')
    s.showDialog('palette')
    useIdeStore.getState().resetSession()
    expect(useIdeStore.getState()).toMatchObject({
      openPaths: [],
      activePath: null,
      reveal: null,
      dialog: null,
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
