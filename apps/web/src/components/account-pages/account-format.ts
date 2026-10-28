import { format } from 'date-fns'
import { plural } from '../../lib/plural'
import { timeAgoOrDay } from '../../lib/time'
import type { AccountOrg, AccountSession, SignInMethod } from '../../types/dashboard/account'
import { ORG_ROLE_LABEL } from '../access/parts/access-draft'

const DAY_MS = 24 * 60 * 60 * 1000

/** Mid-sentence: "signed in yesterday", not "signed in Yesterday". */
function inSentence(text: string): string {
  return text === 'Yesterday' ? 'yesterday' : text
}

/** "Owner · 3 projects · the only owner" (`AccountProfile`'s Organizations). */
export function orgMeta(org: AccountOrg): string {
  const parts = [ORG_ROLE_LABEL[org.role], plural(org.projectCount, 'project')]
  if (org.onlyOwner) parts.push('the only owner')
  return parts.join(' · ')
}

/** "81.2.69.x · signed in 3 days ago". */
export function sessionDetail(session: AccountSession, now: Date = new Date()): string {
  return `${session.ip} · signed in ${inSentence(timeAgoOrDay(session.signedInAt, now))}`
}

/** "Active now" for this device, else "Active 2h ago". */
export function sessionActivity(session: AccountSession, now: Date = new Date()): string {
  if (session.current) return 'Active now'
  return `Active ${inSentence(timeAgoOrDay(session.activeAt, now))}`
}

export const PROVIDER_LABEL: Record<SignInMethod['provider'], string> = {
  github: 'GitHub',
  google: 'Google',
  email: 'Email link',
}

/** The line under a sign-in method: the linked account, or what connecting does. */
export function methodDetail(method: SignInMethod, now: Date = new Date()): string {
  if (method.provider === 'email') return `A one-time link sent to ${method.account}`
  if (!method.account || !method.connectedAt) {
    return `Sign in with your ${PROVIDER_LABEL[method.provider]} account`
  }
  const at = new Date(method.connectedAt)
  const when = now.getTime() - at.getTime() < DAY_MS ? timeAgoOrDay(at, now) : format(at, 'd MMM')
  return `${method.account} · connected ${when}`
}

/** Download JSON's file name: `awaitstep-account-2026-10-28.json`. */
export function exportFileName(now: Date = new Date()): string {
  return `awaitstep-account-${format(now, 'yyyy-MM-dd')}.json`
}
