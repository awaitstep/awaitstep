import type { ScopeLevel } from '@awaitstep/ir'
import type { WorkspaceRef } from './items'
import type { LevelSlugs } from './scope'

// Dashboard types for variables: what the pages render, mapped from the
// API's rows (`data/dashboard/api/variables.ts`) or served by the dummy.

/** Where a variable is set: the org, the project, or one workspace. */
export type VariableLevel = ScopeLevel

/** A workspace (on a project's variable) or project (on an org's) a variable can reach. */
export interface ReachPlace {
  id: string
  slug: string
  name: string
}

/**
 * Where a project's or org's variable applies: every workspace/project, or
 * the listed ones. `blocked` holds the places that set their own value of the
 * name, which it can never reach.
 */
export interface VariableReach {
  all: boolean
  places: ReachPlace[]
  blocked: string[]
}

/** What a save asks for: everywhere, or these places (only ever widening). */
export type VariableReachInput = { all: true } | { ids: string[] }

/**
 * A variable as a project resolves it: the project's own value wins over the
 * org's. Workspaces that set their own value are listed, not resolved here.
 */
export interface ResolvedVariable {
  /** The winning row's id: what Edit and Delete address. */
  id: string
  name: string
  /** Null for a secret: its value is never sent back. */
  value: string | null
  isSecret: boolean
  setAt: { level: Exclude<VariableLevel, 'workspace'>; name: string }
  overriddenIn: WorkspaceRef[]
  /** Where the project's own value applies; null on an inherited org value. */
  reach: VariableReach | null
}

/** A variable as a workspace resolves it: the closest level wins (workspace › project › org). */
export interface WorkspaceVariable {
  id: string
  name: string
  /** Null for a secret. */
  value: string | null
  isSecret: boolean
  /** Where the winning value is set. */
  source: { level: VariableLevel; name: string }
  /** The level whose value this one replaces, when it replaces one. */
  overrides: Exclude<VariableLevel, 'workspace'> | null
}

/** A variable the org sets (Resources → Variables): it reaches every project that doesn't set its own. */
export interface OrgVariable {
  id: string
  name: string
  /** Null for a secret. */
  value: string | null
  isSecret: boolean
  /** Projects the viewer can open that set their own value, here or in a workspace. */
  overriddenIn: number
  /** Which projects it reaches. */
  reach: VariableReach
}

/** Where a variable is set, by slug. */
export type VariableScope = LevelSlugs

/** New variable, Edit, or Override. */
export interface VariableInput {
  scope: VariableScope
  name: string
  /** Empty on an edit of a secret keeps its value. */
  value: string
  isSecret: boolean
  /** `create` refuses a name already set at that scope; `edit` needs it to exist there. */
  mode: 'create' | 'edit'
  /** The row an edit addresses on the API; the dummy addresses by scope and name. */
  id?: string
  /** On an edit: whether the stored value is a secret, which an empty value keeps. */
  wasSecret?: boolean
  /** Where a project's or org's variable applies; left out at a workspace and when unchanged. */
  reach?: VariableReachInput
}
