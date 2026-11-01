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
// When each org was opened, for /dashboard's "Opened 2h ago" (D-DB-1). Kept
// beside the list, which stays plain slugs for every older reader.
const ORG_TIMES_KEY = `${PREFIX}:org-opened-at`

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

/** Opening any of a project's pages makes it the org's current project (cards, key defaults). */
export function rememberProject(
  org: string,
  project: string,
  storage: ScopeStorage | null = browserStorage(),
): void {
  pushRecent(storage, projectsKey(org), project)
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

/**
 * The workspace a project's pages treat as yours: the most recent one the
 * viewer can still open, else the first one. With none to open, null.
 */
export function pickWorkspace(
  available: readonly string[],
  recent: readonly string[],
): string | null {
  return recent.find((slug) => available.includes(slug)) ?? available[0] ?? null
}

/** Workspace slugs entered in this project, most recent first. */
export function recentWorkspaces(
  org: string,
  project: string,
  storage: ScopeStorage | null = browserStorage(),
): string[] {
  return readList(storage, workspacesKey(org, project))
}

// A Map, not an object: an org's slug can be `constructor` or `toString`,
// which an object lookup would answer from its prototype. Only real times are kept.
function readTimes(storage: ScopeStorage | null): Map<string, string> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(ORG_TIMES_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map()
    return new Map(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' && !Number.isNaN(Date.parse(entry[1])),
      ),
    )
  } catch {
    return new Map()
  }
}

/** Called whenever an organization is opened; signing in lands in the most recent one. */
export function rememberOrg(
  org: string,
  storage: ScopeStorage | null = browserStorage(),
  now: Date = new Date(),
): void {
  pushRecent(storage, ORGS_KEY, org)
  // Only the orgs still on the recent list keep a time, so the map stays as short as it.
  const kept = new Set(readList(storage, ORGS_KEY))
  const times = readTimes(storage).set(org, now.toISOString())
  const stored = Object.fromEntries([...times].filter(([slug]) => kept.has(slug)))
  try {
    storage?.setItem(ORG_TIMES_KEY, JSON.stringify(stored))
  } catch {
    // Full or blocked storage: forgetting is fine.
  }
}

/** When this browser last opened the organization, or null. */
export function orgOpenedAt(
  org: string,
  storage: ScopeStorage | null = browserStorage(),
): string | null {
  return readTimes(storage).get(org) ?? null
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
