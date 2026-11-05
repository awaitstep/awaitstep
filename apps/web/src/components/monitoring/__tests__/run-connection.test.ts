import { describe, expect, it } from 'vitest'
import type { DeployConnections } from '@awaitstep/ir'
import { runConnection } from '../run-connection'

const ORG = [{ id: 'c_org', name: 'Acme CF', credentials: { accountId: 'abcd1234' } }]
const DEPLOY = {
  connections: [{ id: 'c_prj', name: 'Project CF', accountSuffix: '9f2e' }],
  defaultId: null,
  deployedWith: [{ id: 'c_old', name: 'Old CF' }],
} as unknown as DeployConnections

describe('runConnection', () => {
  it('names an org account with its account id', () => {
    expect(runConnection('c_org', ORG, DEPLOY)).toEqual({ name: 'Acme CF', account: 'abcd1234' })
  })

  it('names a project’s own account, which the org list doesn’t have', () => {
    expect(runConnection('c_prj', ORG, DEPLOY)).toEqual({ name: 'Project CF', account: '…9f2e' })
  })

  it('names an account the workflow went out with that the project has since dropped', () => {
    expect(runConnection('c_old', ORG, DEPLOY)).toEqual({ name: 'Old CF', account: null })
  })

  it('names nothing for an unknown or missing account', () => {
    expect(runConnection('c_gone', ORG, DEPLOY)).toBeNull()
    expect(runConnection(null, ORG, DEPLOY)).toBeNull()
  })
})
