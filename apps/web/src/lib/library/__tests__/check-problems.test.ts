import { describe, expect, it } from 'vitest'
import type { ApiLibraryTreeItem } from '../../library-api'
import { checkProblems, conflictProblems } from '../check-problems'

const node: ApiLibraryTreeItem = {
  id: 'n',
  kind: 'node',
  slug: 'post',
  name: 'Post',
  latestVersion: '2.0.0',
  files: [
    { path: '2.0.1/node.json', hash: 'a', readOnly: false },
    { path: '2.0.1/template.ts', hash: 'b', readOnly: false },
  ],
}

describe('checkProblems', () => {
  it('puts a field’s finding on its file and keeps findings about no file', () => {
    const problems = checkProblems(node, [
      { path: '2.0.1/node.json.version', message: 'version "2.0.0" must match its folder 2.0.1' },
      { path: '2.0.1/template.ts', message: 'Exceeds 1 bytes' },
      { path: '#modules/fmt', message: 'No module "fmt" here or in the project’s library' },
    ])
    expect(problems.map((p) => [p.file, p.message])).toEqual([
      ['nodes/post/2.0.1/node.json', 'version: version "2.0.0" must match its folder 2.0.1'],
      ['nodes/post/2.0.1/template.ts', 'Exceeds 1 bytes'],
      ['', 'Post: #modules/fmt: No module "fmt" here or in the project’s library'],
    ])
  })

  it('warns about a package asked for at two ranges, naming both', () => {
    const [warning] = conflictProblems([
      {
        name: 'zod',
        declared: [
          { path: 'modules/a/package.json', range: '^3' },
          { path: 'modules/b/package.json', range: '^4' },
        ],
      },
    ])
    expect(warning).toMatchObject({ file: 'modules/b/package.json', severity: 'warning' })
    expect(warning!.message).toContain('modules/a/package.json wants ^3')
  })
})
