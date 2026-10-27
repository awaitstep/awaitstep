import type { WorkspaceRef } from './items'
import type { LevelSlugs } from './scope'

// Dashboard types for scoped API keys. Web-only until B3 moves them, with the
// permission catalog, into the package the API checks keys against.

/** What a key reaches: org settings only, a whole project, or one workspace. */
export type KeyLevel = 'organization' | 'project' | 'workspace'

export type KeyAction = 'read' | 'write' | 'delete' | 'deploy' | 'run'

export type KeyResource =
  | 'projects'
  | 'members'
  | 'connections'
  | 'resources'
  | 'audit'
  | 'workspaces'
  | 'workflows'
  | 'runs'
  | 'variables'
  | 'library'

/** The actions a key may take, per resource. A missing resource grants nothing. */
export type KeyPermissions = Partial<Record<KeyResource, KeyAction[]>>

export type KeyPreset = 'read' | 'deploy-run' | 'full'

/** A key as the keys pages list it. The secret itself is shown once, at creation (P6). */
export interface ApiKey {
  id: string
  level: KeyLevel
  name: string
  /** "ask_p1…a71d": enough to recognise the key, never enough to use it. */
  prefix: string
  permissions: KeyPermissions
  createdBy: { id: string; name: string }
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  /** The workspace a workspace key reaches; null at the other levels. */
  workspace: WorkspaceRef | null
}

/** Project settings → API keys: the project's keys, and how many each workspace holds. */
export interface ProjectKeys {
  keys: ApiKey[]
  workspaceKeys: { workspace: WorkspaceRef; count: number }[]
}

/** Workspace settings → API keys: the workspace's own keys, and the project keys that reach it. */
export interface WorkspaceKeys {
  own: ApiKey[]
  inherited: ApiKey[]
}

export type KeyExpiry = '30' | '90' | '365' | 'never'

/** Create an API key: where it reaches, for how long, and what it may do. */
export interface NewKeyInput extends LevelSlugs {
  name: string
  expires: KeyExpiry
  permissions: KeyPermissions
}

/** A created key: its record, and the secret, shown this once and never stored. */
export interface CreatedKey {
  key: ApiKey
  secret: string
}
