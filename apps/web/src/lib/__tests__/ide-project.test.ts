import { describe, expect, it } from 'vitest'
import type { GeneratedFile } from '@awaitstep/codegen'
import {
  fileOwner,
  newFileError,
  normalizeNewPath,
  splitWorkspaceFiles,
  virtualSeedFiles,
} from '../ide/project'

const bundle: GeneratedFile[] = [
  { path: 'worker.ts', source: '', role: 'entry' },
  { path: 'nodes/Fetch.ts', source: '', role: 'module' },
  { path: 'config/env.ts', source: '', role: 'module' },
  { path: 'package.json', source: '{}', role: 'meta' },
]
const projectPaths = new Set(['config/env.ts', 'package.json'])

describe('splitWorkspaceFiles', () => {
  it('partitions the bundle by ownership, keeping order', () => {
    const split = splitWorkspaceFiles(bundle, projectPaths)
    expect(split.project.map((f) => f.path)).toEqual(['config/env.ts', 'package.json'])
    expect(split.generated.map((f) => f.path)).toEqual(['worker.ts', 'nodes/Fetch.ts'])
    expect(fileOwner('worker.ts', projectPaths)).toBe('generated')
    expect(fileOwner('config/env.ts', projectPaths)).toBe('project')
  })
})

describe('virtualSeedFiles', () => {
  it('surfaces trigger code and dependencies as files until real ones exist', () => {
    const seeds = virtualSeedFiles(
      { triggerCode: '@fetch function handler() {}', dependencies: '{"zod":"^4"}' },
      new Set(),
    )
    expect(seeds.map((f) => `${f.role}:${f.path}`)).toEqual([
      'handlers:handlers.ts',
      'meta:package.json',
    ])
    expect(JSON.parse(seeds[1].source)).toEqual({ dependencies: { zod: '^4' } })
  })

  it('yields to real project files and skips empty settings', () => {
    expect(
      virtualSeedFiles(
        { triggerCode: 'x', dependencies: '{"zod":"^4"}' },
        new Set(['handlers.ts', 'package.json']),
      ),
    ).toEqual([])
    expect(virtualSeedFiles({ triggerCode: '  ', dependencies: '{}' }, new Set())).toEqual([])
    expect(virtualSeedFiles({ triggerCode: null, dependencies: 'not json' }, new Set())).toEqual([])
  })
})

describe('newFileError', () => {
  const existing = ['worker.ts', 'config/env.ts']

  it('accepts a clean new path and normalizes what the user typed', () => {
    expect(newFileError('services/stripe.ts', existing)).toBeNull()
    expect(normalizeNewPath(' ./services//stripe.ts ')).toBe('services/stripe.ts')
    expect(newFileError(' ./services//stripe.ts ', existing)).toBeNull()
  })

  it('explains empty, invalid, existing and colliding paths', () => {
    expect(newFileError('', existing)).toMatch(/Enter a file path/)
    expect(newFileError('nodes/x.ts', existing)).toMatch(/generated/)
    expect(newFileError('config/env.ts', existing)).toMatch(/already exists/)
    expect(newFileError('config/env.js', existing)).toMatch(/would overwrite config\/env.ts/)
    expect(newFileError('notes', existing)).toMatch(/must end in/)
  })
})
