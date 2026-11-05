import { describe, expect, it } from 'vitest'
import { ORG_PAGES, ORG_SETTINGS_PAGES } from '../../../lib/dashboard-paths'
import { pageTitle } from '../dashboard-page'
import { breadcrumbs, panelModel, railModel, tabBarEntries } from '../nav-model'

const ORG = { org: 'acme' }
const PROJECT = { org: 'acme', project: 'project-101' }
const SALES = { org: 'acme', project: 'project-101', workspace: 'sales' }
const NAMES = { org: 'Acme Inc', project: 'Project 101', workspace: 'Sales' }
/** On Projects, with nothing unread or new. */
const QUIET = { here: '/acme/projects', unread: 0, freshReleases: 0 }

describe('rail', () => {
  it('marks the org page itself, Settings for org settings, and Projects inside a project', () => {
    expect(railModel('acme', { kind: 'org', page: 'audit' }, QUIET).activeKey).toBe('audit')
    expect(railModel('acme', { kind: 'org', page: 'connections' }, QUIET).activeKey).toBe(
      'connections',
    )
    expect(railModel('acme', { kind: 'org', page: 'api-keys' }, QUIET).activeKey).toBe('api-keys')
    expect(railModel('acme', { kind: 'org-settings', page: 'members' }, QUIET).activeKey).toBe(
      'settings',
    )
    expect(railModel('acme', { kind: 'project', page: 'settings' }, QUIET).activeKey).toBe(
      'projects',
    )
    expect(railModel('acme', { kind: 'workspace', page: 'runs' }, QUIET).activeKey).toBe('projects')
  })

  it('links every org destination from the rail (board Sidebar), Settings on General', () => {
    const rail = railModel('acme', { kind: 'org', page: 'projects' }, QUIET)
    expect(rail.primary.map((e) => [e.label, e.href])).toEqual([
      ['Projects', '/acme/projects'],
      ['Resources', '/acme/resources'],
      ['Audit log', '/acme/audit'],
      ['Connections', '/acme/connections'],
      ['API', '/acme/api-keys'],
      ['Settings', '/acme/settings/general'],
    ])
    expect(rail.secondary.map((e) => [e.label, e.href, e.external ?? false])).toEqual([
      ['What’s new', '/acme/projects?open=whats-new', false],
      ['Inbox', '/acme/projects?open=inbox', false],
      ['Playground', '/api-playground', false],
      ['Docs', 'https://docs.awaitstep.dev', true],
    ])
  })

  it('opens Inbox and What’s new over the current page, with the unread count and a dot', () => {
    const here = '/acme/resources?tab=variables'
    const rail = railModel(
      'acme',
      { kind: 'org', page: 'resources' },
      { here, unread: 3, freshReleases: 2 },
    )
    const [whatsNew, inbox] = rail.secondary
    expect(whatsNew).toMatchObject({
      href: '/acme/resources?tab=variables&open=whats-new',
      badge: { kind: 'dot', description: '2 new updates' },
    })
    expect(inbox).toMatchObject({
      href: '/acme/resources?tab=variables&open=inbox',
      badge: { kind: 'count', value: 3, description: '3 unread notifications' },
    })
    const quiet = railModel(
      'acme',
      { kind: 'org', page: 'projects' },
      {
        here,
        unread: 0,
        freshReleases: 0,
      },
    )
    expect(quiet.secondary[0]!.badge).toBeUndefined()
    expect(quiet.secondary[1]!.badge).toMatchObject({ value: 0 })
  })

  it('gives the phone tab bar five of the rail’s entries', () => {
    const tabs = tabBarEntries(railModel('acme', { kind: 'org', page: 'projects' }, QUIET))
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
    for (const page of ORG_PAGES) {
      expect(panelModel({ kind: 'org', page }, ORG)).toEqual({ mode: 'none' })
    }
  })

  it('has no panel on Org Settings either: its sections are tabs on the page', () => {
    for (const page of ORG_SETTINGS_PAGES) {
      expect(panelModel({ kind: 'org-settings', page }, ORG)).toEqual({ mode: 'none' })
    }
  })

  it('lists the workspace’s pages, with Project settings pinned', () => {
    const panel = panelModel({ kind: 'workspace', page: 'workflows' }, SALES)
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
    expect(panel.projectHref).toBe('/acme/project-101/workspaces')
  })

  it('lists the project’s pages in one menu, each straight under the project', () => {
    const panel = panelModel({ kind: 'project', page: 'members' }, PROJECT)
    if (panel.mode !== 'project') throw new Error(panel.mode)
    expect(panel.items.map((i) => [i.label, i.href])).toEqual([
      ['Workspaces', '/acme/project-101/workspaces'],
      ['Shared library', '/acme/project-101/shared'],
      ['Members', '/acme/project-101/members'],
      ['Connections', '/acme/project-101/connections'],
      ['API keys', '/acme/project-101/api-keys'],
      ['Variables', '/acme/project-101/variables'],
      ['Settings', '/acme/project-101/settings'],
    ])
    expect(panel.activeKey).toBe('members')
    // No way back to a workspace: Workspaces lists every one.
    expect(panel).not.toHaveProperty('backHref')
  })
})

describe('breadcrumbs', () => {
  it('starts at the org on an org page', () => {
    expect(breadcrumbs({ kind: 'org', page: 'inbox' }, ORG, NAMES)).toEqual([
      { label: 'Acme Inc', href: '/acme/projects' },
      { label: 'Inbox' },
    ])
  })

  it('stops org settings at Settings: its sections are tabs on the page', () => {
    for (const page of ORG_SETTINGS_PAGES) {
      expect(breadcrumbs({ kind: 'org-settings', page }, ORG, NAMES)).toEqual([
        { label: 'Acme Inc', href: '/acme/projects' },
        { label: 'Settings' },
      ])
    }
  })

  it('names Connections and API as org pages of their own', () => {
    expect(breadcrumbs({ kind: 'org', page: 'connections' }, ORG, NAMES)).toEqual([
      { label: 'Acme Inc', href: '/acme/projects' },
      { label: 'Connections' },
    ])
    expect(breadcrumbs({ kind: 'org', page: 'api-keys' }, ORG, NAMES)).toEqual([
      { label: 'Acme Inc', href: '/acme/projects' },
      { label: 'API' },
    ])
  })

  it('goes through the project to its Workspaces page', () => {
    expect(breadcrumbs({ kind: 'project', page: 'workspaces' }, PROJECT, NAMES)).toEqual([
      { label: 'Acme Inc', href: '/acme/projects' },
      { label: 'Project 101', href: '/acme/project-101/workspaces' },
      { label: 'Workspaces' },
    ])
  })

  it('goes through the project on its other pages, Settings included', () => {
    expect(breadcrumbs({ kind: 'project', page: 'members' }, PROJECT, NAMES)).toEqual([
      { label: 'Acme Inc', href: '/acme/projects' },
      { label: 'Project 101', href: '/acme/project-101/workspaces' },
      { label: 'Members' },
    ])
    expect(breadcrumbs({ kind: 'project', page: 'settings' }, PROJECT, NAMES)).toEqual([
      { label: 'Acme Inc', href: '/acme/projects' },
      { label: 'Project 101', href: '/acme/project-101/workspaces' },
      { label: 'Settings' },
    ])
  })

  it('goes through project and workspace on a workspace page', () => {
    expect(breadcrumbs({ kind: 'workspace', page: 'runs' }, SALES, NAMES)).toEqual([
      { label: 'Acme Inc', href: '/acme/projects' },
      { label: 'Project 101', href: '/acme/project-101/workspaces' },
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
    expect(railModel('acme', page, QUIET).activeKey).toBe('')
    expect(panelModel(page, ORG)).toEqual({ mode: 'none' })
  })

  it('start their breadcrumbs at Your account (top-level) and end on the page', () => {
    expect(breadcrumbs(page, ORG, NAMES)).toEqual([
      { label: 'Your account', href: '/account/profile' },
      { label: 'Sessions and sign-in' },
    ])
    expect(pageTitle(page)).toBe('Sessions and sign-in · AwaitStep')
  })
})

describe('the API Playground', () => {
  const page = { kind: 'playground' } as const

  it('marks the Playground rail item, with no panel', () => {
    expect(railModel('acme', page, QUIET).activeKey).toBe('playground')
    expect(panelModel(page, ORG)).toEqual({ mode: 'none' })
  })

  it('has a single, org-less breadcrumb', () => {
    expect(breadcrumbs(page, ORG, NAMES)).toEqual([{ label: 'API Playground' }])
    expect(pageTitle(page)).toBe('API Playground · AwaitStep')
  })
})

describe('a workflow’s own pages', () => {
  const item = { id: 'wf_1', name: 'Lead enrichment', kind: 'workflow' as const }

  it('sit inside Projects, under the workspace panel with their list marked', () => {
    const page = { kind: 'item', page: 'runs', item } as const
    expect(railModel('acme', page, QUIET).activeKey).toBe('projects')
    const panel = panelModel(page, SALES)
    if (panel.mode !== 'workspace') throw new Error(panel.mode)
    expect(panel.activeKey).toBe('workflows')
    // Switching workspace from here lands on that workspace's list.
    expect(panel.page).toBe('workflows')
    const fn = panelModel(
      { kind: 'item', page: 'overview', item: { ...item, kind: 'script' } },
      SALES,
    )
    if (fn.mode !== 'workspace') throw new Error(fn.mode)
    expect(fn.activeKey).toBe('functions')
  })

  it('mark no list until the item’s kind is known', () => {
    const panel = panelModel({ kind: 'item', page: 'overview', item: { id: 'wf_1' } }, SALES)
    if (panel.mode !== 'workspace') throw new Error(panel.mode)
    expect(panel.activeKey).toBe('')
  })

  it('go through the workspace, its list and the item to the page', () => {
    expect(breadcrumbs({ kind: 'item', page: 'run', item }, SALES, NAMES)).toEqual([
      { label: 'Acme Inc', href: '/acme/projects' },
      { label: 'Project 101', href: '/acme/project-101/workspaces' },
      { label: 'Sales', href: '/acme/project-101/sales/overview' },
      { label: 'Workflows', href: '/acme/project-101/sales/workflows' },
      { label: 'Lead enrichment', href: '/acme/project-101/sales/workflows/wf_1/overview' },
      { label: 'Run' },
    ])
  })

  it('name the item by id while it loads, with no list yet', () => {
    expect(
      breadcrumbs({ kind: 'item', page: 'deployments', item: { id: 'wf_1' } }, SALES, NAMES).slice(
        3,
      ),
    ).toEqual([
      { label: 'wf_1', href: '/acme/project-101/sales/workflows/wf_1/overview' },
      { label: 'Deployments' },
    ])
  })

  it('title the tab', () => {
    expect(pageTitle({ kind: 'item', page: 'deploy' })).toBe('Deploy · AwaitStep')
  })
})
