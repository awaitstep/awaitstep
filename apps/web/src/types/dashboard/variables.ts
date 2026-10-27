import type { WorkspaceRef } from './items'

// Dashboard types for variables. Web-only until B4 moves them.

/** Where a variable is set: the org, the project, or one workspace. */
export type VariableLevel = 'organization' | 'project' | 'workspace'

/**
 * A variable as a project resolves it: the project's own value wins over the
 * org's. Workspaces that set their own value are listed, not resolved here.
 */
export interface ResolvedVariable {
  name: string
  /** Null for a secret: its value is never sent back. */
  value: string | null
  isSecret: boolean
  setAt: { level: Exclude<VariableLevel, 'workspace'>; name: string }
  overriddenIn: WorkspaceRef[]
}

/** A variable as a workspace resolves it: the closest level wins (workspace › project › org). */
export interface WorkspaceVariable {
  name: string
  /** Null for a secret. */
  value: string | null
  isSecret: boolean
  /** Where the winning value is set. */
  source: { level: VariableLevel; name: string }
  /** The level whose value this one replaces, when it replaces one. */
  overrides: Exclude<VariableLevel, 'workspace'> | null
}
