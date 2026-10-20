import { describe, it, expect } from 'vitest'
import { surfaceSwitchTarget, unsavedDialogCopy, WORKSPACE_SURFACES } from '../workflows/surfaces'

describe('surfaceSwitchTarget', () => {
  it('recognises the switch to the other surface of the same workflow', () => {
    expect(
      surfaceSwitchTarget({
        from: 'canvas',
        workflowId: 'wf-1',
        nextPathname: '/workflows/wf-1/code',
      }),
    ).toBe('code')
    expect(
      surfaceSwitchTarget({
        from: 'code',
        workflowId: 'wf-1',
        nextPathname: '/workflows/wf-1/canvas',
      }),
    ).toBe('canvas')
  })

  it('ignores a trailing slash on the destination', () => {
    expect(
      surfaceSwitchTarget({
        from: 'code',
        workflowId: 'wf-1',
        nextPathname: '/workflows/wf-1/canvas/',
      }),
    ).toBe('canvas')
  })

  it('is not a switch when the destination leaves the workflow', () => {
    // The whole point of the distinction: these are departures, and get the
    // departure wording rather than "the other surface opens the saved
    // version", which would be nonsense here.
    for (const pathname of [
      '/workflows',
      '/workflows/wf-1',
      '/workflows/wf-1/runs',
      '/workflows/wf-1/deployments',
      '/dashboard',
    ]) {
      expect(
        surfaceSwitchTarget({ from: 'code', workflowId: 'wf-1', nextPathname: pathname }),
      ).toBe(null)
    }
  })

  it('is not a switch when another workflow has the same surface', () => {
    // Same surface name, different workflow: leaving this workflow's work
    // behind, so it must not be worded as staying put.
    expect(
      surfaceSwitchTarget({
        from: 'code',
        workflowId: 'wf-1',
        nextPathname: '/workflows/wf-2/canvas',
      }),
    ).toBe(null)
  })

  it('is not a switch when the destination is the surface already shown', () => {
    expect(
      surfaceSwitchTarget({
        from: 'code',
        workflowId: 'wf-1',
        nextPathname: '/workflows/wf-1/code',
      }),
    ).toBe(null)
  })
})

describe('unsavedDialogCopy', () => {
  const unsaved = 'Two files have unsaved changes.'

  it('offers saving first when switching surface', () => {
    const copy = unsavedDialogCopy({ to: 'canvas', unsaved, canSave: true })
    expect(copy.confirmLabel).toBe('Save and switch')
    expect(copy.secondaryLabel).toBe('Switch without saving')
    // Not a warning: the primary action keeps the work.
    expect(copy.variant).toBe('default')
  })

  it('says what is unsaved and what the other surface will show', () => {
    const copy = unsavedDialogCopy({ to: 'code', unsaved, canSave: true })
    expect(copy.description).toContain(unsaved)
    expect(copy.description).toContain('last saved version')
    expect(copy.title).toContain('Code')
  })

  it('always says the work is lost, on every branch', () => {
    // Both surfaces tear down their unsaved state on unmount, so going
    // without saving really does discard it. Saying only that the changes
    // "will not appear" on the other side — as an earlier version did —
    // reads as if they were still safely somewhere.
    for (const to of [...WORKSPACE_SURFACES, null]) {
      for (const canSave of [true, false]) {
        const copy = unsavedDialogCopy({ to, unsaved, canSave })
        expect(copy.description).toMatch(/lost|discard/i)
      }
    }
  })

  it('never frames a switch as leaving', () => {
    for (const to of WORKSPACE_SURFACES) {
      const copy = unsavedDialogCopy({ to, unsaved, canSave: true })
      expect(`${copy.title} ${copy.confirmLabel}`).not.toMatch(/leav/i)
    }
  })

  it('drops the save offer when this version cannot be saved over', () => {
    const copy = unsavedDialogCopy({ to: 'canvas', unsaved, canSave: false })
    expect(copy.confirmLabel).toBe('Open Canvas')
    expect(copy.secondaryLabel).toBeUndefined()
    expect(copy.variant).toBe('warning')
  })

  it('warns about loss when the navigation really is a departure', () => {
    const copy = unsavedDialogCopy({ to: null, unsaved, canSave: true })
    expect(copy.title).toBe('Unsaved changes')
    expect(copy.description).toContain('lost if you leave')
    expect(copy.confirmLabel).toBe('Leave')
    expect(copy.secondaryLabel).toBeUndefined()
    expect(copy.variant).toBe('warning')
  })
})
