import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  latestVersion,
  mergeDefinition,
  semverProblem,
  sortVersions,
} from '../lib/definition.js'

describe('compareVersions', () => {
  it('compares numeric segments, not strings', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBeGreaterThan(0)
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0)
  })

  it('sorts a release after its prerelease', () => {
    expect(compareVersions('1.0.0', '1.0.0-beta.1')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.1')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-beta.10', '1.0.0-beta.2')).toBeGreaterThan(0)
  })

  it('sorts versions and finds the latest', () => {
    expect(sortVersions([{ version: '1.0.10' }, { version: '1.0.9' }])).toEqual([
      { version: '1.0.9' },
      { version: '1.0.10' },
    ])
    expect(latestVersion([{ version: '1.0.9' }, { version: '1.0.10' }])).toBe('1.0.10')
  })
})

describe('semverProblem', () => {
  it('accepts simple and prerelease versions', () => {
    expect(semverProblem('1.0.0')).toBeUndefined()
    expect(semverProblem('1.0.0-beta.1')).toBeUndefined()
    expect(semverProblem('1.0.0+build.7')).toBeUndefined()
  })

  it('rejects non-semver versions', () => {
    expect(semverProblem('1.0')).toBeDefined()
    expect(semverProblem('latest')).toBeDefined()
  })
})

describe('mergeDefinition', () => {
  it('deep-merges nested objects and replaces arrays', () => {
    const base = {
      configSchema: {
        action: { type: 'select', options: ['A', 'B'] },
        model: { type: 'string', default: 'old' },
      },
      tags: ['a', 'b'],
    }
    const overrides = {
      configSchema: {
        action: { options: ['A', 'B', 'C'] },
        model: { default: 'new' },
        extra: { type: 'string' },
      },
      tags: ['x'],
    }
    expect(mergeDefinition(base, overrides)).toEqual({
      configSchema: {
        action: { type: 'select', options: ['A', 'B', 'C'] },
        model: { type: 'string', default: 'new' },
        extra: { type: 'string' },
      },
      tags: ['x'],
    })
  })

  it('does not mutate the inputs', () => {
    const base = { configSchema: { model: { default: 'old' } } }
    const overrides = { configSchema: { model: { default: 'new' } } }
    mergeDefinition(base, overrides)
    expect(base.configSchema.model.default).toBe('old')
    expect(overrides.configSchema.model.default).toBe('new')
  })
})
