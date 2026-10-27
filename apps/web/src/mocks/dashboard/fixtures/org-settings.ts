import type { ConnectionRow, InvitationRow } from '../db'
import { daysAgo, minutesAgo } from './clock'
import { ACME } from './orgs'
import { AMA, LENA } from './people'
import { INTERNAL, MARKETING, P101 } from './projects'
import { IT } from './workspaces'

// `OrgMembers` (one pending invite) and `OrgConnections` (two accounts).

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
  ]
}
