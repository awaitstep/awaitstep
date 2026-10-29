import type {
  ApiKeyPage,
  ApiKeyRow,
  ApiProjectKeys,
  ApiWorkspaceKeys,
} from '../../../lib/dashboard-api'
import type {
  ApiKey,
  CreatedKey,
  KeyExpiry,
  NewKeyInput,
  ProjectKeys,
  WorkspaceKeys,
} from '../../../types/dashboard/api-keys'
import type { WorkspaceColour } from '@awaitstep/ir'

// API key rows → the records the keys pages render: the "ask_xxxxxxxx…a71d"
// display from the stored prefix and suffix, the creator as a person ref,
// the workspace as a chip. The API already resolved the level and the grid.

const EXPIRY_DAYS: Record<KeyExpiry, number | null> = {
  '30': 30,
  '90': 90,
  '365': 365,
  never: null,
}

/**
 * Every page of a level's key list, as one: the keys pages draw the whole
 * list and have no pager, so a page size is not a cap. The first page's
 * other fields (the per-workspace counts) are kept.
 */
export async function allKeyPages<T extends ApiKeyPage>(
  fetchPage: (cursor?: string) => Promise<T>,
): Promise<T> {
  const first = await fetchPage()
  const data = [...first.data]
  let cursor = first.nextCursor
  while (cursor) {
    const page = await fetchPage(cursor)
    data.push(...page.data)
    cursor = page.nextCursor
  }
  return { ...first, data, nextCursor: null }
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
    workspace: row.workspace
      ? { ...row.workspace, colour: row.workspace.colour as WorkspaceColour }
      : null,
  }
}

export function toProjectKeys(res: ApiProjectKeys): ProjectKeys {
  return {
    keys: res.data.map(toApiKey),
    workspaceKeys: res.workspaceCounts.map(({ workspace, count }) => ({
      workspace: { ...workspace, colour: workspace.colour as WorkspaceColour },
      count,
    })),
  }
}

export function toWorkspaceKeys(res: ApiWorkspaceKeys): WorkspaceKeys {
  return { own: res.own.map(toApiKey), inherited: res.inherited.map(toApiKey) }
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

/** The level's address and body for `POST /api-keys`, from the dialog's input. */
export function toCreateKeyRequest(org: string, input: NewKeyInput) {
  return {
    slugs: {
      org,
      project: input.level === 'organization' ? undefined : input.project,
      workspace: input.level === 'workspace' ? input.workspace : undefined,
    },
    body: {
      name: input.name.trim(),
      level: input.level,
      permissions: input.permissions,
      expiresAt: expiresAtOf(input.expires),
    },
  }
}
