import type {
  ApiKeyRow,
  ApiProjectKeys,
  ApiWorkspaceKeys,
  KeySlugs,
} from '../../../lib/dashboard-api'
import type {
  ApiKey,
  CreatedKey,
  KeyExpiry,
  NewKeyInput,
  ProjectKeys,
  WorkspaceKeys,
} from '../../../types/dashboard/api-keys'
import type { KeyLevel, KeyPermissions, WorkspaceColour } from '@awaitstep/ir'

// API key rows → the records the keys pages render: the "ask_xxxxxxxx…a71d"
// display from the stored prefix and suffix, the creator as a person ref, and
// the scope set (projects or workspaces) each with its own revoked state.

const EXPIRY_DAYS: Record<KeyExpiry, number | null> = {
  '30': 30,
  '90': 90,
  '365': 365,
  never: null,
}

export function toApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    level: row.level,
    name: row.name,
    prefix: row.keySuffix ? `${row.keyPrefix}…${row.keySuffix}` : `${row.keyPrefix}…`,
    permissions: row.permissions,
    createdBy: { id: row.createdBy, name: row.createdByName ?? '' },
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    projects: row.projects.map((p) => ({
      id: p.projectId,
      name: p.projectName,
      slug: p.projectSlug,
      revokedAt: p.revokedAt,
    })),
    workspaces: row.workspaces.map((w) => ({
      workspace: { ...w.workspace, colour: w.workspace.colour as WorkspaceColour },
      revokedAt: w.revokedAt,
    })),
  }
}

export function toProjectKeys(res: ApiProjectKeys): ProjectKeys {
  return {
    own: res.own.map(toApiKey),
    reaching: res.reaching.map(toApiKey),
    workspaceKeys: res.workspaceCounts.map(({ workspace, count }) => ({
      workspace: { ...workspace, colour: workspace.colour as WorkspaceColour },
      count,
    })),
  }
}

export function toWorkspaceKeys(res: ApiWorkspaceKeys): WorkspaceKeys {
  return { own: res.own.map(toApiKey), reaching: res.reaching.map(toApiKey) }
}

export function toCreatedKey(res: ApiKeyRow & { key: string }): CreatedKey {
  const { key, ...row } = res
  return { key: toApiKey(row), secret: key }
}

/** The dialog's "Expires" choice as the instant the API stores, from `now`. */
export function expiresAtOf(expires: KeyExpiry, now = new Date()): string | null {
  const days = EXPIRY_DAYS[expires]
  return days === null ? null : new Date(now.getTime() + days * 86_400_000).toISOString()
}

/**
 * The address and body for `POST /api-keys`, from the dialog's input. The
 * address (`project`/`workspace` slugs) is the key's home; the body carries
 * its level and, for a multi-scope key, the picked `projectIds`/`workspaceIds`.
 */
export function toCreateKeyRequest(
  org: string,
  input: NewKeyInput,
): {
  slugs: KeySlugs
  body: {
    name: string
    level: KeyLevel
    permissions: KeyPermissions
    expiresAt: string | null
    projectIds?: string[]
    workspaceIds?: string[]
  }
} {
  return {
    slugs: { org, project: input.project, workspace: input.workspace },
    body: {
      name: input.name.trim(),
      level: input.level,
      permissions: input.permissions,
      expiresAt: expiresAtOf(input.expires),
      ...(input.projectIds ? { projectIds: input.projectIds } : {}),
      ...(input.workspaceIds ? { workspaceIds: input.workspaceIds } : {}),
    },
  }
}
