import { describe, expect, it } from 'vitest'
import type { Project } from '../../../types/dashboard/projects'
import type { OrgSummary } from '../../../types/dashboard/session'
import type { Workspace } from '../../../types/dashboard/workspaces'
import { orgDetail, projectDetail, workspaceDetail } from '../switcher-details'

const NOW = new Date('2026-10-27T12:00:00Z')

const chip = (slug: string, name: string) => ({ id: slug, slug, name, colour: 'green' as const })

function project(workspaces: ReturnType<typeof chip>[]): Project {
  return { workspaces } as unknown as Project
}

function workspace(
  counts: { workflows: number; functions: number },
  people: number,
  createdAt: string,
): Workspace {
  return {
    counts: { ...counts, sharedOut: 0, runs24h: 0, failing: 0, lastRunAt: null },
    people: Array.from({ length: people }, (_, i) => ({ id: `p${i}` })),
    createdAt,
  } as unknown as Workspace
}

describe('switcher details', () => {
  it('describes an org by your role and its size', () => {
    const org = { role: 'owner', projectCount: 3, memberCount: 6 } as OrgSummary
    expect(orgDetail(org)).toBe('Owner · 3 projects · 6 members')
    expect(orgDetail({ ...org, role: 'member', projectCount: 1, memberCount: 1 })).toBe(
      'Member · 1 project · 1 member',
    )
  })

  it('names a project’s workspaces and where it opens, when there’s a choice', () => {
    const p101 = project([chip('sales', 'Sales'), chip('it', 'IT'), chip('support', 'Support')])
    expect(projectDetail(p101, [])).toBe('3 workspaces · Sales, IT, Support · opens in Sales')
    expect(projectDetail(p101, ['gone', 'it'])).toBe(
      '3 workspaces · Sales, IT, Support · opens in IT',
    )
    expect(projectDetail(project([chip('default', 'Default')]), [])).toBe('1 workspace')
  })

  it('counts a workspace’s workflows and members, or says it’s new and empty', () => {
    expect(workspaceDetail(workspace({ workflows: 4, functions: 2 }, 4, '2026-01-01'), NOW)).toBe(
      '4 workflows · 4 members',
    )
    expect(
      workspaceDetail(workspace({ workflows: 0, functions: 0 }, 2, '2026-10-27T08:00:00Z'), NOW),
    ).toBe('New · nothing built yet')
    expect(workspaceDetail(workspace({ workflows: 0, functions: 0 }, 2, '2026-01-01'), NOW)).toBe(
      'Nothing built yet',
    )
  })
})
