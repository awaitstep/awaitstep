import type { ProjectMemberRow, ProjectRow } from '../db'
import { daysAgo } from './clock'
import { ACME, BOLT, GLOBEX, SANDBOX } from './orgs'
import { AMA, JONAS, LENA, TOM } from './people'

export const P101 = 'prj_101'
export const MARKETING = 'prj_marketing'
export const INTERNAL = 'prj_internal'

// The canvas dates the Project 101 lock: set by Ama on 12 Oct.
const P101_LOCKED_AT = '2026-10-12T09:30:00.000Z'

export function seedProjects(now: Date): ProjectRow[] {
  const project = (
    id: string,
    orgId: string,
    slug: string,
    name: string,
    description: string | null,
    ageDays: number,
  ): ProjectRow => ({
    id,
    orgId,
    slug,
    name,
    description,
    createdAt: daysAgo(now, ageDays),
    updatedAt: daysAgo(now, Math.min(ageDays, 3)),
    lock: null,
    keyCount: 0,
    variableCount: 0,
  })
  return [
    {
      ...project(P101, ACME, 'project-101', 'Project 101', 'Sales and IT automations', 120),
      lock: { setBy: AMA, setAt: P101_LOCKED_AT },
      // EmptyWorkspace: "1 project key · 5 variables" (2 here + Acme's 3).
      keyCount: 1,
      variableCount: 2,
    },
    project(
      MARKETING,
      ACME,
      'marketing-site',
      'Marketing Site',
      'Forms, newsletters, CMS hooks',
      200,
    ),
    project(INTERNAL, ACME, 'internal-tools', 'Internal Tools', 'Back-office jobs', 300),
    project('prj_bolt_api', BOLT, 'bolt-api', 'Bolt API', null, 150),
    project('prj_globex_ops', GLOBEX, 'globex-ops', 'Globex Ops', null, 250),
    project('prj_experiments', SANDBOX, 'experiments', 'Experiments', null, 80),
    project('prj_scratch', SANDBOX, 'scratch', 'Scratch', null, 20),
  ]
}

export const PROJECT_MEMBERS: ProjectMemberRow[] = [
  { projectId: P101, userId: TOM, role: 'admin' },
  { projectId: MARKETING, userId: JONAS, role: 'admin' },
  { projectId: MARKETING, userId: LENA, role: 'member' },
  { projectId: INTERNAL, userId: TOM, role: 'member' },
]
