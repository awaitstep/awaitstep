import { describe, expect, it } from 'vitest'
import { grantCounts, roleAbove } from '../workspace-roles'

describe('workspace roles', () => {
  it('ranks admin over editor over viewer', () => {
    expect(roleAbove('admin', 'editor')).toBe(true)
    expect(roleAbove('editor', 'viewer')).toBe(true)
    expect(roleAbove('editor', 'editor')).toBe(false)
  })

  it('counts a grant only above what the project gives', () => {
    expect(grantCounts('viewer', null)).toBe(true)
    expect(grantCounts('admin', 'editor')).toBe(true)
    expect(grantCounts('editor', 'editor')).toBe(false)
    expect(grantCounts('viewer', 'editor')).toBe(false)
  })
})
