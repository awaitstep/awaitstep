import type { OrgRole } from '@awaitstep/ir'

const RANK: OrgRole[] = ['owner', 'admin', 'member']

/**
 * better-auth stores a member's role as text and allows a comma-joined list
 * (`admin,member`). The highest one counts; anything unknown reads as a
 * plain member, never as more.
 */
export function parseOrgRole(stored: string | null | undefined): OrgRole {
  const held = new Set((stored ?? '').split(',').map((r) => r.trim()))
  return RANK.find((role) => held.has(role)) ?? 'member'
}
