import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildStepMap } from '../ide/step-map'
import { runStepQuickTest, selectStep, showStepsView } from '../ide/step-actions'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'

const map = buildStepMap({
  manifest: {
    irHash: 'h',
    steps: [
      { nodeId: 'a', varName: 'a', filePath: 'nodes/a.ts' },
      { nodeId: 'sleep', varName: 'sleep' },
    ],
  },
  nodeIds: ['a', 'sleep'],
  files: new Map([['nodes/a.ts', { source: '' }]]),
  projectPaths: new Set(),
})

const focus = vi.fn()

beforeEach(() => {
  focus.mockReset()
  useIdeStore.getState().resetSession()
  useIdeStore.getState().setEditorHandle({ focus, trigger: vi.fn(), searchSeed: () => null })
  useIdeLayoutStore.setState({ dockOpen: false, explorerOpen: false, sideBarTab: 'explorer' })
})

describe('selectStep', () => {
  it('selects the step and opens its file', () => {
    selectStep(map, 'a', 'stay')
    expect(useIdeStore.getState()).toMatchObject({
      selectedNodeId: 'a',
      activePath: 'nodes/a.ts',
      openPaths: ['nodes/a.ts'],
    })
  })

  it('leaves the keyboard where it is when asked to stay', () => {
    selectStep(map, 'a', 'stay')
    expect(focus).not.toHaveBeenCalled()
  })

  it('asks for the keyboard once the editor shows the step’s file, instead of using the editor on screen now', () => {
    // The handle may belong to a diff that unmounts when the file opens.
    selectStep(map, 'a', 'editor')
    expect(focus).not.toHaveBeenCalled()
    expect(useIdeStore.getState().editorFocusRequested).toBe(true)
  })

  it('asks the same while a Review or Compare tab is active', () => {
    useIdeStore.getState().openReview()
    selectStep(map, 'a', 'editor')
    expect(useIdeStore.getState().editorFocusRequested).toBe(true)
    expect(focus).not.toHaveBeenCalled()
  })

  it('focuses the diff’s editor at once for a step with no file while Review is active', () => {
    useIdeStore.getState().openReview()
    selectStep(map, 'sleep', 'editor')
    expect(focus).toHaveBeenCalledOnce()
    expect(useIdeStore.getState().editorFocusRequested).toBe(false)
  })

  it('only selects a step with no file, leaving the open tabs alone', () => {
    useIdeStore.getState().openFile('other.ts')
    selectStep(map, 'sleep', 'editor')
    expect(useIdeStore.getState().selectedNodeId).toBe('sleep')
    expect(useIdeStore.getState().openPaths).toEqual(['other.ts'])
  })

  it('selects a node the map has never heard of without opening anything', () => {
    selectStep(map, 'unknown', 'stay')
    expect(useIdeStore.getState().openPaths).toEqual([])
  })
})

describe('runStepQuickTest', () => {
  it('opens the step’s file with Quick test showing', () => {
    expect(runStepQuickTest(map, 'a')).toBe(true)
    expect(useIdeStore.getState().activePath).toBe('nodes/a.ts')
    expect(useIdeLayoutStore.getState()).toMatchObject({ dockOpen: true, dockTab: 'quickTest' })
  })

  it('refuses a step with no file and changes nothing', () => {
    expect(runStepQuickTest(map, 'sleep')).toBe(false)
    expect(useIdeLayoutStore.getState().dockOpen).toBe(false)
    expect(useIdeStore.getState().selectedNodeId).toBeNull()
  })
})

describe('showStepsView', () => {
  it('shows the side bar on Steps and asks for the keyboard', () => {
    showStepsView()
    expect(useIdeLayoutStore.getState()).toMatchObject({ explorerOpen: true, sideBarTab: 'steps' })
    expect(useIdeStore.getState().stepsFocusRequested).toBe(true)
  })
})

describe('the step selection belongs to the workflow it was made in', () => {
  it('is cleared when the workspace resets for another workflow', () => {
    selectStep(map, 'a', 'stay')
    useIdeStore.getState().resetSession()
    expect(useIdeStore.getState().selectedNodeId).toBeNull()
    expect(useIdeStore.getState().stepsFocusRequested).toBe(false)
  })
})
