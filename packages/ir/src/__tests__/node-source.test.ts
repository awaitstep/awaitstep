import { describe, expect, it } from 'vitest'
import { stepSourcePath } from '../node-source.js'
import {
  compiledPathKey,
  isGeneratedPath,
  isReservedToolchainPath,
  isStepSourcePath,
  projectFilePathError,
} from '../project-files.js'

describe('stepSourcePath', () => {
  it('keeps a canvas-made id as the file stem', () => {
    expect(stepSourcePath('k3j9x_a1b2c3')).toBe('steps/k3j9x_a1b2c3.ts')
    expect(stepSourcePath('step-1')).toBe('steps/step-1.ts')
  })

  it('rewrites an id that is not a safe segment and appends a hash of the original', () => {
    expect(stepSourcePath('order check')).toMatch(/^steps\/order_check-[0-9a-f]{6}\.ts$/)
    expect(stepSourcePath('../etc')).toMatch(/^steps\/___etc-[0-9a-f]{6}\.ts$/)
    expect(stepSourcePath('-dash')).toMatch(/^steps\/_-dash-[0-9a-f]{6}\.ts$/)
    expect(stepSourcePath('')).toMatch(/^steps\/_-[0-9a-f]{6}\.ts$/)
  })

  it('rewrites an id with a dot: with the extension appended it could spell .. or .d.ts', () => {
    expect(stepSourcePath('a.b')).toMatch(/^steps\/a_b-[0-9a-f]{6}\.ts$/)
    expect(stepSourcePath('a.')).toMatch(/^steps\/a_-[0-9a-f]{6}\.ts$/)
    expect(stepSourcePath('x.d')).toMatch(/^steps\/x_d-[0-9a-f]{6}\.ts$/)
    expect(stepSourcePath('a..b')).toMatch(/^steps\/a__b-[0-9a-f]{6}\.ts$/)
  })

  it('rewrites an id with uppercase, so ids a case-insensitive disk would confuse stay apart', () => {
    expect(stepSourcePath('Foo')).toMatch(/^steps\/Foo-[0-9a-f]{6}\.ts$/)
    expect(compiledPathKey(stepSourcePath('Foo'))).not.toBe(compiledPathKey(stepSourcePath('foo')))
    expect(compiledPathKey(stepSourcePath('Foo'))).not.toBe(compiledPathKey(stepSourcePath('fOo')))
  })

  it('rewrites an id the deploy would read as its own file', () => {
    expect(stepSourcePath('wrangler')).toMatch(/^steps\/wrangler-[0-9a-f]{6}\.ts$/)
  })

  it('gives two ids that rewrite alike two different paths', () => {
    expect(stepSourcePath('a b')).not.toBe(stepSourcePath('a/b'))
    expect(stepSourcePath('a b')).not.toBe(stepSourcePath('a:b'))
  })

  it('is stable: the same id always maps to the same path', () => {
    expect(stepSourcePath('x y')).toBe(stepSourcePath('x y'))
  })

  it('bounds the path for a long id', () => {
    const long = 'n'.repeat(300)
    const path = stepSourcePath(long)
    expect(path.length).toBeLessThan(80)
    expect(path).toMatch(/^steps\/n{48}-[0-9a-f]{6}\.ts$/)
  })

  it('always yields a plain .ts file the project-file rules accept as a stored path', () => {
    const ids = [
      'k3j9x_a1b2c3',
      'order check',
      '../etc',
      '',
      '__proto__',
      '日本',
      'a/b',
      'a.',
      '_.',
      'x.d',
      '.hidden',
      'wrangler',
      'Foo',
      'n'.repeat(300),
    ]
    for (const id of ids) {
      const path = stepSourcePath(id)
      expect(isStepSourcePath(path)).toBe(true)
      expect(path).toMatch(/^steps\/[^/]+\.ts$/)
      expect(path).not.toContain('..')
      expect(path.endsWith('.d.ts')).toBe(false)
      expect(isGeneratedPath(path)).toBe(false)
      expect(isReservedToolchainPath(path)).toBe(false)
      expect(projectFilePathError(path, { stored: true })).toBeNull()
    }
  })
})

describe('isStepSourcePath', () => {
  it('matches anything inside the steps folder, in any case', () => {
    expect(isStepSourcePath('steps/a.ts')).toBe(true)
    expect(isStepSourcePath('steps/deep/a.ts')).toBe(true)
    expect(isStepSourcePath('Steps/a.ts')).toBe(true)
  })

  it('leaves files merely named like it alone', () => {
    expect(isStepSourcePath('steps.ts')).toBe(false)
    expect(isStepSourcePath('steps')).toBe(false)
    expect(isStepSourcePath('lib/steps/a.ts')).toBe(false)
    expect(isStepSourcePath('stepsx/a.ts')).toBe(false)
  })
})
