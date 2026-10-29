import type { ScopeLevel } from './access.js'

// A variable's name: capital letters, digits and underscores, starting with
// a letter — what a deployed worker reads as `env.NAME` and the only form
// a reference below can point at. The API, the dashboard's dialog and the
// dummy server validate with this one rule.
const ENV_VAR_NAME_SOURCE = '[A-Z][A-Z0-9_]*'

export const ENV_VAR_NAME = new RegExp(`^${ENV_VAR_NAME_SOURCE}$`)

export function isEnvVarName(name: string): boolean {
  return ENV_VAR_NAME.test(name)
}

/** A variable's level from its row: a workspace row carries its workspace, a project row its project, an org-wide row neither. */
export function variableLevelOf(row: {
  projectId: string | null
  workspaceId: string | null
}): ScopeLevel {
  if (row.workspaceId) return 'workspace'
  return row.projectId ? 'project' : 'organization'
}

// A workflow variable whose value names a project variable instead of
// holding one. Exact by design: the form below is what resolution accepts,
// so anything looser would count as a reference in one place and arrive
// somewhere else as a literal string of braces.
const GLOBAL_ENV_REF = new RegExp(`^\\{\\{global\\.env\\.(${ENV_VAR_NAME_SOURCE})\\}\\}$`)

/**
 * The project variable a workflow variable's value refers to, or null when
 * the value is a literal.
 */
export function globalEnvRefName(value: string): string | null {
  return GLOBAL_ENV_REF.exec(value)?.[1] ?? null
}

/**
 * Whether a workflow variable's value is resolved from the project rather
 * than held as written. A reference has no value until the workflow is
 * prepared, so anything reading it before then — an editor, a browser-side
 * test — is holding a placeholder.
 */
export function isGlobalEnvRef(value: string): boolean {
  return globalEnvRefName(value) !== null
}
