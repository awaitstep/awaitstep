import type { WorkspaceRef } from './items'
import type { LevelSlugs } from './scope'

// Dashboard types for multi-scope ("bundle") API keys. The level, resources,
// actions and presets are @awaitstep/ir's (the catalog the API checks keys
// against). One key reaches a SET of scopes; each scope carries its own
// revoked state, so a page shows which slices are live.

import type { KeyLevel, KeyPermissions } from '@awaitstep/ir'

export type { KeyAction, KeyLevel, KeyPermissions, KeyPreset, KeyResource } from '@awaitstep/ir'

/** One project a project-level key reaches, with whether that slice is revoked. */
export interface KeyProjectScope {
  id: string
  name: string | null
  slug: string | null
  revokedAt: string | null
}

/** One workspace a workspace-level key reaches, with whether that slice is revoked. */
export interface KeyWorkspaceScope {
  workspace: WorkspaceRef
  revokedAt: string | null
}

/** A key as the keys pages list it. The secret itself is shown once, at creation. */
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
  /** The projects a project-level key reaches; empty at the other levels. */
  projects: KeyProjectScope[]
  /** The workspaces a workspace-level key reaches; empty at the other levels. */
  workspaces: KeyWorkspaceScope[]
}

/** A keys page split into the keys that live here and the ones reaching in from elsewhere. */
export interface ScopedKeys {
  own: ApiKey[]
  reaching: ApiKey[]
}

/** Project settings → API keys: the project's keys (own + reaching) and a count per workspace. */
export interface ProjectKeys extends ScopedKeys {
  workspaceKeys: { workspace: WorkspaceRef; count: number }[]
}

/** Workspace settings → API keys: the workspace's own keys and the keys reaching it. */
export type WorkspaceKeys = ScopedKeys

export type KeyExpiry = '30' | '90' | '365' | 'never'

/**
 * Create an API key: where it reaches, for how long, and what it may do. At the
 * organization a project-level key may name several `projectIds`; at a project
 * a workspace-level key may name several `workspaceIds`; otherwise the set is
 * the one addressed place.
 */
export interface NewKeyInput extends LevelSlugs {
  name: string
  expires: KeyExpiry
  permissions: KeyPermissions
  /** A project-level key's projects, when minted at the organization. */
  projectIds?: string[]
  /** A workspace-level key's workspaces, when minted at a project. */
  workspaceIds?: string[]
}

/** A created key: its record, and the secret, shown this once and never stored. */
export interface CreatedKey {
  key: ApiKey
  secret: string
}
