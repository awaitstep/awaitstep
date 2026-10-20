import { describe, it, expect } from 'vitest'
import { secretDisplayName, splitSecretName } from '../env-var-parser'

describe('splitSecretName / secretDisplayName', () => {
  it('marks a secret with the prefix and takes it back off', () => {
    expect(secretDisplayName('TOKEN', true)).toBe('SECRET_TOKEN')
    expect(splitSecretName('SECRET_TOKEN')).toEqual({ name: 'TOKEN', isSecret: true })
  })

  it('leaves a plain variable alone', () => {
    expect(secretDisplayName('API_URL', false)).toBe('API_URL')
    expect(splitSecretName('API_URL')).toEqual({ name: 'API_URL', isSecret: false })
  })

  it('round-trips a secret whose own name starts with the prefix', () => {
    // The case that broke: skipping the prefix here because the name already
    // had one meant the next save split it off and renamed the variable, so
    // the deployed worker's env.SECRET_TOKEN was undefined.
    const stored = { name: 'SECRET_TOKEN', isSecret: true }
    const displayed = secretDisplayName(stored.name, stored.isSecret)

    expect(displayed).toBe('SECRET_SECRET_TOKEN')
    expect(splitSecretName(displayed)).toEqual(stored)
  })

  it('round-trips every shape it is given', () => {
    for (const stored of [
      { name: 'API_URL', isSecret: false },
      { name: 'TOKEN', isSecret: true },
      { name: 'SECRET_TOKEN', isSecret: true },
      { name: 'A', isSecret: true },
    ]) {
      expect(splitSecretName(secretDisplayName(stored.name, stored.isSecret))).toEqual(stored)
    }
  })

  it('reads a bare prefix as an empty secret name, for callers to drop', () => {
    expect(splitSecretName('SECRET_')).toEqual({ name: '', isSecret: true })
  })
})
