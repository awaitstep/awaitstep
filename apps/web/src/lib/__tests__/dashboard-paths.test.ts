import { describe, expect, it } from 'vitest'
import {
  accessEditorPath,
  accountPath,
  chooseOrgPath,
  invitePath,
  itemPath,
  isReservedSlug,
  orgPath,
  orgSettingsPath,
  projectPath,
  projectSettingsPath,
  variableDialogPath,
  workspacePath,
  workspaceSettingsPath,
} from '../dashboard-paths'

const SALES = { org: 'acme', project: 'project-101', workspace: 'sales' }

describe('dashboard paths', () => {
  it('builds org pages, defaulting to Projects', () => {
    expect(orgPath('acme')).toBe('/acme/projects')
    expect(orgPath('acme', 'whats-new')).toBe('/acme/whats-new')
    expect(orgSettingsPath('acme')).toBe('/acme/settings/general')
    expect(orgSettingsPath('acme', 'api-keys')).toBe('/acme/settings/api-keys')
  })

  it('builds project URLs, with settings defaulting to Workspaces', () => {
    expect(projectPath(SALES)).toBe('/acme/project-101')
    expect(projectSettingsPath(SALES)).toBe('/acme/project-101/settings/workspaces')
    expect(projectSettingsPath(SALES, 'variables')).toBe('/acme/project-101/settings/variables')
  })

  it('builds workspace pages, defaulting to Workflows', () => {
    expect(workspacePath(SALES)).toBe('/acme/project-101/sales/workflows')
    expect(workspacePath(SALES, 'settings')).toBe('/acme/project-101/sales/settings')
  })

  it('encodes each slug as one path segment', () => {
    expect(workspacePath({ org: 'a/b', project: 'p', workspace: 'w?x' }, 'runs')).toBe(
      '/a%2Fb/p/w%3Fx/runs',
    )
    expect(invitePath('tok/en')).toBe('/invite/tok%2Fen')
    expect(chooseOrgPath()).toBe('/choose-org')
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
})
