import { describe, expect, it } from 'vitest'
import { pageTitle } from '../dashboard-page'
import { breadcrumbs, panelModel, railModel, tabBarEntries } from '../nav-model'

const ORG = { org: 'acme' }
const PROJECT = { org: 'acme', project: 'project-101' }
const SALES = { org: 'acme', project: 'project-101', workspace: 'sales' }
const NAMES = { org: 'Acme Inc', project: 'Project 101', workspace: 'Sales' }

describe('rail', () => {
  it('marks the org page itself, Settings for org settings, and Projects inside a project', () => {
    expect(railModel('acme', { kind: 'org', page: 'audit' }).activeKey).toBe('audit')
    expect(railModel('acme', { kind: 'org-settings', page: 'members' }).activeKey).toBe('settings')
    expect(railModel('acme', { kind: 'project-settings', page: 'general' }).activeKey).toBe(
      'projects',
    )
    expect(railModel('acme', { kind: 'workspace', page: 'runs' }).activeKey).toBe('projects')
  })

  it('links every entry into the org, with API to the old playground and Docs outside', () => {
    const rail = railModel('acme', { kind: 'org', page: 'projects' })
    expect(rail.primary.map((e) => e.href)).toEqual([
      '/acme/projects',
      '/acme/resources',
      '/acme/audit',
      '/acme/settings/general',
    ])
    expect(rail.secondary.map((e) => [e.key, e.href, e.external ?? false])).toEqual([
      ['whats-new', '/acme/whats-new', false],
      ['inbox', '/acme/inbox', false],
      ['api', '/api-playground', false],
      ['docs', 'https://docs.awaitstep.dev', true],
    ])
  })

  it('gives the phone tab bar five of the rail’s entries', () => {
    const tabs = tabBarEntries(railModel('acme', { kind: 'org', page: 'projects' }))
    expect(tabs.map((e) => e.label)).toEqual([
      'Projects',
      'Resources',
      'Audit log',
      'Inbox',
      'Settings',
    ])
  })
})

describe('panel', () => {
  it('has no panel on any org page — the org home included (Main and EmptyOrg: mode "org")', () => {
    for (const page of ['projects', 'resources', 'audit', 'inbox', 'whats-new'] as const) {
      expect(panelModel({ kind: 'org', page }, ORG, null)).toEqual({ mode: 'none' })
    }
  })

  it('lists the workspace’s pages, with Project settings pinned', () => {
    const panel = panelModel({ kind: 'workspace', page: 'workflows' }, SALES, null)
    if (panel.mode !== 'workspace') throw new Error(panel.mode)
    expect(panel.items.map((i) => i.label)).toEqual([
      'Overview',
      'Workflows',
      'Functions',
      'Library',
      'Runs',
      'Workspace settings',
    ])
    expect(panel.items[1]!.href).toBe('/acme/project-101/sales/workflows')
    expect(panel.activeKey).toBe('workflows')
    expect(panel.projectSettingsHref).toBe('/acme/project-101/settings/workspaces')
  })

  it('leads back from project settings to the project, which lands in the last workspace', () => {
    const panel = panelModel({ kind: 'project-settings', page: 'members' }, PROJECT, null)
    if (panel.mode !== 'project-settings') throw new Error(panel.mode)
    expect(panel.items.map((i) => i.key)).toEqual([
      'workspaces',
      'shared',
      'members',
      'api-keys',
      'variables',
      'general',
    ])
    expect(panel.activeKey).toBe('members')
    expect(panel.backHref).toBe('/acme/project-101')
  })

  it('leads back from org settings to the last project, or to Projects', () => {
    const page = { kind: 'org-settings', page: 'connections' } as const
    const withLast = panelModel(page, ORG, { slug: 'project-101', name: 'Project 101' })
    if (withLast.mode !== 'org-settings') throw new Error(withLast.mode)
    expect(withLast.back).toEqual({ href: '/acme/project-101', label: 'Back to Project 101' })
    expect(withLast.items.map((i) => i.label)).toEqual([
      'General',
      'Members',
      'Connections',
      'API keys',
    ])
    const withoutLast = panelModel(page, ORG, null)
    if (withoutLast.mode !== 'org-settings') throw new Error(withoutLast.mode)
    expect(withoutLast.back).toEqual({ href: '/acme/projects', label: 'Back to projects' })
  })
})

describe('breadcrumbs', () => {
  it('starts at the org on an org page', () => {
    expect(breadcrumbs({ kind: 'org', page: 'inbox' }, ORG, NAMES)).toEqual([
      { label: 'Acme Inc', href: '/acme/projects' },
      { label: 'Inbox' },
    ])
  })

  it('names org settings without a Settings link', () => {
    expect(breadcrumbs({ kind: 'org-settings', page: 'general' }, ORG, NAMES)).toEqual([
      { label: 'Acme Inc', href: '/acme/projects' },
      { label: 'Settings' },
      { label: 'General' },
    ])
  })

  it('goes through the project on project settings', () => {
    expect(breadcrumbs({ kind: 'project-settings', page: 'workspaces' }, PROJECT, NAMES)).toEqual([
      { label: 'Acme Inc', href: '/acme/projects' },
      { label: 'Project 101', href: '/acme/project-101' },
      { label: 'Settings' },
      { label: 'Workspaces' },
    ])
  })

  it('goes through project and workspace on a workspace page', () => {
    expect(breadcrumbs({ kind: 'workspace', page: 'runs' }, SALES, NAMES)).toEqual([
      { label: 'Acme Inc', href: '/acme/projects' },
      { label: 'Project 101', href: '/acme/project-101' },
      { label: 'Sales', href: '/acme/project-101/sales/overview' },
      { label: 'Runs' },
    ])
  })
})

describe('page titles', () => {
  it('names the page and the app', () => {
    expect(pageTitle({ kind: 'workspace', page: 'workflows' })).toBe('Workflows · AwaitStep')
    expect(pageTitle({ kind: 'org', page: 'whats-new' })).toBe('What’s new · AwaitStep')
  })
})

describe('account pages', () => {
  const page = { kind: 'account', page: 'sessions' } as const

  it('show the rail with nothing active and no panel', () => {
    expect(railModel('acme', page).activeKey).toBe('')
    expect(panelModel(page, ORG, null)).toEqual({ mode: 'none' })
  })

  it('start their breadcrumbs at Your account and end on the page', () => {
    expect(breadcrumbs(page, ORG, NAMES)).toEqual([
      { label: 'Your account', href: '/acme/account/profile' },
      { label: 'Sessions and sign-in' },
    ])
    expect(pageTitle(page)).toBe('Sessions and sign-in · AwaitStep')
  })
})
