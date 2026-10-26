import type { OrgMemberRow, OrgRow } from '../db'
import { daysAgo, minutesAgo } from './clock'
import { AMA, DANIEL, JONAS, LENA, PRIYA, TOM, TOMAS } from './people'

export const ACME = 'org_acme'
export const BOLT = 'org_bolt'
export const GLOBEX = 'org_globex'
export const SANDBOX = 'org_sandbox'

export function seedOrgs(now: Date): OrgRow[] {
  return [
    { id: ACME, slug: 'acme', name: 'Acme Inc', createdAt: daysAgo(now, 400) },
    { id: BOLT, slug: 'bolt-labs', name: 'Bolt Labs', createdAt: daysAgo(now, 200) },
    { id: GLOBEX, slug: 'globex', name: 'Globex', createdAt: daysAgo(now, 300) },
    { id: SANDBOX, slug: 'daniels-sandbox', name: 'Daniel’s sandbox', createdAt: daysAgo(now, 90) },
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
