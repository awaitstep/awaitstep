import { describe, expect, it } from 'vitest'
import { libraryItemHref } from '../item-links'

const SALES = { org: 'acme', project: 'project-101', workspace: 'sales' }

describe('libraryItemHref', () => {
  it('opens a workspace item in that workspace’s Library IDE', () => {
    expect(libraryItemHref(SALES, { itemId: 'lead', owner: 'workspace' })).toBe(
      '/acme/project-101/sales/scripts-nodes/code?item=lead',
    )
  })

  it('opens a project item in the project’s Library IDE, on a file when named', () => {
    expect(libraryItemHref(SALES, { itemId: 'crm', owner: 'project' }, 'index.ts')).toBe(
      '/acme/project-101/scripts-nodes/code?item=crm&file=index.ts',
    )
  })
})
