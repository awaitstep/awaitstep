import { describe, expect, it } from 'vitest'
import { emptyViewFor } from '../workspace-empty-view'

describe('which welcome an empty workspace shows', () => {
  it('none while it has a workflow or a function', () => {
    expect(emptyViewFor({ workflows: 1, functions: 0 })).toBeNull()
    expect(emptyViewFor({ workflows: 0, functions: 2 })).toBeNull()
  })

  it('the workspace’s own welcome when empty, a new project’s only workspace included', () => {
    expect(emptyViewFor({ workflows: 0, functions: 0 })).toBe('workspace')
  })
})
