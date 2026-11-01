import { describe, expect, it } from 'vitest'
import {
  accessEditorPath,
  accountPath,
  dashboardPath,
  invitePath,
  itemPath,
  isReservedSlug,
  ORG_PAGES,
  orgPath,
  orgDestinationPath,
  orgSettingsPath,
  projectPath,
  projectSettingsPath,
  variableDialogPath,
  withOverlay,
  workspacePath,
  workspaceSettingsPath,
} from '../dashboard-paths'

const SALES = { org: 'acme', project: 'project-101', workspace: 'sales' }

describe('dashboard paths', () => {
  it('builds org pages, defaulting to Projects', () => {
    expect(orgPath('acme')).toBe('/acme/projects')
    expect(orgPath('acme', 'whats-new')).toBe('/acme/whats-new')
    expect(orgPath('acme', 'connections')).toBe('/acme/connections')
    expect(orgPath('acme', 'api-keys')).toBe('/acme/api-keys')
    expect(orgSettingsPath('acme')).toBe('/acme/settings/general')
    expect(orgSettingsPath('acme', 'members')).toBe('/acme/settings/members')
  })

  it('sends a stored org link to where that page lives now', () => {
    // Inbox links and release notes still name Connections and API keys as
    // Settings pages; they moved to their own rail items.
    expect(orgDestinationPath('acme', 'connections')).toBe('/acme/connections')
    expect(orgDestinationPath('acme', 'api-keys')).toBe('/acme/api-keys')
    expect(orgDestinationPath('acme', 'members')).toBe('/acme/settings/members')
    expect(orgDestinationPath('acme', 'general')).toBe('/acme/settings/general')
  })

  it('builds project URLs, with settings defaulting to Workspaces', () => {
    expect(projectPath(SALES)).toBe('/acme/project-101')
    expect(projectSettingsPath(SALES)).toBe('/acme/project-101/settings/workspaces')
    expect(projectSettingsPath(SALES, 'variables')).toBe('/acme/project-101/settings/variables')
  })

  it('builds workspace pages, defaulting to Overview', () => {
    expect(workspacePath(SALES)).toBe('/acme/project-101/sales/overview')
    expect(workspacePath(SALES, 'settings')).toBe('/acme/project-101/sales/settings')
  })

  it('encodes each slug as one path segment', () => {
    expect(workspacePath({ org: 'a/b', project: 'p', workspace: 'w?x' }, 'runs')).toBe(
      '/a%2Fb/p/w%3Fx/runs',
    )
    expect(invitePath('tok/en')).toBe('/invite/tok%2Fen')
    expect(dashboardPath()).toBe('/dashboard')
    expect(accountPath('acme')).toBe('/acme/account/profile')
    expect(accountPath('acme', 'sessions')).toBe('/acme/account/sessions')
  })
})

describe('reserved slugs', () => {
  it('keeps orgs off the old app’s top-level paths', () => {
    for (const slug of ['dashboard', 'workflows', 'settings', 'sign-in', 'invite', 'choose-org']) {
      expect(isReservedSlug('org', slug)).toBe(true)
    }
    expect(isReservedSlug('org', 'acme')).toBe(false)
  })

  it('keeps projects off the org’s own pages', () => {
    for (const slug of [
      'projects',
      'resources',
      'audit',
      'inbox',
      'whats-new',
      'settings',
      'account',
    ]) {
      expect(isReservedSlug('project', slug)).toBe(true)
    }
    expect(isReservedSlug('project', 'project-101')).toBe(false)
  })

  it('keeps workspaces off the project’s settings path only', () => {
    expect(isReservedSlug('workspace', 'settings')).toBe(true)
    expect(isReservedSlug('workspace', 'workflows')).toBe(false)
  })

  // The lists live in @awaitstep/ir (the API refuses them too); a page added
  // here without a reserved slug would let a project shadow it.
  it('reserves every page name the path builders use', () => {
    for (const page of ORG_PAGES) expect(isReservedSlug('project', page), page).toBe(true)
    for (const page of ['settings', 'account', 'items']) {
      expect(isReservedSlug('project', page), page).toBe(true)
    }
    expect(isReservedSlug('workspace', 'settings')).toBe(true)
    for (const page of ['api-playground', 'choose-org', 'invite', 'sign-in']) {
      expect(isReservedSlug('org', page), page).toBe(true)
    }
  })
})

describe('dialog addresses', () => {
  it('opens the access editor for a person, or for adding people to a project', () => {
    expect(accessEditorPath('acme', { userId: 'usr_tom' })).toBe(
      '/acme/settings/members?access=usr_tom',
    )
    expect(accessEditorPath('acme', { addTo: 'project-101' })).toBe(
      '/acme/settings/members?access=add&project=project-101',
    )
  })

  it('opens the variable dialogs on project Variables', () => {
    const p101 = { org: 'acme', project: 'project-101' }
    expect(variableDialogPath(p101, { kind: 'new' })).toBe(
      '/acme/project-101/settings/variables?new=variable',
    )
    expect(variableDialogPath(p101, { kind: 'variable', name: 'SLACK_TOKEN' })).toBe(
      '/acme/project-101/settings/variables?variable=SLACK_TOKEN',
    )
    expect(variableDialogPath({ org: 'acme' }, { kind: 'new' })).toBe(
      '/acme/resources?tab=variables&new=variable',
    )
    expect(variableDialogPath({ org: 'acme' }, { kind: 'variable', name: 'REGION' })).toBe(
      '/acme/resources?tab=variables&variable=REGION',
    )
    expect(
      variableDialogPath({ ...p101, workspace: 'sales' }, { kind: 'variable', name: 'REGION' }),
    ).toBe('/acme/project-101/sales/settings?tab=variables&variable=REGION')
    expect(variableDialogPath({ ...p101, workspace: 'sales' }, { kind: 'new' })).toBe(
      '/acme/project-101/sales/settings?tab=variables&new=variable',
    )
  })
})

describe('workspaceSettingsPath', () => {
  const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }
  it('opens General, a tab, or a tab with its New dialog', () => {
    expect(workspaceSettingsPath(sales)).toBe('/acme/project-101/sales/settings')
    expect(workspaceSettingsPath(sales, 'members')).toBe(
      '/acme/project-101/sales/settings?tab=members',
    )
    expect(workspaceSettingsPath(sales, 'keys', 'key')).toBe(
      '/acme/project-101/sales/settings?tab=keys&new=key',
    )
  })
})

describe('itemPath', () => {
  it('leads a row to the item placeholder, with the run when there is one', () => {
    expect(itemPath('acme', { id: 'itm_1', kind: 'workflow' })).toBe('/acme/items/itm_1')
    expect(itemPath('acme', { id: 'itm_1', kind: 'workflow' }, 'run_9')).toBe(
      '/acme/items/itm_1?run=run_9',
    )
    expect(itemPath('acme', { id: 'itm_2', kind: 'script' })).toBe(
      '/acme/items/itm_2?kind=function',
    )
  })

  it('opens and closes the Inbox or What’s new over the page, keeping its query', () => {
    expect(withOverlay('/acme/resources?tab=variables', 'inbox')).toBe(
      '/acme/resources?tab=variables&open=inbox',
    )
    expect(withOverlay('/acme/projects?open=inbox', 'whats-new')).toBe(
      '/acme/projects?open=whats-new',
    )
    expect(withOverlay('/acme/resources?tab=variables&open=inbox', null)).toBe(
      '/acme/resources?tab=variables',
    )
    expect(withOverlay('/acme/projects?open=inbox', null)).toBe('/acme/projects')
    // A fragment stays after the query, and doesn't leak into a param.
    expect(withOverlay('/acme/resources#nodes', 'inbox')).toBe('/acme/resources?open=inbox#nodes')
    expect(withOverlay('/acme/resources?tab=variables#x', 'inbox')).toBe(
      '/acme/resources?tab=variables&open=inbox#x',
    )
  })
})
