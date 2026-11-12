import { describe, expect, it } from 'vitest'
import {
  libraryAcquisitionFiles,
  libraryRootOptions,
  mergeLibraryDependencies,
} from '../library-config'

function files(entries: Record<string, string>) {
  return new Map(Object.entries(entries).map(([path, source]) => [path, { source }]))
}

describe('library Monaco config', () => {
  it('maps #modules/<slug> to the module folder under the library root', () => {
    const options = libraryRootOptions('library-workspace-ws1')
    expect(options.baseUrl).toBe('awaitstep://workflow/library-workspace-ws1/')
    expect(options.paths['#modules/*']).toEqual(['modules/*', 'modules/*/index.ts'])
  })

  it('merges module and node dependencies and names packages asked for at two ranges', () => {
    const merged = mergeLibraryDependencies(
      files({
        'modules/a/package.json': JSON.stringify({
          name: 'a',
          version: '1.0.0',
          dependencies: { zod: '^3.23.8', 'date-fns': '^4.1.0' },
        }),
        'modules/b/package.json': JSON.stringify({
          name: 'b',
          version: '1.0.0',
          dependencies: { zod: '^4.0.0' },
        }),
        'nodes/post/1.0.0/node.json': JSON.stringify({ dependencies: { 'date-fns': '^4.1.0' } }),
        'modules/a/index.ts': 'export {}',
      }),
    )
    expect(JSON.parse(merged.manifest).dependencies).toEqual({
      'date-fns': '^4.1.0',
      zod: '^3.23.8',
    })
    expect(merged.conflicts).toEqual([
      {
        name: 'zod',
        declared: [
          { path: 'modules/a/package.json', range: '^3.23.8' },
          { path: 'modules/b/package.json', range: '^4.0.0' },
        ],
      },
    ])
    const acquisition = libraryAcquisitionFiles(
      files({ 'modules/a/index.ts': 'x', 'modules/a/package.json': '{}' }),
      merged.manifest,
    )
    expect([...acquisition.keys()]).toEqual(['modules/a/index.ts', 'package.json'])
  })

  it('reads only each node’s newest folder: older versions never deploy together', () => {
    const merged = mergeLibraryDependencies(
      files({
        'nodes/post/1.9.0/node.json': JSON.stringify({ dependencies: { zod: '^3.0.0' } }),
        'nodes/post/1.10.0/node.json': JSON.stringify({ dependencies: { zod: '^4.0.0' } }),
      }),
    )
    expect(merged.conflicts).toEqual([])
    expect(JSON.parse(merged.manifest).dependencies).toEqual({ zod: '^4.0.0' })
  })
})
