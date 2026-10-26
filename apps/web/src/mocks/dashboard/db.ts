import type { WorkspaceColour } from '../../components/ui/workspace-colour'
import type { ProjectRole } from '../../types/dashboard/projects'
import type { OrgRole, Person } from '../../types/dashboard/session'
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

export interface MockDb {
  people: Person[]
  orgs: OrgRow[]
  orgMembers: OrgMemberRow[]
  projects: ProjectRow[]
  projectMembers: ProjectMemberRow[]
  workspaces: WorkspaceRow[]
  workspaceMembers: WorkspaceMemberRow[]
}

// Bump when the tables or the seed change, so a tab's saved copy is reseeded
// instead of read with missing tables.
const DB_VERSION = 1
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
