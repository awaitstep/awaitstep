import { describe, expect, it } from 'vitest'
import { fileEditability, workspaceEditability } from '../ide/editability'

describe('workspaceEditability', () => {
  it('allows editing the current version', () => {
    expect(workspaceEditability({ historical: false })).toEqual({
      readOnly: false,
      message: null,
    })
  })

  it('freezes older versions', () => {
    const result = workspaceEditability({ historical: true })
    expect(result.readOnly).toBe(true)
    expect(result.message).toMatch(/Older versions/)
  })
})

describe('fileEditability', () => {
  const editable = workspaceEditability({ historical: false })

  it('keeps generated files read-only even in an editable workspace', () => {
    const result = fileEditability('generated', editable)
    expect(result.readOnly).toBe(true)
    expect(result.message).toMatch(/project file/)
  })

  it('lets project files follow the workspace', () => {
    expect(fileEditability('project', editable)).toBe(editable)
    const frozen = workspaceEditability({ historical: true })
    expect(fileEditability('project', frozen)).toBe(frozen)
  })
})
