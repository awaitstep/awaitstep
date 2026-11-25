import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LONG_TOAST_MS } from '../action-toast'
import {
  announceSaveWarnings,
  resetSaveWarnings,
  saveWarningOf,
  useSaveWarningsStore,
  type SaveWarning,
} from '../save-warnings'

const far: SaveWarning = { nodeId: 'call', nodeName: 'Call it', message: 'This calls "far".' }
const other: SaveWarning = { nodeId: 'send', nodeName: '', message: 'This calls "other".' }

describe('announceSaveWarnings', () => {
  const notify = { info: vi.fn() }

  beforeEach(() => {
    resetSaveWarnings()
    notify.info.mockClear()
  })

  it('names the node of the first warning and counts the rest', () => {
    announceSaveWarnings('wf-1', { graphHash: 'g-1', warnings: [far, other] }, notify)
    expect(notify.info).toHaveBeenCalledWith('Saved with 2 warnings', {
      description: 'Call it: This calls "far".',
      duration: LONG_TOAST_MS,
    })
  })

  it('says a warning with no node name as it is', () => {
    announceSaveWarnings('wf-1', { graphHash: 'g-1', warnings: [other] }, notify)
    expect(notify.info).toHaveBeenCalledWith('Saved with 1 warning', {
      description: 'This calls "other".',
      duration: LONG_TOAST_MS,
    })
  })

  it('says the same warnings once, and again once they changed or came back', () => {
    announceSaveWarnings('wf-1', { graphHash: 'g-1', warnings: [far] }, notify)
    announceSaveWarnings('wf-1', { graphHash: 'g-1', warnings: [far] }, notify)
    expect(notify.info).toHaveBeenCalledTimes(1)

    announceSaveWarnings('wf-1', { graphHash: 'g-1', warnings: [far, other] }, notify)
    expect(notify.info).toHaveBeenCalledTimes(2)

    announceSaveWarnings('wf-1', { graphHash: 'g-1' }, notify)
    announceSaveWarnings('wf-1', { graphHash: 'g-1', warnings: [far, other] }, notify)
    expect(notify.info).toHaveBeenCalledTimes(3)
  })

  it('keeps each workflow’s warnings apart', () => {
    announceSaveWarnings('wf-1', { graphHash: 'g-1', warnings: [far] }, notify)
    announceSaveWarnings('wf-2', { graphHash: 'g-1', warnings: [far] }, notify)
    expect(notify.info).toHaveBeenCalledTimes(2)
  })

  it('marks each warned node until a save comes back without it', () => {
    const marked = () => [...useSaveWarningsStore.getState().byNode]
    announceSaveWarnings('wf-1', { graphHash: 'g-1', warnings: [far, other] }, notify)
    expect(marked()).toEqual([
      ['call', 'This calls "far".'],
      ['send', 'This calls "other".'],
    ])
    // Said once, marked every time.
    announceSaveWarnings('wf-1', { graphHash: 'g-1', warnings: [far] }, notify)
    expect(marked()).toEqual([['call', 'This calls "far".']])
    announceSaveWarnings('wf-1', { graphHash: 'g-1' }, notify)
    expect(marked()).toEqual([])
  })

  it('shows a mark only on the workflow and version the save wrote', () => {
    announceSaveWarnings('wf-1', { graphHash: 'g-1', warnings: [far] }, notify)
    const state = useSaveWarningsStore.getState()
    expect(saveWarningOf(state, { workflowId: 'wf-1', graphHash: 'g-1' }, 'call')).toBe(
      'This calls "far".',
    )
    // A duplicate keeps the node ids; an older version or a newer save has another hash.
    expect(saveWarningOf(state, { workflowId: 'wf-2', graphHash: 'g-1' }, 'call')).toBeUndefined()
    expect(saveWarningOf(state, { workflowId: 'wf-1', graphHash: 'g-0' }, 'call')).toBeUndefined()
    expect(saveWarningOf(state, { workflowId: 'wf-1', graphHash: 'g-1' }, 'send')).toBeUndefined()
    expect(saveWarningOf(state, { workflowId: 'wf-1', graphHash: 'g-1' }, null)).toBeUndefined()
  })

  it('says nothing of a save with none', () => {
    announceSaveWarnings('wf-1', { graphHash: 'g-1', warnings: [] }, notify)
    expect(notify.info).not.toHaveBeenCalled()
  })
})
