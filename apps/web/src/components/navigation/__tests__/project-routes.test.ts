import { describe, expect, it } from 'vitest'
import { Route as ProjectIndex } from '../../../routes/_authed/$org.$project.index'
import { Route as OldApiKeys } from '../../../routes/_authed/$org.$project.settings.api-keys'
import { Route as OldGeneral } from '../../../routes/_authed/$org.$project.settings.general'
import { Route as OldMembers } from '../../../routes/_authed/$org.$project.settings.members'
import { Route as OldShared } from '../../../routes/_authed/$org.$project.settings.shared'
import { Route as OldVariables } from '../../../routes/_authed/$org.$project.settings.variables'
import { Route as OldWorkspaces } from '../../../routes/_authed/$org.$project.settings.workspaces'

type BeforeLoad = (ctx: {
  params: { org: string; project: string }
  location: { searchStr: string }
}) => void

/** Where a route's `beforeLoad` redirects to, as the `href` it throws. */
function redirectOf(
  route: { options: { beforeLoad?: unknown } },
  searchStr = '',
  params = { org: 'acme', project: 'project-101' },
): string | undefined {
  try {
    ;(route.options.beforeLoad as unknown as BeforeLoad)({ params, location: { searchStr } })
  } catch (error) {
    return (error as { options: { href: string } }).options.href
  }
  return undefined
}

describe('project URLs', () => {
  it('sends the bare project URL on to its Workspaces page, query kept', () => {
    expect(redirectOf(ProjectIndex)).toBe('/acme/project-101/workspaces')
    expect(redirectOf(ProjectIndex, '?new=workspace&mock=empty')).toBe(
      '/acme/project-101/workspaces?new=workspace&mock=empty',
    )
  })

  it('forwards every old /settings/… URL to the project’s own page, query kept', () => {
    expect(redirectOf(OldWorkspaces, '?new=workspace')).toBe(
      '/acme/project-101/workspaces?new=workspace',
    )
    expect(redirectOf(OldShared)).toBe('/acme/project-101/shared')
    expect(redirectOf(OldMembers, '?access=add')).toBe('/acme/project-101/members?access=add')
    expect(redirectOf(OldApiKeys, '?new=key')).toBe('/acme/project-101/api-keys?new=key')
    expect(redirectOf(OldVariables, '?variable=REGION')).toBe(
      '/acme/project-101/variables?variable=REGION',
    )
    expect(redirectOf(OldGeneral, '?mock=')).toBe('/acme/project-101/settings?mock=')
  })

  it('encodes slugs, so an odd one never breaks the redirect header', () => {
    expect(redirectOf(OldMembers, '', { org: 'acme', project: '✓ a?b' })).toBe(
      '/acme/%E2%9C%93%20a%3Fb/members',
    )
  })
})
