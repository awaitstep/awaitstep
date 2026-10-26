import type { WorkspaceMemberRow, WorkspaceRow } from '../db'
import { daysAgo, minutesAgo } from './clock'
import { DANIEL, AMA, LENA, PRIYA, TOMAS } from './people'
import { INTERNAL, MARKETING, P101 } from './projects'

export const SALES = 'ws_sales'
export const IT = 'ws_it'
export const SUPPORT = 'ws_support'

export function seedWorkspaces(now: Date): WorkspaceRow[] {
  const workspace = (
    id: string,
    projectId: string,
    slug: string,
    name: string,
    colour: WorkspaceRow['colour'],
    description: string | null,
    createdAt: string,
    createdBy = AMA,
  ): WorkspaceRow => ({
    id,
    projectId,
    slug,
    name,
    colour,
    description,
    createdAt,
    createdBy,
    lock: null,
  })
  return [
    workspace(
      SALES,
      P101,
      'sales',
      'Sales',
      'green',
      'Lead handling and pipeline reports',
      daysAgo(now, 120),
    ),
    workspace(IT, P101, 'it', 'IT', 'blue', 'Accounts, alerts and provisioning', daysAgo(now, 100)),
    // "Created today by Ama Mensah" on the canvas.
    workspace(SUPPORT, P101, 'support', 'Support', 'amber', null, minutesAgo(now, 90)),
    workspace(
      'ws_marketing_default',
      MARKETING,
      'default',
      'Default',
      'amber',
      null,
      daysAgo(now, 200),
    ),
    workspace(
      'ws_internal_default',
      INTERNAL,
      'default',
      'Default',
      'purple',
      null,
      daysAgo(now, 300),
    ),
    workspace(
      'ws_bolt_default',
      'prj_bolt_api',
      'default',
      'Default',
      'green',
      null,
      daysAgo(now, 150),
      TOMAS,
    ),
    workspace(
      'ws_globex_default',
      'prj_globex_ops',
      'default',
      'Default',
      'green',
      null,
      daysAgo(now, 250),
      LENA,
    ),
    workspace(
      'ws_experiments_default',
      'prj_experiments',
      'default',
      'Default',
      'green',
      null,
      daysAgo(now, 80),
      DANIEL,
    ),
    workspace(
      'ws_scratch_default',
      'prj_scratch',
      'default',
      'Default',
      'blue',
      null,
      daysAgo(now, 20),
      DANIEL,
    ),
  ]
}

export const WORKSPACE_MEMBERS: WorkspaceMemberRow[] = [
  { workspaceId: SALES, userId: DANIEL, role: 'editor' },
  { workspaceId: SALES, userId: PRIYA, role: 'viewer' },
  { workspaceId: IT, userId: LENA, role: 'admin' },
]
