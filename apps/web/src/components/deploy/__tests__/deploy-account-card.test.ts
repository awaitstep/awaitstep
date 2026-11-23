import { describe, expect, it } from 'vitest'
import type { DeployConnections } from '@awaitstep/ir'
import { accountLine, menuLine } from '../deploy-account-card'

type Account = DeployConnections['connections'][number]

const own: Account = {
  id: 'c-1',
  provider: 'cloudflare',
  name: 'Production',
  accountSuffix: '1234',
  scope: 'shared',
  tokenStatus: 'active',
  tokenExpiresAt: null,
  authKind: 'api-token',
  canDeploy: true,
}
const managed: Account = { ...own, id: 'c-2', accountSuffix: null, managed: true }
const NOW = new Date('2026-11-23T00:00:00.000Z')

describe('the deploy account card’s lines', () => {
  it('names the provider and the account for one a person connected', () => {
    expect(accountLine(own, 'Cloudflare')).toBe('Cloudflare account ••••1234')
    expect(menuLine(own, NOW)).toMatch(/ · ••••1234$/)
  })

  it('names only the provider for one the instance operates: no account, no token', () => {
    expect(accountLine(managed, 'Hosted')).toBe('Hosted')
    expect(menuLine(managed, NOW)).toBeNull()
  })
})
