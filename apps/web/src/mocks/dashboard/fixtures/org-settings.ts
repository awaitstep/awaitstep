import type {
  ConnectionRow,
  InvitationRow,
  ProjectConnectionRow,
  WorkspaceConnectionRow,
} from '../db'
import { daysAgo, minutesAgo } from './clock'
import { ACME, BOLT, GLOBEX } from './orgs'
import { AMA, DANIEL, LENA, TOMAS } from './people'
import { INTERNAL, MARKETING, P101 } from './projects'
import { IT, SALES } from './workspaces'

// `OrgMembers` (one pending invite) and `OrgConnections` (two accounts).
// P9's invite boards: Daniel's open Globex invite (`AcceptInvite`, `Dashboard`),
// his expired Bolt Labs one (`InviteExpired`), and Sam's opened by anyone else
// (`InviteWrongAccount`).

export function seedInvitations(now: Date): InvitationRow[] {
  return [
    {
      id: 'inv_sam',
      orgId: ACME,
      email: 'sam@acme.test',
      role: 'member',
      places: [{ projectId: P101, workspaceId: IT, role: 'editor' }],
      sentAt: daysAgo(now, 2),
      invitedBy: AMA,
    },
    {
      id: 'inv_globex_daniel',
      orgId: GLOBEX,
      email: 'daniel@acme.test',
      role: 'member',
      places: [{ projectId: 'prj_globex_ops', workspaceId: 'ws_globex_default', role: 'editor' }],
      sentAt: daysAgo(now, 2),
      invitedBy: LENA,
    },
    {
      id: 'inv_bolt_daniel',
      orgId: BOLT,
      email: 'daniel@acme.test',
      role: 'member',
      places: [{ projectId: 'prj_bolt_api', workspaceId: null, role: 'member' }],
      sentAt: daysAgo(now, 10),
      invitedBy: TOMAS,
    },
  ]
}

export function seedConnections(now: Date): ConnectionRow[] {
  return [
    {
      id: 'conn_production',
      orgId: ACME,
      name: 'Acme production',
      accountId: 'a3c19e0b5d7f4e21b8c6d2a90f3e7f2a',
      addedBy: AMA,
      tokenExpiresAt: null,
      projects: [P101, INTERNAL],
      deployments: 18,
      lastDeployAt: minutesAgo(now, 22),
    },
    {
      id: 'conn_marketing',
      orgId: ACME,
      name: 'Marketing sandbox',
      accountId: 'f0e1d2c3b4a5968778695a4b3c2d19c0',
      addedBy: LENA,
      tokenExpiresAt: daysAgo(now, -6),
      projects: [MARKETING],
      deployments: 4,
      lastDeployAt: minutesAgo(now, 180),
    },
    {
      id: 'conn_checkout',
      orgId: ACME,
      name: 'Checkout staging',
      accountId: '7d1c0e9a2b4f46a8b3e5c7d9f1a2b84d',
      addedBy: DANIEL,
      tokenExpiresAt: null,
      projects: [P101],
      deployments: 6,
      lastDeployAt: minutesAgo(now, 40),
      projectId: P101,
    },
  ]
}

/** `ProjectConnections` (23a): Project 101 deploys to Acme production, and Sales to its own account. */
export const PROJECT_CONNECTIONS: ProjectConnectionRow[] = [
  { projectId: P101, connectionId: 'conn_production', isDefault: true },
  { projectId: P101, connectionId: 'conn_checkout', isDefault: false },
  { projectId: INTERNAL, connectionId: 'conn_production', isDefault: true },
  { projectId: MARKETING, connectionId: 'conn_marketing', isDefault: true },
]

export const WORKSPACE_CONNECTIONS: WorkspaceConnectionRow[] = [
  { workspaceId: SALES, connectionId: 'conn_checkout' },
]
