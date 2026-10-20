import { describe, it, expect } from 'vitest'
import { globalEnvRefName, isGlobalEnvRef } from '../env-vars.js'

describe('globalEnvRefName', () => {
  it('reads the project variable a reference points at', () => {
    expect(globalEnvRefName('{{global.env.API_URL}}')).toBe('API_URL')
  })

  it('returns null for a literal value', () => {
    expect(globalEnvRefName('https://example.test')).toBeNull()
  })
})

describe('isGlobalEnvRef', () => {
  it('accepts only the exact form resolution accepts', () => {
    // Deliberately strict: a looser rule counts as a reference in one place
    // and arrives somewhere else as a literal string of braces.
    expect(isGlobalEnvRef('{{global.env.API_URL}}')).toBe(true)
    for (const value of [
      '{{ global.env.API_URL }}',
      ' {{global.env.API_URL}} ',
      '{{global.env.api_url}}',
      '{{global.env.}}',
      '{{env.API_URL}}',
      '{{global.other.API_URL}}',
      'prefix {{global.env.API_URL}}',
      '{{global.env.API_URL}} suffix',
      'hello {{name}}',
      '',
    ]) {
      expect(isGlobalEnvRef(value)).toBe(false)
    }
  })

  it('accepts digits and underscores after the first letter', () => {
    expect(isGlobalEnvRef('{{global.env.API_V2_URL}}')).toBe(true)
  })
})
