import { describe, expect, it } from 'vitest'
import { OLDER_VERSION_MESSAGE, workspaceEditability } from '../editability'

describe('workspaceEditability', () => {
  it('lets the latest version be edited by a role that may edit', () => {
    expect(workspaceEditability({ historical: false, roleRefusal: null })).toEqual({
      readOnly: false,
      message: null,
    })
  })

  it('freezes an older version, whoever looks', () => {
    expect(workspaceEditability({ historical: true })).toEqual({
      readOnly: true,
      message: OLDER_VERSION_MESSAGE,
    })
  })

  it('is read-only for a Viewer, saying why', () => {
    expect(
      workspaceEditability({
        historical: false,
        roleRefusal: 'Building, deploying and sharing need an Editor',
      }),
    ).toEqual({ readOnly: true, message: 'Building, deploying and sharing need an Editor' })
  })
})
