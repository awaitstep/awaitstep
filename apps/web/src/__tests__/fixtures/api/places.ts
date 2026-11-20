import type { ProjectCapability, WorkspaceCapability } from '@awaitstep/ir'
import type {
  ApiCapabilities,
  ApiMember,
  ApiProject,
  ApiWorkspace,
  ApiWorkspaceChip,
  ApiWorkspacePerson,
} from '../../../lib/dashboard-api'
import { daysAgo, minutesAgo } from './clock'
import { ACME, BOLT } from './orgs'
import { AMA, DANIEL, LENA, PEOPLE, PRIYA, TOM, TOMAS, type PersonId } from './people'

// Projects and workspaces as `GET /scope` answers them for Ama (owner of Acme,
// admin of Bolt Labs): every capability allowed. Keyed by their URL slugs.

export const P101 = 'prj_101'
export const MARKETING = 'prj_marketing'
export const INTERNAL = 'prj_internal'
export const BOLT_API = 'prj_bolt_api'
export const SALES = 'ws_sales'
export const IT = 'ws_it'
export const SUPPORT = 'ws_support'

const PROJECT_CAPABILITIES: ProjectCapability[] = [
  'manageSettings',
  'createWorkspace',
  'manageMembers',
  'manageKeys',
  'manageVariables',
  'toggleLock',
  'delete',
  'move',
]

const WORKSPACE_CAPABILITIES: WorkspaceCapability[] = [
  'edit',
  'deploy',
  'run',
  'share',
  'manageSettings',
  'manageMembers',
  'manageKeys',
  'manageVariables',
  'toggleLock',
  'delete',
]

function allAllowed<C extends string>(capabilities: C[]): ApiCapabilities<C> {
  return Object.fromEntries(capabilities.map((c) => [c, { allowed: true }])) as ApiCapabilities<C>
}

/** Project 101's lock, as the canvas dates it: set by Ama on 12 Oct. */
const P101_LOCK = { setBy: { id: AMA, name: PEOPLE[AMA].name }, setAt: '2026-10-12T09:30:00.000Z' }

const chip = (
  id: string,
  slug: string,
  name: string,
  colour: ApiWorkspaceChip['colour'],
): ApiWorkspaceChip => ({ id, slug, name, colour })

const member = (id: PersonId, role: ApiMember['role']): ApiMember => ({ ...PEOPLE[id], role })

function project(
  now: Date,
  fields: Pick<ApiProject, 'id' | 'organizationId' | 'slug' | 'name' | 'description'> &
    Partial<ApiProject>,
  ageDays: number,
): ApiProject {
  return {
    createdAt: daysAgo(now, ageDays),
    updatedAt: daysAgo(now, Math.min(ageDays, 3)),
    workspaces: [],
    health: { workflows: 0, deployed: 0, failing: 0, lastRunAt: null },
    lock: null,
    members: [member(AMA, 'owner')],
    viewerRole: 'admin',
    viewerCan: allAllowed(PROJECT_CAPABILITIES),
    ...fields,
  }
}

const P101_CHIPS = [
  chip(SALES, 'sales', 'Sales', 'green'),
  chip(IT, 'it', 'IT', 'blue'),
  chip(SUPPORT, 'support', 'Support', 'amber'),
]

/** `org/project` → the project. */
export function amaProjects(now: Date): Record<string, ApiProject> {
  return {
    'acme/project-101': project(
      now,
      {
        id: P101,
        organizationId: ACME,
        slug: 'project-101',
        name: 'Project 101',
        description: 'Sales and IT automations',
        workspaces: P101_CHIPS,
        health: { workflows: 6, deployed: 4, failing: 1, lastRunAt: minutesAgo(now, 5) },
        lock: P101_LOCK,
        members: [
          member(AMA, 'owner'),
          member(TOM, 'member'),
          member(DANIEL, 'member'),
          member(PRIYA, 'member'),
          member(LENA, 'member'),
        ],
      },
      120,
    ),
    'acme/marketing-site': project(
      now,
      {
        id: MARKETING,
        organizationId: ACME,
        slug: 'marketing-site',
        name: 'Marketing Site',
        description: 'Forms, newsletters, CMS hooks',
        workspaces: [chip('ws_marketing_default', 'default', 'Default', 'amber')],
      },
      200,
    ),
    'acme/internal-tools': project(
      now,
      {
        id: INTERNAL,
        organizationId: ACME,
        slug: 'internal-tools',
        name: 'Internal Tools',
        description: 'Back-office jobs',
        workspaces: [chip('ws_internal_default', 'default', 'Default', 'purple')],
      },
      300,
    ),
    'bolt-labs/bolt-api': project(
      now,
      {
        id: BOLT_API,
        organizationId: BOLT,
        slug: 'bolt-api',
        name: 'Bolt API',
        description: null,
        workspaces: [chip('ws_bolt_default', 'default', 'Default', 'green')],
        members: [member(TOMAS, 'owner'), member(AMA, 'admin')],
      },
      150,
    ),
  }
}

const person = (
  id: PersonId,
  role: ApiWorkspacePerson['role'],
  from: Pick<ApiWorkspacePerson, 'inherited' | 'projectRole' | 'orgRole'>,
): ApiWorkspacePerson => ({ ...PEOPLE[id], role, lastActiveAt: null, ...from })

const AMA_AS_OWNER = person(AMA, 'admin', { inherited: true, projectRole: null, orgRole: 'owner' })
const TOM_AS_PROJECT_ADMIN = person(TOM, 'admin', {
  inherited: true,
  projectRole: 'admin',
  orgRole: null,
})

function workspace(
  now: Date,
  chipOf: ApiWorkspaceChip,
  projectId: string,
  fields: Partial<ApiWorkspace>,
  ageDays: number,
): ApiWorkspace {
  return {
    ...chipOf,
    projectId,
    description: null,
    createdAt: daysAgo(now, ageDays),
    updatedAt: daysAgo(now, Math.min(ageDays, 3)),
    createdBy: { id: AMA, name: PEOPLE[AMA].name },
    lock: null,
    inheritedLock: null,
    counts: {
      workflows: 0,
      deployed: 0,
      functions: 0,
      sharedOut: 0,
      runs24h: 0,
      failing: 0,
      lastRunAt: null,
    },
    members: [AMA_AS_OWNER],
    viewerRole: 'admin',
    viewerCan: allAllowed(WORKSPACE_CAPABILITIES),
    ...fields,
  }
}

const P101_INHERITED = { fromName: 'Project 101', lock: P101_LOCK }

/** `org/project/workspace` → the workspace. */
export function amaWorkspaces(now: Date): Record<string, ApiWorkspace> {
  const [sales, it, support] = P101_CHIPS as [ApiWorkspaceChip, ApiWorkspaceChip, ApiWorkspaceChip]
  return {
    'acme/project-101/sales': workspace(
      now,
      sales,
      P101,
      {
        description: 'Lead handling and pipeline reports',
        inheritedLock: P101_INHERITED,
        members: [
          AMA_AS_OWNER,
          TOM_AS_PROJECT_ADMIN,
          person(DANIEL, 'editor', { inherited: false, projectRole: null, orgRole: null }),
          person(PRIYA, 'viewer', { inherited: false, projectRole: null, orgRole: null }),
        ],
      },
      120,
    ),
    'acme/project-101/it': workspace(
      now,
      it,
      P101,
      {
        description: 'Accounts, alerts and provisioning',
        inheritedLock: P101_INHERITED,
        members: [
          AMA_AS_OWNER,
          TOM_AS_PROJECT_ADMIN,
          person(LENA, 'admin', { inherited: false, projectRole: null, orgRole: null }),
        ],
      },
      100,
    ),
    'acme/project-101/support': workspace(
      now,
      support,
      P101,
      { inheritedLock: P101_INHERITED, createdAt: minutesAgo(now, 90) },
      0,
    ),
  }
}
