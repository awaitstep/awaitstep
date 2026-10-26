import type {
  KeyAction,
  KeyLevel,
  KeyPermissions,
  KeyPreset,
  KeyResource,
} from '../../../types/dashboard/api-keys'

// The permissions a key can be given at each level. This is B3's spec: the
// API has to back every cell offered here, and B3 moves the catalog into the
// package it checks keys against.

export const KEY_ACTIONS: readonly KeyAction[] = ['read', 'write', 'delete', 'deploy', 'run']

export const KEY_ACTION_LABEL: Record<KeyAction, string> = {
  read: 'Read',
  write: 'Write',
  delete: 'Delete',
  deploy: 'Deploy',
  run: 'Run',
}

export interface CatalogResource {
  id: KeyResource
  label: string
  hint: string
  /** Valid actions, in `KEY_ACTIONS` order. */
  actions: readonly KeyAction[]
}

const READ_WRITE_DELETE = ['read', 'write', 'delete'] as const

export const KEY_CATALOG: Record<KeyLevel, readonly CatalogResource[]> = {
  organization: [
    {
      id: 'projects',
      label: 'Projects',
      hint: 'Create, rename, delete projects',
      actions: READ_WRITE_DELETE,
    },
    {
      id: 'members',
      label: 'Members',
      hint: 'Invite and remove people',
      actions: READ_WRITE_DELETE,
    },
    {
      id: 'connections',
      label: 'Connections',
      hint: 'Cloudflare accounts',
      actions: READ_WRITE_DELETE,
    },
    {
      id: 'resources',
      label: 'Resources',
      hint: 'Org nodes and variables',
      actions: READ_WRITE_DELETE,
    },
    { id: 'audit', label: 'Audit log', hint: 'Who changed what', actions: ['read'] },
  ],
  project: [
    {
      id: 'workspaces',
      label: 'Workspaces',
      hint: 'Create, rename, delete',
      actions: READ_WRITE_DELETE,
    },
    {
      id: 'workflows',
      label: 'Workflows & functions',
      hint: 'In every workspace',
      actions: KEY_ACTIONS,
    },
    { id: 'runs', label: 'Runs', hint: 'History and logs', actions: ['read', 'delete'] },
    {
      id: 'variables',
      label: 'Variables',
      hint: 'Project and workspace values',
      actions: READ_WRITE_DELETE,
    },
    {
      id: 'library',
      label: 'Shared library',
      hint: 'Modules and resources',
      actions: READ_WRITE_DELETE,
    },
    {
      id: 'members',
      label: 'Members',
      hint: 'Project and workspace access',
      actions: READ_WRITE_DELETE,
    },
  ],
  workspace: [
    {
      id: 'workflows',
      label: 'Workflows & functions',
      hint: 'In this workspace only',
      actions: KEY_ACTIONS,
    },
    { id: 'runs', label: 'Runs', hint: 'History and logs', actions: ['read', 'delete'] },
    {
      id: 'variables',
      label: 'Variables',
      hint: 'This workspace’s values',
      actions: READ_WRITE_DELETE,
    },
    {
      id: 'library',
      label: 'Library',
      hint: 'This workspace’s modules and resources',
      actions: READ_WRITE_DELETE,
    },
  ],
}

/** Organization keys never touch workflows, so "Deploy & run" isn't offered there. */
export const KEY_PRESETS: Record<KeyLevel, readonly KeyPreset[]> = {
  organization: ['read', 'full'],
  project: ['read', 'deploy-run', 'full'],
  workspace: ['read', 'deploy-run', 'full'],
}

export const KEY_PRESET_LABEL: Record<KeyPreset, string> = {
  read: 'Read only',
  'deploy-run': 'Deploy & run',
  full: 'Full access',
}

function presetGrants(preset: KeyPreset, resource: CatalogResource, action: KeyAction): boolean {
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
function normalise(level: KeyLevel, value: KeyPermissions): KeyPermissions {
  const permissions: KeyPermissions = {}
  for (const resource of KEY_CATALOG[level]) {
    const granted = value[resource.id] ?? []
    const actions = resource.actions.filter((action) => granted.includes(action))
    if (actions.length > 0) permissions[resource.id] = actions
  }
  return permissions
}

function samePermissions(level: KeyLevel, a: KeyPermissions, b: KeyPermissions): boolean {
  return JSON.stringify(normalise(level, a)) === JSON.stringify(normalise(level, b))
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
  return normalise(level, { ...value, [resource]: next })
}

export function countGrants(level: KeyLevel, value: KeyPermissions): number {
  return Object.values(normalise(level, value)).reduce((sum, actions) => sum + actions.length, 0)
}

/** "4 permissions selected", for the dialog's footer. */
export function describeGrantCount(level: KeyLevel, value: KeyPermissions): string {
  const count = countGrants(level, value)
  return `${count} ${count === 1 ? 'permission' : 'permissions'} selected`
}

/** One line per resource: "Workflows & functions: read · deploy · run". */
export function describeGrants(level: KeyLevel, value: KeyPermissions): string[] {
  const normalised = normalise(level, value)
  return KEY_CATALOG[level].flatMap((resource) => {
    const actions = normalised[resource.id]
    return actions ? [`${resource.label}: ${actions.join(' · ')}`] : []
  })
}

interface ReachNames {
  project: string
  workspace: string
}

/** The sentence under the grid saying what a key at `level` can and can't reach. */
export function describeReach(level: KeyLevel, names: ReachNames): string {
  switch (level) {
    case 'organization':
      return 'Organization keys can never read, change, deploy or run workflows, even with Full access.'
    case 'project':
      return `Reaches every workspace in ${names.project}, including ones created later. For one team only, pick One workspace.`
    case 'workspace':
      return `Only ${names.workspace}. Shared workflows from other workspaces can be called but not changed.`
  }
}
