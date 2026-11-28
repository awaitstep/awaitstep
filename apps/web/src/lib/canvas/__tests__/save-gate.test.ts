import { describe, expect, it } from 'vitest'
import { canSaveCanvas, type CanvasSaveState } from '../save-gate'

const ready: CanvasSaveState = {
  readOnly: false,
  isSaving: false,
  isDirty: true,
  saveConflict: false,
}

describe('canvas save gate', () => {
  it('saves a changed, editable canvas', () => {
    expect(canSaveCanvas(ready)).toBe(true)
  })

  it.each<[string, Partial<CanvasSaveState>]>([
    ['nothing changed', { isDirty: false }],
    ['a save is running', { isSaving: true }],
    ['Code moved the workflow', { saveConflict: true }],
    ['the canvas is read-only', { readOnly: true }],
  ])('does not save when %s', (_, change) => {
    expect(canSaveCanvas({ ...ready, ...change })).toBe(false)
  })
})
