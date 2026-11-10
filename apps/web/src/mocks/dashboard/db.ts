import type { WorkspaceColour } from '../../components/ui/workspace-colour'
import type { SessionDevice, SignInProvider } from '../../types/dashboard/account'
import type { AuditActorType, AuditKind, AuditLevel } from '../../types/dashboard/audit'
import type { KeyLevel, KeyPermissions } from '../../types/dashboard/api-keys'
import type { NotificationKind } from '../../types/dashboard/inbox'
import type { FunctionTraffic, ItemKind } from '../../types/dashboard/items'
import type { OrgDestination, ProjectPage, WorkspacePage } from '../../lib/dashboard-paths'
import type { RunResult, RunTrigger } from '../../types/dashboard/runs'
import type { ProjectRole } from '../../types/dashboard/projects'
import type { NodeSource } from '../../types/dashboard/resources'
import type { OrgRole, Person } from '../../types/dashboard/session'
import type { VariableLevel } from '../../types/dashboard/variables'
import type { WorkspaceRole } from '../../types/dashboard/workspaces'
import { seedDb } from './fixtures'

// The fake API's tables. Rows hold ids, never nested records, so the server
// joins them the way the real one will.

export interface LockRow {
  setBy: string
  setAt: string
}

export interface OrgRow {
  id: string
  slug: string
  name: string
  createdAt: string
  /** An uploaded logo (data URL), or null for the initial. */
  logo: string | null
}

export interface OrgMemberRow {
  orgId: string
  userId: string
  role: OrgRole
  joinedAt: string
  lastOpenedAt: string | null
}

export interface ProjectRow {
  id: string
  orgId: string
  slug: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  lock: LockRow | null
}

export interface ProjectMemberRow {
  projectId: string
  userId: string
  role: ProjectRole
}

export interface WorkspaceRow {
  id: string
  projectId: string
  slug: string
  name: string
  description: string | null
  colour: WorkspaceColour
  createdAt: string
  createdBy: string
  lock: LockRow | null
}

export interface WorkspaceMemberRow {
  workspaceId: string
  userId: string
  role: WorkspaceRole
}

export interface ItemRow {
  id: string
  workspaceId: string
  kind: ItemKind
  name: string
  description: string | null
  status: 'deployed' | 'draft'
  version: number | null
  route: string | null
  createdAt: string
  updatedAt: string
  sharing: { sharedAt: string; sharedBy: string } | null
  traffic: FunctionTraffic | null
}

export interface RunRow {
  id: string
  itemId: string
  result: RunResult
  trigger: RunTrigger
  startedAt: string
  durationMs: number | null
  waitingOn: string | null
  httpStatus: number | null
  failure: { step: string; message: string } | null
}

/** A workspace calling another workspace's shared item (a Call Workflow step). */
export interface CallRow {
  callerWorkspaceId: string
  itemId: string
}

/** A Viewer's ask for edit access; the Inbox approves or declines it. */
export interface EditRequestRow {
  id: string
  workspaceId: string
  userId: string
  toUserId: string
  at: string
  /** A declined request stays for the outcome line; the person may ask again. */
  status: 'pending' | 'approved' | 'declined'
  /** Approved when they could already edit (raised meanwhile): nothing was granted. */
  alreadyEditing?: boolean
}

/** Where a notification's link goes, by id, so renames don't break it. */
export type NotificationTarget =
  | { kind: 'workspace'; workspaceId: string; page: WorkspacePage }
  | { kind: 'project-settings'; projectId: string; page: ProjectPage }
  | { kind: 'org-settings'; page: OrgDestination }
  | { kind: 'project-connections'; project: string }

/** A sample notification (failures, expiring keys, people, deploys); requests come from `editRequests`. */
export interface NotificationRow {
  id: string
  orgId: string
  userId: string
  kind: Exclude<NotificationKind, 'request'>
  title: string
  /** Where it happened: the org, a project, or a workspace. */
  projectId: string | null
  workspaceId: string | null
  /** After the place: "Connections" in "Acme Inc · Connections". */
  whereDetail: string | null
  at: string
  needsAction: boolean
  link: { label: string; to: NotificationTarget } | null
}

/** A notification someone has read (an edit request's id for request rows). */
export interface NotificationReadRow {
  userId: string
  notificationId: string
}

/** When someone last closed What's new. */
export interface ReleaseVisitRow {
  userId: string
  at: string
  /** The notes that visit showed. */
  seenIds: string[]
}

/** One scope a key reaches (a project or a workspace), with its own revoked state. */
export interface KeyScopeRow {
  /** The project id (project key) or workspace id (workspace key). */
  id: string
  /** When this consumer revoked its slice; null while live. */
  revokedAt: string | null
}

/**
 * An API key at any level. A key reaches a SET: `projectScopes` for a
 * project-level key, `workspaceScopes` for a workspace-level key, both empty
 * for an org-level key. Each scope carries its own revoked state, so one
 * consumer can drop the key while the others keep it.
 */
export interface KeyRow {
  id: string
  level: KeyLevel
  orgId: string
  name: string
  prefix: string
  permissions: KeyPermissions
  createdBy: string
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  projectScopes: KeyScopeRow[]
  workspaceScopes: KeyScopeRow[]
}

/** A variable set at one level; the scope id is the org, project or workspace it belongs to. */
export interface VariableRow {
  level: VariableLevel
  scopeId: string
  name: string
  value: string
  isSecret: boolean
  /** A project's or org's value listed for some workspaces/projects; absent: every one. */
  reachIds?: string[]
}

/** A pending invitation to an org (P9's invite pages accept it). */
export interface InvitationRow {
  id: string
  orgId: string
  email: string
  role: OrgRole
  places: { projectId: string; workspaceId: string | null; role: ProjectRole | WorkspaceRole }[]
  sentAt: string
  invitedBy: string
  /** Declined by the person invited; Undo reopens it. Accepted invites are removed. */
  declined?: boolean
  /** When they asked the inviter for a new one, after it expired. */
  askedForNewAt?: string
}

/** A Cloudflare account an org deploys to. */
export interface ConnectionRow {
  id: string
  orgId: string
  name: string
  accountId: string
  addedBy: string
  tokenExpiresAt: string | null
  /** `all`, or project ids. */
  projects: 'all' | string[]
  deployments: number
  lastDeployAt: string | null
  /** Set: the project's own account ("This project only"), never the org's. */
  projectId?: string | null
}

/** An account a project deploys to (23a): an org account it added, or its own. */
export interface ProjectConnectionRow {
  projectId: string
  connectionId: string
  isDefault: boolean
}

/** A workspace that deploys somewhere other than its project's default. */
export interface WorkspaceConnectionRow {
  workspaceId: string
  connectionId: string
}

/** A node in an org's catalog: a marketplace node, installed or not, or one the org built. */
export interface NodeRow {
  orgId: string
  id: string
  name: string
  category: string
  description: string
  source: NodeSource
  /** Custom nodes: who built it. */
  authorId: string | null
  /** Null while not installed; custom nodes are always installed. */
  installedVersion: string | null
  latestVersion: string
  /** Workflows using it: fixed sample numbers (the API counts current versions, B9). */
  usage: number
}

/** One audit log event; the scope ids say where it happened. */
export interface AuditRow {
  id: string
  orgId: string
  at: string
  kind: AuditKind
  /** The API's event code: `workspace.delete.blocked`. */
  event: string
  actor: string
  actorType: AuditActorType
  actorId: string
  actorEmail: string | null
  action: string
  target: string
  detail: string
  ip: string | null
  level: AuditLevel
  projectId: string | null
  workspaceId: string | null
}

/** A GitHub or Google account linked for sign-in. The email link needs no row: it's always on. */
export interface SignInMethodRow {
  userId: string
  provider: SignInProvider
  connectedAt: string
}

/** A signed-in browser or device; `current` is the one the dummy session is using. */
export interface SessionRow {
  id: string
  userId: string
  device: string
  kind: SessionDevice
  ip: string
  signedInAt: string
  activeAt: string
  current: boolean
}

export interface MockDb {
  people: Person[]
  orgs: OrgRow[]
  orgMembers: OrgMemberRow[]
  projects: ProjectRow[]
  projectMembers: ProjectMemberRow[]
  workspaces: WorkspaceRow[]
  workspaceMembers: WorkspaceMemberRow[]
  items: ItemRow[]
  runs: RunRow[]
  calls: CallRow[]
  editRequests: EditRequestRow[]
  keys: KeyRow[]
  variables: VariableRow[]
  invitations: InvitationRow[]
  connections: ConnectionRow[]
  projectConnections: ProjectConnectionRow[]
  workspaceConnections: WorkspaceConnectionRow[]
  nodes: NodeRow[]
  audit: AuditRow[]
  notifications: NotificationRow[]
  notificationReads: NotificationReadRow[]
  releaseVisits: ReleaseVisitRow[]
  signInMethods: SignInMethodRow[]
  sessions: SessionRow[]
}

// Bump when the tables or the seed change, so a tab's saved copy is reseeded
// instead of read with missing tables.
const DB_VERSION = 15
const STORAGE_KEY = 'awaitstep:dashboard-mock-db'

let current: MockDb | null = null

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

function load(): MockDb | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as { version: number; db: MockDb }
    return saved.version === DB_VERSION ? saved.db : null
  } catch {
    return null
  }
}

/** The tab's dummy data: its saved copy, or a fresh seed. */
export function getDb(): MockDb {
  current ??= load() ?? seedDb(new Date())
  return current
}

/** Saves the db for this tab, so a reload keeps what the session changed. */
/** Rows real mode makes up for the signed-in user's slugs (`real:<org slug>`…) and the person it adds. */
const SYNTHETIC = 'real:'
export const syntheticPeople = new Set<string>()

/** The tables without what real mode made up: those rows exist for one tab's reads only. */
export function withoutSynthetic(db: MockDb): MockDb {
  const realOrg = (id: string) => id.startsWith(SYNTHETIC)
  const orgs = db.orgs.filter((o) => !realOrg(o.id))
  const projects = db.projects.filter((p) => !realOrg(p.orgId))
  const projectIds = new Set(projects.map((p) => p.id))
  return {
    ...db,
    orgs,
    orgMembers: db.orgMembers.filter((m) => !realOrg(m.orgId)),
    projects,
    workspaces: db.workspaces.filter((w) => projectIds.has(w.projectId)),
    people: db.people.filter((p) => !syntheticPeople.has(p.id)),
  }
}

export function saveDb(): void {
  if (!current) return
  try {
    storage()?.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: DB_VERSION, db: withoutSynthetic(current) }),
    )
  } catch {
    // Storage full or blocked: the session keeps working from memory.
  }
}

/** Throws away the session's changes and reseeds. */
export function resetMockDb(now: Date = new Date()): void {
  current = seedDb(now)
  try {
    storage()?.removeItem(STORAGE_KEY)
  } catch {
    // Nothing saved to remove.
  }
}
