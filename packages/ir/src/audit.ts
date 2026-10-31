// The organization audit log (B7): what is recorded, how each event reads,
// and the token-check lockout schedule. A row's sentence is written once,
// when it happens, from the facts the API hands over — so the log reads as
// it did then and searches in SQL. Facts never carry secret values.

import { ACCESS_REASONS } from './access.js'
import type { KeyPermissions } from './key-permissions.js'
import type { WorkspaceColour } from './workspaces.js'

/** Sets the row's icon and tint. */
export type AuditKind = 'danger' | 'key' | 'access' | 'deploy' | 'auth' | 'lock'

export type AuditLevel = 'organization' | 'project' | 'workspace'

export const AUDIT_LEVELS: readonly AuditLevel[] = ['organization', 'project', 'workspace']

/** The audit log's Period select. Events are kept for 90 days. */
export type AuditPeriod = '24h' | '7d' | '30d' | '90d'

export const AUDIT_PERIODS: readonly AuditPeriod[] = ['24h', '7d', '30d', '90d']

const DAY_MS = 24 * 60 * 60 * 1000

export const AUDIT_PERIOD_MS: Record<AuditPeriod, number> = {
  '24h': DAY_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
  '90d': 90 * DAY_MS,
}

export const AUDIT_RETENTION_DAYS = 90
export const AUDIT_RETENTION_MS = AUDIT_RETENTION_DAYS * DAY_MS

export type AuditActorType = 'user' | 'key'

export interface AuditEvent {
  id: string
  at: string
  kind: AuditKind
  /** The catalog code: `workspace.delete`, `api_key.create`. */
  event: string
  /** A person, an API key's name, or "Unknown". The name is its owner's to choose. */
  actor: string
  actorType: AuditActorType
  /** Who acted, for certain: a user id or a key id. */
  actorId: string
  /** A person's address when they acted; null for a key. */
  actorEmail: string | null
  /** "tried to delete the workspace", "deployed". */
  action: string
  /** "IT", "Lead enrichment v12". */
  target: string
  /** How, and from where: "Blocked by the deletion lock · 81.2.69.x". */
  detail: string
  /** The masked client address, or null when none was known. */
  ip: string | null
  scope: {
    level: AuditLevel
    /** "Acme Inc", "Project 101", "Project 101 · Sales". */
    name: string
    /** The workspace's colour, for workspace-level events. */
    colour?: WorkspaceColour
  }
}

export interface AuditFilter {
  level?: AuditLevel
  period?: AuditPeriod
  /** Matches the person, the action and the target. */
  search?: string
  cursor?: string
  limit?: number
}

export interface AuditPage {
  data: AuditEvent[]
  nextCursor: string | null
  /** Events matching the filter, across every page. */
  total: number
}

/**
 * What the API knows about an event when it records it. Each catalog entry
 * reads the fields it needs; `name` is always the row's target.
 */
export interface AuditFacts {
  /** The target's name: a workspace, a workflow, a key, an email address. */
  name: string
  /** The person an access event is about. */
  person?: string
  /** Where something moved to: a workspace or project's name. */
  place?: string
  /** A role given, or the role after a change. */
  role?: string
  /** The role before a change. */
  fromRole?: string
  version?: number | string
  fromVersion?: number | string
  /** The organization a project moved to or from. */
  otherOrg?: string
  /** Why something was refused: "Blocked by the deletion lock". */
  reason?: string
  /** A key's grid in words: "read, write on Workflows". */
  summary?: string
  provider?: string
  /** A connection's or variable's change in words: "Renamed from Prod". */
  change?: string
  secret?: boolean
  failures?: number
  lockedForSeconds?: number
  /** How many things one event covers: sessions signed out. */
  count?: number
}

interface AuditEntry {
  kind: AuditKind
  action: (facts: AuditFacts) => string
  target?: (facts: AuditFacts) => string
  detail?: (facts: AuditFacts) => string | undefined
}

const fixed = (text: string) => () => text

const theirAccount = () => 'their account'

const PROVIDER_LABEL: Record<string, string> = { github: 'GitHub', google: 'Google' }

function providerLabel(provider: string | undefined): string {
  return (provider && PROVIDER_LABEL[provider]) ?? 'a sign-in method'
}
const roleLabel = (role: string) => role.charAt(0).toUpperCase() + role.slice(1)
// A refusal reads as what stopped it: "Turn off the deletion lock first"
// is advice to the person refused, not what happened.
const reason = (f: AuditFacts) => {
  if (!f.reason) return undefined
  return f.reason === ACCESS_REASONS.lockFirst
    ? 'Blocked by the deletion lock'
    : `Blocked: ${f.reason}`
}
const roleDetail = (f: AuditFacts) => (f.role ? `Role: ${roleLabel(f.role)}` : undefined)
const roleChange = (f: AuditFacts) =>
  f.fromRole && f.role && f.fromRole !== f.role
    ? `${roleLabel(f.fromRole)} → ${roleLabel(f.role)}`
    : roleDetail(f)
const joined = (...parts: (string | undefined)[]) =>
  parts.filter((part): part is string => Boolean(part)).join(' · ') || undefined
const versioned = (f: AuditFacts) => (f.version !== undefined ? `${f.name} v${f.version}` : f.name)
const possessive = (person: string | undefined) => `${person ?? 'someone'}’s`

/** Every event the log records, by code. */
export const AUDIT_EVENTS = {
  'project.delete': { kind: 'danger', action: fixed('deleted the project') },
  'project.delete.blocked': {
    kind: 'danger',
    action: fixed('tried to delete the project'),
    detail: reason,
  },
  'project.move.out': {
    kind: 'danger',
    action: fixed('moved the project'),
    detail: (f) => (f.otherOrg ? `To ${f.otherOrg}` : undefined),
  },
  'project.move.in': {
    kind: 'danger',
    action: fixed('moved in the project'),
    detail: (f) => (f.otherOrg ? `From ${f.otherOrg}` : undefined),
  },
  'project.move.blocked': {
    kind: 'danger',
    action: fixed('tried to move the project'),
    detail: reason,
  },
  'workspace.delete': { kind: 'danger', action: fixed('deleted the workspace') },
  'workspace.delete.blocked': {
    kind: 'danger',
    action: fixed('tried to delete the workspace'),
    detail: reason,
  },
  'workflow.delete': { kind: 'danger', action: fixed('deleted the workflow') },
  'workflow.takedown': { kind: 'danger', action: fixed('took down'), target: versioned },
  'version.delete': { kind: 'danger', action: fixed('deleted a version of'), target: versioned },

  'api_key.create': {
    kind: 'key',
    action: fixed('created the API key'),
    detail: (f) => f.summary,
  },
  'api_key.revoke': { kind: 'key', action: fixed('revoked the API key') },
  'connection.create': {
    kind: 'key',
    action: fixed('added the connection'),
    detail: (f) => f.provider && roleLabel(f.provider),
  },
  'connection.update': {
    kind: 'key',
    action: fixed('changed the connection'),
    detail: (f) => f.change,
  },
  'connection.delete': { kind: 'key', action: fixed('deleted the connection') },
  'variable.create': {
    kind: 'key',
    action: fixed('added the variable'),
    detail: (f) => (f.secret ? 'Secret' : undefined),
  },
  'variable.update': {
    kind: 'key',
    action: fixed('changed the variable'),
    detail: (f) => f.change,
  },
  'variable.delete': { kind: 'key', action: fixed('deleted the variable') },

  'invitation.create': { kind: 'access', action: fixed('invited'), detail: roleDetail },
  'invitation.cancel': { kind: 'access', action: fixed('cancelled the invitation for') },
  'member.access': {
    kind: 'access',
    action: fixed('changed the access of'),
    detail: (f) => {
      const changed = f.fromRole && f.role && f.fromRole !== f.role
      const role = changed
        ? `Org role: ${roleLabel(f.fromRole!)} → ${roleLabel(f.role!)}`
        : f.role && `Org role: ${roleLabel(f.role)}`
      return joined(role || undefined, f.summary)
    },
  },
  'member.remove': { kind: 'access', action: fixed('removed') },
  'workspace_member.add': {
    kind: 'access',
    action: (f) => `added ${f.person ?? 'someone'} to`,
    detail: roleDetail,
  },
  'workspace_member.role': {
    kind: 'access',
    action: (f) => `changed ${possessive(f.person)} role in`,
    detail: roleChange,
  },
  'workspace_member.remove': {
    kind: 'access',
    action: (f) => `removed ${f.person ?? 'someone'} from`,
  },
  'access_request.approve': {
    kind: 'access',
    action: (f) => `approved ${possessive(f.person)} request for`,
    detail: roleDetail,
  },
  'access_request.decline': {
    kind: 'access',
    action: (f) => `declined ${possessive(f.person)} request for`,
  },
  'member.join': { kind: 'access', action: fixed('joined'), detail: roleDetail },
  'member.leave': { kind: 'access', action: fixed('left') },
  'workflow.move': {
    kind: 'access',
    action: fixed('moved'),
    detail: (f) => (f.place ? `To ${f.place}` : undefined),
  },
  'organization.update': {
    kind: 'access',
    action: fixed('changed the settings of'),
    detail: (f) => f.change,
  },
  'workflow.share': { kind: 'access', action: fixed('shared to the project') },
  'workflow.unshare': { kind: 'access', action: fixed('stopped sharing') },

  'workflow.deploy': {
    kind: 'deploy',
    action: fixed('deployed'),
    target: versioned,
    detail: (f) => f.provider,
  },
  'version.revert': {
    kind: 'deploy',
    action: fixed('reverted'),
    detail: (f) => (f.version !== undefined ? `To v${f.version}` : undefined),
  },
  'node.install': {
    kind: 'deploy',
    action: fixed('installed the node'),
    detail: (f) => (f.version !== undefined ? `v${f.version}` : undefined),
  },
  'node.update': {
    kind: 'deploy',
    action: fixed('updated the node'),
    detail: (f) =>
      f.fromVersion !== undefined && f.version !== undefined
        ? `v${f.fromVersion} → v${f.version}`
        : undefined,
  },
  'node.uninstall': {
    kind: 'deploy',
    action: fixed('removed the node'),
    detail: (f) => (f.version !== undefined ? `v${f.version}` : undefined),
  },

  'project.lock': { kind: 'lock', action: fixed('turned on the deletion lock for') },
  'project.unlock': { kind: 'lock', action: fixed('turned off the deletion lock for') },
  'workspace.lock': { kind: 'lock', action: fixed('turned on the deletion lock for') },
  'workspace.unlock': { kind: 'lock', action: fixed('turned off the deletion lock for') },

  signin: { kind: 'auth', action: fixed('signed in to') },
  // The person's own account, in the log of every organization they are in.
  'account.method_connect': {
    kind: 'auth',
    action: (f) => `connected ${providerLabel(f.provider)} to`,
    target: theirAccount,
  },
  'account.method_disconnect': {
    kind: 'auth',
    action: (f) => `disconnected ${providerLabel(f.provider)} from`,
    target: theirAccount,
  },
  'session.revoke': {
    kind: 'auth',
    action: (f) =>
      `signed out ${f.count === undefined || f.count === 1 ? 'a session' : `${f.count} sessions`} of`,
    target: theirAccount,
  },
  'account.export': { kind: 'auth', action: fixed('downloaded the data of'), target: theirAccount },
  'account.delete': { kind: 'danger', action: fixed('deleted'), target: theirAccount },
  'connection.verify.failed': {
    kind: 'auth',
    action: fixed('failed a token check for'),
  },
  'connection.verify.locked': {
    kind: 'auth',
    action: fixed('was locked out of token checks for'),
    detail: (f) =>
      f.failures !== undefined && f.lockedForSeconds !== undefined
        ? `${f.failures} failed checks · locked for ${formatWait(f.lockedForSeconds)}`
        : undefined,
  },
  /**
   * A token check about to run, written under the person (never the key)
   * before Cloudflare is asked, and withdrawn when the token was valid: what
   * the lockout counts. Never listed.
   */
  'connection.verify.attempt': { kind: 'auth', action: fixed('checked a token for') },
} satisfies Record<string, AuditEntry>

export type AuditEventCode = keyof typeof AUDIT_EVENTS

/** Codes the log stores but never lists: markers the lockout counts from. */
export const HIDDEN_AUDIT_EVENTS: readonly AuditEventCode[] = ['connection.verify.attempt']

export function isAuditEventCode(value: string): value is AuditEventCode {
  return Object.prototype.hasOwnProperty.call(AUDIT_EVENTS, value)
}

export interface RenderedAuditEvent {
  kind: AuditKind
  action: string
  target: string
  detail: string
}

/**
 * The row's words. `via` says how ("Dashboard", "Project API key …a71d") and
 * `ip` from where; both close the detail, as the board's samples read.
 */
export function renderAuditEvent(
  code: AuditEventCode,
  facts: AuditFacts,
  context: { via?: string; ip?: string | null } = {},
): RenderedAuditEvent {
  const entry: AuditEntry = AUDIT_EVENTS[code]
  const clean = cleanFacts(facts)
  const parts = [entry.detail?.(clean), context.via, context.ip ?? undefined].filter(
    (part): part is string => Boolean(part),
  )
  return {
    kind: entry.kind,
    action: entry.action(clean),
    target: entry.target ? entry.target(clean) : clean.name,
    detail: parts.join(' · '),
  }
}

/** The longest name or fact a row keeps. */
export const AUDIT_TEXT_MAX = 200

// C0 and C1 controls, and the bidi overrides and isolates that reorder what follows.
// eslint-disable-next-line no-control-regex
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

/**
 * Text someone chose (a name, a label), as the log keeps it: controls and
 * direction overrides out, and no longer than `AUDIT_TEXT_MAX`, so a name
 * can neither reorder a row nor bloat every page it lands on.
 */
export function auditText(text: string): string {
  return stripUnsafeText(text).slice(0, AUDIT_TEXT_MAX)
}

/** `text` without controls and direction overrides: what a name may hold anywhere. */
export function stripUnsafeText(text: string): string {
  return text.replace(UNSAFE_TEXT, '')
}

function cleanFacts(facts: AuditFacts): AuditFacts {
  return Object.fromEntries(
    Object.entries(facts).map(([key, value]) => [
      key,
      typeof value === 'string' ? auditText(value) : value,
    ]),
  ) as unknown as AuditFacts
}

function expandIpv6(address: string): string[] | null {
  const halves = address.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  return groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g)) ? groups : null
}

/**
 * A client address cut down to what the log keeps: IPv4 to its /24
 * (`81.2.69.x`), IPv6 to its /48 (`2001:db8:85a3::x`). Anything else is null.
 */
export function maskIp(address: string | null | undefined): string | null {
  const value = address?.trim()
  if (!value) return null
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i.exec(value)
  if (v4) {
    const octets = v4.slice(1).map(Number)
    if (octets.some((o) => o > 255)) return null
    return `${octets[0]}.${octets[1]}.${octets[2]}.x`
  }
  const groups = expandIpv6(value.replace(/%.*$/, ''))
  if (!groups) return null
  return `${groups
    .slice(0, 3)
    .map((g) => g.toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':')}::x`
}

const RESOURCE_LABEL: Record<string, string> = { audit: 'Audit log' }

/**
 * A key's grid in words, resources with the same actions together:
 * "read, write on Workflows · read on Runs, Variables".
 */
export function describeKeyGrid(permissions: KeyPermissions): string {
  const groups = new Map<string, string[]>()
  for (const [resource, actions] of Object.entries(permissions)) {
    if (!actions || actions.length === 0) continue
    const key = actions.join(', ')
    const label = RESOURCE_LABEL[resource] ?? roleLabel(resource)
    groups.set(key, [...(groups.get(key) ?? []), label])
  }
  return [...groups]
    .map(([actions, resources]) => `${actions} on ${resources.join(', ')}`)
    .join(' · ')
}

/** Failed token checks allowed before the first wait. */
export const VERIFY_FREE_FAILURES = 3
const VERIFY_FIRST_WAIT_SECONDS = 30
const VERIFY_MAX_WAIT_SECONDS = 5 * 60
/** Failures older than this no longer count. */
export const VERIFY_FAILURE_WINDOW_MS = 60 * 60 * 1000

/** How long `failures` consecutive failed checks lock token checks for: 0 up to three, then 30 s doubling to 5 min. */
export function verifyLockSeconds(failures: number): number {
  if (failures <= VERIFY_FREE_FAILURES) return 0
  const doublings = failures - VERIFY_FREE_FAILURES - 1
  return Math.min(VERIFY_FIRST_WAIT_SECONDS * 2 ** Math.min(doublings, 10), VERIFY_MAX_WAIT_SECONDS)
}

/**
 * Whether token checks are locked now, after `failures` consecutive failures
 * the last of which was at `lastFailureAt`; the seconds left when they are.
 */
export function verifyLockout(
  failures: number,
  lastFailureAt: Date | null,
  now: Date,
): { retryAfterSeconds: number } | null {
  const lockedFor = verifyLockSeconds(failures)
  if (lockedFor === 0 || !lastFailureAt) return null
  const left = lastFailureAt.getTime() + lockedFor * 1000 - now.getTime()
  return left > 0 ? { retryAfterSeconds: Math.ceil(left / 1000) } : null
}

/** "30 s", "2 min", "1 min 30 s". */
export function formatWait(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes === 0) return `${rest} s`
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`
}
