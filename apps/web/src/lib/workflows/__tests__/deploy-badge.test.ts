import { describe, expect, it } from 'vitest'
import { deployBadge } from '../deploy-badge'

const base = { hasActiveDeployment: true, deployedVersion: 2, currentVersion: 2 }

describe('deployBadge', () => {
  it('is empty when nothing is deployed', () => {
    expect(
      deployBadge({ ...base, hasActiveDeployment: false, hasUndeployedChanges: false }),
    ).toBeNull()
  })

  it('says which version is live when it is the current one', () => {
    expect(deployBadge({ ...base, hasUndeployedChanges: false })).toEqual({
      label: 'deployed v2',
      tone: 'success',
    })
  })

  it('warns that a newer version is not deployed', () => {
    expect(deployBadge({ ...base, currentVersion: 3, hasUndeployedChanges: true })).toEqual({
      label: 'deployed v2 · v3 not deployed',
      tone: 'warning',
    })
  })

  it('does not invent a version when the deployed one is unknown', () => {
    const badge = deployBadge({
      ...base,
      deployedVersion: undefined,
      currentVersion: 3,
      hasUndeployedChanges: true,
    })
    expect(badge?.label).toBe('deployed v? · v3 not deployed')
  })
})
