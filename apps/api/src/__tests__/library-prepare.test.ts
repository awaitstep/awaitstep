import { describe, expect, it } from 'vitest'
import { dependenciesWithLibrary } from '../lib/library-prepare.js'

describe('the dependency set with library code', () => {
  it('is exactly the workflow’s and its nodes’ without library code', () => {
    expect(dependenciesWithLibrary({ zod: '^4.1.0' }, { hono: '^4.0.0' }, [])).toEqual({
      dependencies: { hono: '^4.0.0', zod: '^4.1.0' },
      findings: [],
    })
  })

  it('names both sides of a library conflict, and the install limit library code passes', () => {
    const many = Object.fromEntries(Array.from({ length: 15 }, (_, k) => [`p${k}`, '^1.0.0']))
    const { findings } = dependenciesWithLibrary({ zod: '^4.1.0' }, {}, [
      { label: 'fmt 1.0.0', dependencies: { zod: '^3.23.0' } },
      { label: 'big 1.0.0', dependencies: many },
    ])
    expect(findings).toEqual([
      'Dependency conflict: zod: fmt 1.0.0 wants ^3.23.0, this workflow’s package.json wants ^4.1.0',
      'Dependencies with library code: Maximum 15 dependencies',
    ])
  })
})
