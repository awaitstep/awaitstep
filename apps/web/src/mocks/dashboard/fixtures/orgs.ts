import type { OrgMemberRow, OrgRow } from '../db'
import { daysAgo, minutesAgo } from './clock'
import { AMA, DANIEL, JONAS, LENA, PRIYA, TOM, TOMAS } from './people'

export const ACME = 'org_acme'
export const BOLT = 'org_bolt'
export const GLOBEX = 'org_globex'
export const SANDBOX = 'org_sandbox'

export function seedOrgs(now: Date): OrgRow[] {
  const org = (id: string, slug: string, name: string, ageDays: number): OrgRow => ({
    id,
    slug,
    name,
    createdAt: daysAgo(now, ageDays),
    cloudflareConnected: false,
    variableCount: 0,
  })
  return [
    // EmptyProject: "Cloudflare connected", "3 inherited from Acme Inc".
    { ...org(ACME, 'acme', 'Acme Inc', 400), cloudflareConnected: true, variableCount: 3 },
    org(BOLT, 'bolt-labs', 'Bolt Labs', 200),
    org(GLOBEX, 'globex', 'Globex', 300),
    org(SANDBOX, 'daniels-sandbox', 'Daniel’s sandbox', 90),
  ]
}

export function seedOrgMembers(now: Date): OrgMemberRow[] {
  const member = (
    orgId: string,
    userId: string,
    role: OrgMemberRow['role'],
    joinedDaysAgo: number,
    lastOpenedMinutesAgo: number | null,
  ): OrgMemberRow => ({
    orgId,
    userId,
    role,
    joinedAt: daysAgo(now, joinedDaysAgo),
    lastOpenedAt: lastOpenedMinutesAgo === null ? null : minutesAgo(now, lastOpenedMinutesAgo),
  })
  return [
    member(ACME, AMA, 'owner', 400, 10),
    member(ACME, TOM, 'member', 300, 60),
    member(ACME, DANIEL, 'member', 53, 120),
    member(ACME, PRIYA, 'member', 40, 1440),
    member(ACME, LENA, 'member', 200, 30),
    member(ACME, JONAS, 'member', 150, 300),
    member(BOLT, TOMAS, 'owner', 200, 60),
    member(BOLT, AMA, 'member', 7, null),
    member(GLOBEX, LENA, 'owner', 300, 600),
    member(SANDBOX, DANIEL, 'owner', 90, 1440),
  ]
}
