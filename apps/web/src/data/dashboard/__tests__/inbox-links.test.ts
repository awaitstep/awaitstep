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
})
