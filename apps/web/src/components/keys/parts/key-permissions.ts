import {
  KEY_CATALOG as CATALOG,
  normalisePermissions,
  countGrants,
  type KeyAction,
  type KeyLevel,
  type KeyPermissions,
  type KeyPreset,
  type KeyResource,
} from '@awaitstep/ir'

// The permission grid's words. The catalog itself — which cells each level
// offers, the presets and the rules — lives in @awaitstep/ir, where the API
// checks keys against it (B3, D-B3-2); this file adds the labels and hints
// the grid shows and re-exports the rest.

export {
  KEY_ACTIONS,
  KEY_PRESETS,
  countGrants,
  grantsOutsideLevel,
  hasGrant,
  matchPreset,
  presetPermissions,
  toggleGrant,
} from '@awaitstep/ir'

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

const RESOURCE_LABEL: Record<KeyResource, string> = {
  projects: 'Projects',
  members: 'Members',
  connections: 'Connections',
  resources: 'Resources',
  workspaces: 'Workspaces',
  workflows: 'Workflows & functions',
  runs: 'Runs',
  variables: 'Variables',
  library: 'Library',
  audit: 'Audit log',
}

const RESOURCE_HINT: Record<KeyLevel, Partial<Record<KeyResource, string>>> = {
  organization: {
    projects: 'Create, rename, delete projects',
    members: 'Who is in the organization',
    connections: 'Cloudflare accounts',
    resources: 'Org nodes and variables',
    audit: 'Who changed what, read only',
  },
  project: {
    workspaces: 'Create, rename, delete',
    workflows: 'In every workspace',
    runs: 'History and logs',
    variables: 'Project values',
    library: 'Modules and custom nodes',
    members: 'Project and workspace access',
  },
  workspace: {
    workflows: 'In this workspace only',
    runs: 'History and logs',
    variables: 'This workspace’s own values',
    library: 'This workspace’s modules and nodes',
  },
}

function withWords(level: KeyLevel): readonly CatalogResource[] {
  return CATALOG[level].map((resource) => ({
    id: resource.id,
    label: RESOURCE_LABEL[resource.id],
    hint: RESOURCE_HINT[level][resource.id] ?? '',
    actions: resource.actions,
  }))
}

/** The catalog with the grid's words: one row per resource the level offers. */
export const KEY_CATALOG: Record<KeyLevel, readonly CatalogResource[]> = {
  organization: withWords('organization'),
  project: withWords('project'),
  workspace: withWords('workspace'),
}

export const KEY_PRESET_LABEL: Record<KeyPreset, string> = {
  read: 'Read only',
  'deploy-run': 'Deploy & run',
  full: 'Full access',
}

/** "4 permissions selected", for the dialog's footer. */
export function describeGrantCount(level: KeyLevel, value: KeyPermissions): string {
  const count = countGrants(level, value)
  return `${count} ${count === 1 ? 'permission' : 'permissions'} selected`
}

/** One line per resource: "Workflows & functions: read · deploy · run". */
export function describeGrants(level: KeyLevel, value: KeyPermissions): string[] {
  const normalised = normalisePermissions(level, value)
  return KEY_CATALOG[level].flatMap((resource) => {
    const actions = normalised[resource.id]
    return actions ? [`${resource.label}: ${actions.join(' · ')}`] : []
  })
}

interface ReachNames {
  project: string
  workspace: string
}

/** The sentence under the grid saying what a key at `level` can and can’t do. */
export function describeReach(level: KeyLevel, names: ReachNames): string {
  switch (level) {
    case 'organization':
      return 'Organization keys can never read, change, deploy or run workflows, even with Full access.'
    case 'project':
      return `Works in every workspace in ${names.project}, including ones created later. For one team only, pick One workspace.`
    case 'workspace':
      return `Only ${names.workspace}. Shared workflows from other workspaces can be called but not changed.`
  }
}
