import type { WorkspaceColour } from '../../components/ui/workspace-colour'
import type { KeyLevel, KeyPermissions } from '../../types/dashboard/api-keys'
import type { FunctionTraffic, ItemKind } from '../../types/dashboard/items'
import type { RunResult, RunTrigger } from '../../types/dashboard/runs'
import type { ProjectRole } from '../../types/dashboard/projects'
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

/** A Viewer's ask for edit access; P8's Inbox approves or declines it. */
export interface EditRequestRow {
  id: string
  workspaceId: string
  userId: string
  toUserId: string
  at: string
}

/** An API key at any level; `projectId` / `workspaceId` say what it reaches. */
export interface KeyRow {
  id: string
  level: KeyLevel
  orgId: string
  projectId: string | null
  workspaceId: string | null
  name: string
  prefix: string
  permissions: KeyPermissions
  createdBy: string
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
}

/** A variable set at one level; the scope id is the org, project or workspace it belongs to. */
export interface VariableRow {
  level: VariableLevel
  scopeId: string
  name: string
  value: string
  isSecret: boolean
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
}

// Bump when the tables or the seed change, so a tab's saved copy is reseeded
// instead of read with missing tables.
const DB_VERSION = 5
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
export function saveDb(): void {
  if (!current) return
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify({ version: DB_VERSION, db: current }))
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
