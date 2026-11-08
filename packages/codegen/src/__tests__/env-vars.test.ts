import { describe, expect, it } from 'vitest'
import { splitEnvVars } from '../env-vars.js'

describe('splitEnvVars', () => {
  it('is provider-neutral by default', () => {
    expect(
      splitEnvVars({
        API_KEY: { value: 'k', isSecret: true },
        REGION: { value: 'eu', isSecret: false },
        KV_BINDING_ID: { value: 'id', isSecret: false },
      }),
    ).toEqual({
      vars: { REGION: 'eu', KV_BINDING_ID: 'id' },
      secrets: { API_KEY: 'k' },
    })
  })

  it('lets a provider exclude its internal names', () => {
    expect(
      splitEnvVars(
        {
          REGION: { value: 'eu', isSecret: false },
          KV_BINDING_ID: { value: 'id', isSecret: false },
        },
        { exclude: (name) => name.endsWith('_BINDING_ID') },
      ),
    ).toEqual({ vars: { REGION: 'eu' }, secrets: {} })
  })
})
