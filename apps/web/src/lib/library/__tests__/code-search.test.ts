import { describe, expect, it } from 'vitest'
import { libraryCodePath } from '../../dashboard-paths'
import { parseLibraryCodeSearch } from '../code-search'

describe('the Library IDE’s URL', () => {
  it('reads the item, the file and a new item’s kind', () => {
    expect(
      parseLibraryCodeSearch({ item: 'lead', file: 'modules/a/index.ts', new: 'node' }),
    ).toEqual({ item: 'lead', file: 'modules/a/index.ts', new: 'node' })
  })

  it('ignores a kind that is neither module nor node', () => {
    expect(parseLibraryCodeSearch({ new: 'workflow' })).toEqual({})
  })

  it('links the Library page’s New buttons to the IDE with the kind to name', () => {
    const sales = { org: 'acme', project: 'p', workspace: 'sales' }
    expect(libraryCodePath(sales, { new: 'module' })).toBe(
      '/acme/p/sales/scripts-nodes/code?new=module',
    )
  })
})
