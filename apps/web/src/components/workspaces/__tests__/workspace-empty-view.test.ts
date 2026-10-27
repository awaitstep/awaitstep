import { describe, expect, it } from 'vitest'
import { emptyViewFor } from '../workspace-empty-view'

describe('which welcome an empty workspace shows', () => {
  it('none while it has a workflow or a function', () => {
    expect(emptyViewFor({ workflows: 1, functions: 0, workspacesInProject: 1 })).toBeNull()
    expect(emptyViewFor({ workflows: 0, functions: 2, workspacesInProject: 3 })).toBeNull()
  })

  it('the project’s welcome when it is the project’s only workspace', () => {
    expect(emptyViewFor({ workflows: 0, functions: 0, workspacesInProject: 1 })).toBe('project')
  })

  it('the workspace’s own welcome when the project has others', () => {
    expect(emptyViewFor({ workflows: 0, functions: 0, workspacesInProject: 3 })).toBe('workspace')
  })
})
