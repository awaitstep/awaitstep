// Where the viewer was recently: workspaces per project (opening a project
// lands in the most recent one they can still open) and projects per org (org
// settings offers "Back to …"). A per-viewer convenience in localStorage,
// never the source of scope: the URL is. Every access is guarded, so blocked
// storage just means "nothing remembered".
//
// A short most-recent-first list rather than one value: a workspace page is
// remembered when it is entered, before its slug is known to exist, so a stale
// link must not push out the last workspace that did open.

type ScopeStorage = Pick<Storage, 'getItem' | 'setItem'>

const PREFIX = 'awaitstep:dashboard'
const KEEP = 5

function workspacesKey(org: string, project: string): string {
  return `${PREFIX}:recent-workspaces:${org}/${project}`
}

function projectsKey(org: string): string {
  return `${PREFIX}:recent-projects:${org}`
}

const ORGS_KEY = `${PREFIX}:recent-orgs`

function browserStorage(): ScopeStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function readList(storage: ScopeStorage | null, key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(key) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

function pushRecent(storage: ScopeStorage | null, key: string, value: string): void {
  const next = [value, ...readList(storage, key).filter((item) => item !== value)].slice(0, KEEP)
  try {
    storage?.setItem(key, JSON.stringify(next))
  } catch {
    // Full or blocked storage: forgetting is fine.
  }
}

/** Called whenever a workspace page is entered. */
export function rememberWorkspace(
  org: string,
  project: string,
  workspace: string,
  storage: ScopeStorage | null = browserStorage(),
): void {
  pushRecent(storage, workspacesKey(org, project), workspace)
  pushRecent(storage, projectsKey(org), project)
}

/** Workspace slugs entered in this project, most recent first. */
export function recentWorkspaces(
  org: string,
  project: string,
  storage: ScopeStorage | null = browserStorage(),
): string[] {
  return readList(storage, workspacesKey(org, project))
}

/** Called whenever an organization is opened; signing in lands in the most recent one. */
export function rememberOrg(org: string, storage: ScopeStorage | null = browserStorage()): void {
  pushRecent(storage, ORGS_KEY, org)
}

/** Organization slugs opened, most recent first. */
export function recentOrgs(storage: ScopeStorage | null = browserStorage()): string[] {
  return readList(storage, ORGS_KEY)
}

/** Project slugs entered in this org, most recent first. */
export function recentProjects(
  org: string,
  storage: ScopeStorage | null = browserStorage(),
): string[] {
  return readList(storage, projectsKey(org))
}
