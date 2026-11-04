import type { KeyRow, KeyScopeRow } from '../db'
import { daysAgo, minutesAgo } from './clock'
import { ACME } from './orgs'
import { AMA, LENA, TOM } from './people'
import { MARKETING, P101 } from './projects'
import { IT, SALES, SUPPORT } from './workspaces'

// `KeysPage` (project and org levels) and its Workspace keys card ("Sales · 2",
// "IT · 2"). A key reaches a SET: `projectScopes` for a project key,
// `workspaceScopes` for a workspace key. "Platform sync" is a multi-project
// bundle (homed at the org, reaching Project 101 and Marketing); "Ops events"
// is a multi-workspace bundle (homed at Project 101, reaching Sales and Support).

const DAY_MINUTES = 24 * 60

const scope = (id: string): KeyScopeRow => ({ id, revokedAt: null })

export function seedKeys(now: Date): KeyRow[] {
  const inDays = (days: number) => daysAgo(now, -days)
  const key = (
    seed: Omit<KeyRow, 'orgId' | 'projectScopes' | 'workspaceScopes'> &
      Partial<Pick<KeyRow, 'orgId' | 'projectScopes' | 'workspaceScopes'>>,
  ): KeyRow => ({
    orgId: ACME,
    projectScopes: [],
    workspaceScopes: [],
    ...seed,
  })
  return [
    key({
      id: 'key_ci',
      level: 'project',
      name: 'CI deploys',
      prefix: 'ask_Kq3VtR8m…a71d',
      permissions: { workflows: ['read', 'deploy'], runs: ['read'] },
      createdBy: TOM,
      createdAt: daysAgo(now, 60),
      lastUsedAt: minutesAgo(now, 22),
      expiresAt: null,
      projectScopes: [scope(P101)],
    }),
    key({
      id: 'key_agent',
      level: 'project',
      name: 'Agent (Claude)',
      prefix: 'ask_zN8wLc2e…2e07',
      permissions: { workflows: ['read', 'write'], variables: ['read'], runs: ['read'] },
      createdBy: AMA,
      createdAt: daysAgo(now, 2),
      lastUsedAt: minutesAgo(now, 180),
      expiresAt: inDays(28),
      projectScopes: [scope(P101)],
    }),
    key({
      id: 'key_dashboard',
      level: 'project',
      name: 'Read-only dashboard',
      prefix: 'ask_H2pmXd7q…90fa',
      permissions: {
        workspaces: ['read'],
        workflows: ['read'],
        runs: ['read'],
        variables: ['read'],
        members: ['read'],
      },
      createdBy: LENA,
      createdAt: daysAgo(now, 30),
      lastUsedAt: minutesAgo(now, DAY_MINUTES + 120),
      expiresAt: inDays(3),
      projectScopes: [scope(P101)],
    }),
    key({
      id: 'key_platform',
      level: 'project',
      name: 'Platform sync',
      prefix: 'ask_Pf5sYk2w…11c8',
      permissions: { workflows: ['read', 'deploy'], runs: ['read'] },
      createdBy: TOM,
      createdAt: daysAgo(now, 15),
      lastUsedAt: minutesAgo(now, 45),
      expiresAt: inDays(90),
      projectScopes: [scope(P101), scope(MARKETING)],
    }),
    key({
      id: 'key_ops_events',
      level: 'workspace',
      name: 'Ops events',
      prefix: 'ask_Op3nEv7s…4d2b',
      permissions: { workflows: ['run'] },
      createdBy: AMA,
      createdAt: daysAgo(now, 18),
      lastUsedAt: minutesAgo(now, 12),
      expiresAt: null,
      workspaceScopes: [scope(SALES), scope(SUPPORT)],
    }),
    key({
      id: 'key_sales_crm',
      level: 'workspace',
      name: 'CRM webhook',
      prefix: 'ask_Vt6cJn4y…5c3a',
      permissions: { workflows: ['run'] },
      createdBy: AMA,
      createdAt: daysAgo(now, 40),
      lastUsedAt: minutesAgo(now, 5),
      expiresAt: null,
      workspaceScopes: [scope(SALES)],
    }),
    key({
      id: 'key_it_okta',
      level: 'workspace',
      name: 'Okta events',
      prefix: 'ask_b9QxFs1k…d810',
      permissions: { workflows: ['run'] },
      createdBy: LENA,
      createdAt: daysAgo(now, 80),
      lastUsedAt: minutesAgo(now, 60),
      expiresAt: null,
      workspaceScopes: [scope(IT)],
    }),
    key({
      id: 'key_it_deploy',
      level: 'workspace',
      name: 'IT deploys',
      prefix: 'ask_mL4rWp9t…7b42',
      permissions: { workflows: ['read', 'deploy'], runs: ['read'] },
      createdBy: LENA,
      createdAt: daysAgo(now, 20),
      lastUsedAt: null,
      expiresAt: inDays(60),
      workspaceScopes: [scope(IT)],
    }),
    key({
      id: 'key_terraform',
      level: 'organization',
      name: 'Terraform',
      prefix: 'ask_Xe7kBv3h…3b9e',
      permissions: { projects: ['read', 'write'], connections: ['read'] },
      createdBy: TOM,
      createdAt: daysAgo(now, 36),
      lastUsedAt: daysAgo(now, 2),
      expiresAt: inDays(54),
    }),
    key({
      id: 'key_onboarding',
      level: 'organization',
      name: 'Onboarding bot',
      prefix: 'ask_q1DnRz6u…c41d',
      permissions: { members: ['read'] },
      createdBy: AMA,
      createdAt: daysAgo(now, 10),
      lastUsedAt: null,
      expiresAt: inDays(5),
    }),
  ]
}
