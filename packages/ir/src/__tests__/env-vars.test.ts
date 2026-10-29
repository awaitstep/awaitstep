import { describe, it, expect } from 'vitest'
import { globalEnvRefName, isEnvVarName, isGlobalEnvRef, variableLevelOf } from '../env-vars.js'

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

describe('isEnvVarName', () => {
  it('accepts exactly the names a reference can point at', () => {
    expect(isEnvVarName('STRIPE_KEY')).toBe(true)
    expect(isEnvVarName('API_V2_URL')).toBe(true)
    expect(isEnvVarName('A')).toBe(true)
    for (const name of ['stripeKey', '1KEY', '_KEY', 'STRIPE-KEY', 'STRIPE KEY', '', 'KEY ']) {
      expect(isEnvVarName(name)).toBe(false)
    }
  })

  it('is the rule a reference is read with', () => {
    expect(globalEnvRefName(`{{global.env.${'API_V2_URL'}}}`)).toBe('API_V2_URL')
    expect(isEnvVarName('API_V2_URL')).toBe(true)
    expect(globalEnvRefName('{{global.env.api_url}}')).toBeNull()
    expect(isEnvVarName('api_url')).toBe(false)
  })
})

describe('variableLevelOf', () => {
  it('reads the level off the row’s columns', () => {
    expect(variableLevelOf({ projectId: null, workspaceId: null })).toBe('organization')
    expect(variableLevelOf({ projectId: 'p', workspaceId: null })).toBe('project')
    expect(variableLevelOf({ projectId: 'p', workspaceId: 'w' })).toBe('workspace')
  })
})
