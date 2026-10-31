import { describe, expect, it } from 'vitest'
import type { ApiMarketplaceNode } from '../../../../lib/dashboard-api'
import { toOrgNode } from '../nodes'

const SLACK: ApiMarketplaceNode = {
  id: 'slack',
  name: 'Slack',
  icon: 'https://registry.test/nodes/slack/icon.svg',
  description: 'Post messages and alerts to a Slack channel',
  category: 'Messaging',
  author: 'awaitstep',
  latest: '2.4.0',
  installed: true,
  installedVersion: '2.3.0',
  usage: 6,
  inRegistry: true,
}

describe('toOrgNode', () => {
  it('keeps the registry logo, the installed version and whether an update is out', () => {
    expect(toOrgNode(SLACK)).toMatchObject({
      icon: 'https://registry.test/nodes/slack/icon.svg',
      version: '2.3.0',
      latestVersion: '2.4.0',
      updateAvailable: true,
      usage: 6,
    })
  })

  it('leaves the logo out for a node the registry no longer lists', () => {
    const { icon: _icon, ...orphan } = SLACK
    expect(toOrgNode({ ...orphan, inRegistry: false })).not.toHaveProperty('icon')
  })
})
