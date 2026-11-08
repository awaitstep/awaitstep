import { describe, expect, it } from 'vitest'
import type { DeployConnections } from '@awaitstep/ir'
import { runConnection } from '../run-connection'

const DEPLOY = {
  connections: [{ id: 'c_prj', name: 'Project CF', accountSuffix: '9f2e' }],
  defaultId: null,
  deployedWith: [{ id: 'c_old', name: 'Old CF' }],
} as unknown as DeployConnections

describe('runConnection', () => {
  it('names a project’s own account', () => {
    expect(runConnection('c_prj', DEPLOY)).toEqual({ name: 'Project CF', account: '…9f2e' })
  })

  it('names an account the workflow went out with that the project has since dropped', () => {
    expect(runConnection('c_old', DEPLOY)).toEqual({ name: 'Old CF', account: null })
  })

  it('names nothing for an unknown or missing account', () => {
    expect(runConnection('c_gone', DEPLOY)).toBeNull()
    expect(runConnection(null, DEPLOY)).toBeNull()
  })
})
