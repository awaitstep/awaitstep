// What an API key may do, by level (B3). A key is minted at one level —
// the organization, a project or one workspace — and carries a grid of
// resources × actions from the catalog of that level. The API checks every
// request a key makes against the grid; the dashboard's Create key dialog
// offers exactly the cells the API backs (dashboard IA, O10). Labels and
// hints live in the web; this is the data and the rules.

import type { ScopeLevel } from './access.js'

export type KeyLevel = ScopeLevel

export type KeyAction = 'read' | 'write' | 'delete' | 'deploy' | 'run'

export type KeyResource =
  | 'projects'
  | 'members'
  | 'connections'
  | 'resources'
  | 'workspaces'
  | 'workflows'
  | 'runs'
  | 'variables'
  | 'audit'

/** The actions a key may take, per resource. A missing resource grants nothing. */
export type KeyPermissions = Partial<Record<KeyResource, KeyAction[]>>

export type KeyPreset = 'read' | 'deploy-run' | 'full'

export const KEY_LEVELS: readonly KeyLevel[] = ['organization', 'project', 'workspace']

export const KEY_ACTIONS: readonly KeyAction[] = ['read', 'write', 'delete', 'deploy', 'run']

export interface KeyCatalogEntry {
  id: KeyResource
  /** Valid actions, in `KEY_ACTIONS` order. */
  actions: readonly KeyAction[]
}

const READ_ONLY = ['read'] as const
const READ_WRITE_DELETE = ['read', 'write', 'delete'] as const

/**
 * The cells each level offers — only those the API backs today. Members
 * are read-only for keys (people are a person's decision); a workspace key
 * sets its own workspace's variables (B4); an organization key may read
 * the audit log (B7); the library (W2) returns with its routes.
 */
export const KEY_CATALOG: Record<KeyLevel, readonly KeyCatalogEntry[]> = {
  organization: [
    { id: 'projects', actions: READ_WRITE_DELETE },
    { id: 'members', actions: READ_ONLY },
    { id: 'connections', actions: READ_WRITE_DELETE },
    { id: 'resources', actions: READ_WRITE_DELETE },
    { id: 'audit', actions: READ_ONLY },
  ],
  project: [
    { id: 'workspaces', actions: READ_WRITE_DELETE },
    { id: 'workflows', actions: KEY_ACTIONS },
    { id: 'runs', actions: READ_ONLY },
    { id: 'variables', actions: READ_WRITE_DELETE },
    { id: 'members', actions: READ_ONLY },
  ],
  workspace: [
    { id: 'workflows', actions: KEY_ACTIONS },
    { id: 'runs', actions: READ_ONLY },
    { id: 'variables', actions: READ_WRITE_DELETE },
  ],
}

/** Organization keys never touch workflows, so "Deploy & run" is not offered there. */
export const KEY_PRESETS: Record<KeyLevel, readonly KeyPreset[]> = {
  organization: ['read', 'full'],
  project: ['read', 'deploy-run', 'full'],
  workspace: ['read', 'deploy-run', 'full'],
}

function presetGrants(preset: KeyPreset, resource: KeyCatalogEntry, action: KeyAction): boolean {
  switch (preset) {
    case 'read':
      return action === 'read'
    case 'full':
      return true
    case 'deploy-run':
      return (
        action === 'read' ||
        (resource.id === 'workflows' && (action === 'deploy' || action === 'run'))
      )
  }
}

export function presetPermissions(level: KeyLevel, preset: KeyPreset): KeyPermissions {
  const permissions: KeyPermissions = {}
  for (const resource of KEY_CATALOG[level]) {
    const actions = resource.actions.filter((action) => presetGrants(preset, resource, action))
    if (actions.length > 0) permissions[resource.id] = actions
  }
  return permissions
}

/** Keeps only the cells valid at `level`, in catalog order, dropping empty resources. */
export function normalisePermissions(level: KeyLevel, value: KeyPermissions): KeyPermissions {
  const permissions: KeyPermissions = {}
  for (const resource of KEY_CATALOG[level]) {
    const granted = value[resource.id] ?? []
    const actions = resource.actions.filter((action) => granted.includes(action))
    if (actions.length > 0) permissions[resource.id] = actions
  }
  return permissions
}

function samePermissions(level: KeyLevel, a: KeyPermissions, b: KeyPermissions): boolean {
  return (
    JSON.stringify(normalisePermissions(level, a)) ===
    JSON.stringify(normalisePermissions(level, b))
  )
}

/** The preset `value` is exactly, or `custom` when it matches none. */
export function matchPreset(level: KeyLevel, value: KeyPermissions): KeyPreset | 'custom' {
  const match = KEY_PRESETS[level].find((preset) =>
    samePermissions(level, value, presetPermissions(level, preset)),
  )
  return match ?? 'custom'
}

export function hasGrant(value: KeyPermissions, resource: KeyResource, action: KeyAction): boolean {
  return value[resource]?.includes(action) ?? false
}

/** `value` with one cell flipped, still in catalog order. */
export function toggleGrant(
  level: KeyLevel,
  value: KeyPermissions,
  resource: KeyResource,
  action: KeyAction,
): KeyPermissions {
  const granted = value[resource] ?? []
  const next = granted.includes(action) ? granted.filter((a) => a !== action) : [...granted, action]
  return normalisePermissions(level, { ...value, [resource]: next })
}

export function countGrants(level: KeyLevel, value: KeyPermissions): number {
  return Object.values(normalisePermissions(level, value)).reduce(
    (sum, actions) => sum + actions.length,
    0,
  )
}

/**
 * Grants `value` holds that `level` does not offer ("workflows: deploy" on
 * an organization key). A key with any is refused.
 */
export function grantsOutsideLevel(level: KeyLevel, value: KeyPermissions): string[] {
  const offered = new Map(KEY_CATALOG[level].map((r) => [r.id, r.actions]))
  return Object.entries(value).flatMap(([resource, actions]) =>
    (actions ?? [])
      .filter((action) => !offered.get(resource as KeyResource)?.includes(action))
      .map((action) => `${resource}: ${action}`),
  )
}

/** Whether a key at `level` holding `permissions` may take `action` on `resource`: the API's check. */
export function keyMay(
  level: KeyLevel,
  permissions: KeyPermissions,
  resource: KeyResource,
  action: KeyAction,
): boolean {
  const offered = KEY_CATALOG[level].find((r) => r.id === resource)
  if (!offered || !offered.actions.includes(action)) return false
  return hasGrant(permissions, resource, action)
}

/** Whether `resource` is offered at `level` at all: a refusal names the level when not. */
export function resourceAtLevel(level: KeyLevel, resource: KeyResource): boolean {
  return KEY_CATALOG[level].some((r) => r.id === resource)
}

/** A key's level from its row: an organization key carries the organization, a workspace key its workspace. */
export function keyLevelOf(row: {
  organizationId: string | null
  workspaceId: string | null
}): KeyLevel {
  if (row.organizationId) return 'organization'
  return row.workspaceId ? 'workspace' : 'project'
}

const RESOURCES = new Set<string>([
  'projects',
  'members',
  'connections',
  'resources',
  'workspaces',
  'workflows',
  'runs',
  'variables',
  'audit',
])
const ACTIONS = new Set<string>(KEY_ACTIONS)

/**
 * A stored grid read back: a JSON string or an object of resource →
 * actions. Null when it is not that shape — an unknown resource or action,
 * a non-array — so a tampered or stale row grants nothing.
 */
export function parseKeyPermissions(value: unknown): KeyPermissions | null {
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const permissions: KeyPermissions = {}
  for (const [resource, actions] of Object.entries(parsed as Record<string, unknown>)) {
    if (!RESOURCES.has(resource) || !Array.isArray(actions)) return null
    if (!actions.every((a) => typeof a === 'string' && ACTIONS.has(a))) return null
    permissions[resource as KeyResource] = actions as KeyAction[]
  }
  return permissions
}

/**
 * The coarse scopes a grid amounts to — `read` always, `write` for any
 * write or delete, `deploy` for any deploy or run — for the `scopes` column
 * older keys were checked by, kept filled until the Phase-2 cleanup drops it.
 */
export function keyScopesOf(
  level: KeyLevel,
  value: KeyPermissions,
): ('read' | 'write' | 'deploy')[] {
  const actions = new Set(Object.values(normalisePermissions(level, value)).flat())
  const scopes: ('read' | 'write' | 'deploy')[] = ['read']
  if (actions.has('write') || actions.has('delete')) scopes.push('write')
  if (actions.has('deploy') || actions.has('run')) scopes.push('deploy')
  return scopes
}
