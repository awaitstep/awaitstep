import { describe, expect, it } from 'vitest'
import { SOURCE_MODES } from '@awaitstep/codegen'
import { fileEditability, workspaceEditability } from '../ide/editability'

describe('workspaceEditability', () => {
  it('allows editing the current generated version only', () => {
    expect(workspaceEditability({ sourceMode: 'generated', historical: false })).toEqual({
      readOnly: false,
      message: null,
    })
  })

  it('freezes older versions regardless of mode', () => {
    for (const mode of SOURCE_MODES) {
      const result = workspaceEditability({ sourceMode: mode, historical: true })
      expect(result.readOnly).toBe(true)
      expect(result.message).toMatch(/Older versions/)
    }
  })

  it('points ejected versions at the source API without telling them to eject', () => {
    for (const mode of ['ejected', 'sdk'] as const) {
      const result = workspaceEditability({ sourceMode: mode, historical: false })
      expect(result.readOnly).toBe(true)
      expect(result.message).toMatch(/PUT \/source/)
      expect(result.message).not.toMatch(/eject the workflow/i)
    }
  })
})

describe('fileEditability', () => {
  const editable = workspaceEditability({ sourceMode: 'generated', historical: false })

  it('keeps generated files read-only even in an editable workspace', () => {
    const result = fileEditability('generated', editable)
    expect(result.readOnly).toBe(true)
    expect(result.message).toMatch(/project file/)
  })

  it('lets project files follow the workspace', () => {
    expect(fileEditability('project', editable)).toBe(editable)
    const frozen = workspaceEditability({ sourceMode: 'generated', historical: true })
    expect(fileEditability('project', frozen)).toBe(frozen)
  })
})
