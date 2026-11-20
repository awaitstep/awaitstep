import { describe, expect, it } from 'vitest'
import { inboxNotification, notificationHref } from '../inbox-links'

describe('notificationHref', () => {
  it('builds each target as a path in the org', () => {
    expect(
      notificationHref('acme', {
        kind: 'workspace',
        project: 'project-101',
        workspace: 'sales',
        page: 'runs',
      }),
    ).toBe('/acme/project-101/sales/runs')
    expect(
      notificationHref('acme', {
        kind: 'workspace-settings',
        project: 'project-101',
        workspace: 'sales',
        tab: 'keys',
      }),
    ).toBe('/acme/project-101/sales/settings?tab=keys')
    expect(
      notificationHref('acme', {
        kind: 'project-settings',
        project: 'project-101',
        page: 'shared',
      }),
    ).toBe('/acme/project-101/shared')
    expect(notificationHref('acme', { kind: 'org-settings', page: 'members' })).toBe(
      '/acme/settings/members',
    )
    expect(notificationHref('acme', { kind: 'project-connections', project: 'project-101' })).toBe(
      '/acme/project-101/connections',
    )
  })
})

describe('inboxNotification', () => {
  const base = {
    id: 'n1',
    kind: 'people' as const,
    event: 'invitation.accept',
    title: 'sam@acme.test accepted your invite',
    where: 'Acme · Members',
    at: '2026-10-30T12:00:00.000Z',
    read: false,
    needsAction: false,
    count: 1,
  }

  it('resolves the link and keeps the rest', () => {
    expect(
      inboxNotification('acme', {
        ...base,
        link: { label: 'See members', to: { kind: 'org-settings', page: 'members' } },
      }),
    ).toEqual({ ...base, link: { label: 'See members', href: '/acme/settings/members' } })
  })

  it('leaves a notification without a link without one', () => {
    expect(inboxNotification('acme', base)).toEqual(base)
  })

  it('drops a link to a Connections page on an instance that switches them off', () => {
    const toOrg = { label: 'Reconnect', to: { kind: 'org-settings', page: 'connections' } } as const
    const toProject = {
      label: 'Replace token',
      to: { kind: 'project-connections', project: 'project-101' },
    } as const
    expect(inboxNotification('acme', { ...base, link: toOrg }, ['connections.ui'])).toEqual(base)
    expect(inboxNotification('acme', { ...base, link: toProject }, ['connections.ui'])).toEqual(
      base,
    )
    // Other links stay, and nothing switched off keeps this one.
    const members = { label: 'See members', to: { kind: 'org-settings', page: 'members' } } as const
    expect(
      inboxNotification('acme', { ...base, link: members }, ['connections.ui']).link?.href,
    ).toBe('/acme/settings/members')
    expect(inboxNotification('acme', { ...base, link: toOrg }, ['playground']).link?.href).toBe(
      '/acme/connections',
    )
  })
})
