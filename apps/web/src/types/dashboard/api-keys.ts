import type { WorkspaceRef } from './items'
import type { LevelSlugs } from './scope'

// Dashboard types for scoped API keys. The level, resources, actions and
// presets are @awaitstep/ir's (the catalog the API checks keys against, B3).

import type { KeyLevel, KeyPermissions } from '@awaitstep/ir'

export type { KeyAction, KeyLevel, KeyPermissions, KeyPreset, KeyResource } from '@awaitstep/ir'

/** A key as the keys pages list it. The secret itself is shown once, at creation (P6). */
export interface ApiKey {
  id: string
  level: KeyLevel
  name: string
  /** "ask_Kq3VtR8m…a71d": enough to recognise the key, never enough to use it. */
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
