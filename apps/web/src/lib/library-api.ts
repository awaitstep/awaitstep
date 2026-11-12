import type { Allowed, ValidationError } from '@awaitstep/ir'
import {
  encodeProjectPath,
  projectFileRequest,
  request,
  type ProjectFileSummary,
  type WritePrecondition,
} from './api-client'
import { apiPath, pathSegment } from './api-path'

// The Library's calls (`docs/api-reference.md` § Library). A page addresses
// its place by slugs, as the workflow lists do; an item by its own id.

export type LibraryKind = 'module' | 'node'

/** Where the Library is opened: a workspace's, or (no workspace) the project's own. */
export interface LibraryPlace {
  org: string
  project: string
  workspace?: string
}

export interface ApiLibraryOwner {
  kind: 'workspace' | 'project'
  id: string
  name: string
}

export interface ApiLibraryRow {
  id: string
  kind: LibraryKind
  slug: string
  name: string
  description: string
  owner: ApiLibraryOwner
  latestVersion: string | null
  publishedAt: string | null
  usedBy: number
  updatedAt: string
}

export interface ApiLibrarySummary {
  own: ApiLibraryRow[]
  fromProject: ApiLibraryRow[]
  marketplace: { nodeId: string; name: string; version: string }[]
  counts: { module: number; node: number; marketplace: number }
  viewerCan: { create: Allowed }
}

export interface ApiLibraryItem {
  id: string
  kind: LibraryKind
  slug: string
  name: string
  description: string
  owner: ApiLibraryOwner
  latestVersion: string | null
  importPath: string | null
  nodeType: string | null
  viewerCan: { edit: Allowed }
  createdAt: string
  updatedAt: string
}

export interface ApiLibraryTreeFile {
  path: string
  /** The file's content hash: its text is cached by it. */
  hash: string
  /** A published node folder's file: it never changes. */
  readOnly: boolean
}

export interface ApiLibraryTreeItem {
  id: string
  kind: LibraryKind
  slug: string
  name: string
  latestVersion: string | null
  files: ApiLibraryTreeFile[]
}

export interface ApiLibraryTree {
  owner: { kind: 'workspace' | 'project'; id: string }
  viewerCan: { edit: Allowed; create: Allowed }
  items: ApiLibraryTreeItem[]
  /** The project's modules, by slug, in a workspace's tree: what `#modules/<slug>` means when the workspace owns none. */
  projectModules: { id: string; slug: string; latestVersion: string | null }[]
}

export interface ApiLibraryFile extends ProjectFileSummary {
  source: string
  readOnly: boolean
}

export interface ApiLibraryCheck {
  version: string | null
  bumpedFrom: string | null
  problems: ValidationError[]
}

export interface ApiLibraryPublished {
  version: string
  seq: number
  publishedAt: string
  bumpedFrom: string | null
  pruned: string[]
}

export interface ApiLibraryVersion {
  version: string
  seq: number
  publishedAt: string
  publishedBy: { id: string; name: string } | null
}

export interface ApiLibraryVersionDetail extends ApiLibraryVersion {
  files: { path: string; source: string; hash: string; size: number }[]
  imports: string[]
}

export interface ApiLibraryConsumerWorkflow {
  kind: 'workflow'
  id: string
  name: string
  workspace: { id: string; name: string }
  runs: string | null
}

export interface ApiLibraryConsumerItem {
  kind: 'item'
  id: string
  itemKind: LibraryKind
  name: string
  slug: string
  owner: ApiLibraryOwner
}

export interface ApiLibraryConsumers {
  visible: (ApiLibraryConsumerWorkflow | ApiLibraryConsumerItem)[]
  hiddenCount: number
}

export interface ApiLibraryUsages {
  uses: { id: string; kind: LibraryKind; slug: string; name: string; owner: ApiLibraryOwner }[]
  usedBy: ApiLibraryConsumers
}

function placeQuery(place: LibraryPlace): string {
  const search = new URLSearchParams({ org: place.org, project: place.project })
  if (place.workspace) search.set('workspace', place.workspace)
  return `?${search.toString()}`
}

function itemPath(id: string): string {
  return `/library/items/${pathSegment(id)}`
}

export const libraryApi = {
  getSummary(place: LibraryPlace): Promise<ApiLibrarySummary> {
    return request(apiPath`/library/summary` + placeQuery(place))
  },

  getTree(place: LibraryPlace): Promise<ApiLibraryTree> {
    return request(apiPath`/library/tree` + placeQuery(place))
  },

  createItem(
    place: LibraryPlace,
    data: { kind: LibraryKind; name: string; slug?: string; description?: string },
  ): Promise<ApiLibraryItem> {
    return request(apiPath`/library/items` + placeQuery(place), {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  getItem(id: string): Promise<ApiLibraryItem> {
    return request(itemPath(id))
  },

  updateItem(
    id: string,
    changes: { name?: string; description?: string; slug?: string },
  ): Promise<ApiLibraryItem> {
    return request(itemPath(id), { method: 'PATCH', body: JSON.stringify(changes) })
  },

  duplicateItem(id: string, data: { name: string; slug?: string }): Promise<ApiLibraryItem> {
    return request(`${itemPath(id)}/duplicate`, { method: 'POST', body: JSON.stringify(data) })
  },

  deleteItem(id: string): Promise<void> {
    return projectFileRequest(itemPath(id), { method: 'DELETE' })
  },

  getFile(id: string, path: string): Promise<ApiLibraryFile> {
    return request(`${itemPath(id)}/files/${encodeProjectPath(path)}`)
  },

  /** Creates or replaces a working-copy file; a refused precondition throws `ProjectFileConflictError`. */
  putFile(
    id: string,
    path: string,
    source: string,
    precondition: WritePrecondition,
  ): Promise<ProjectFileSummary> {
    const header: Record<string, string> =
      'ifMatch' in precondition
        ? { 'If-Match': `"${precondition.ifMatch}"` }
        : { 'If-None-Match': '*' }
    return projectFileRequest(`${itemPath(id)}/files/${encodeProjectPath(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...header },
      body: JSON.stringify({ source }),
    })
  },

  deleteFile(id: string, path: string, ifMatch: string): Promise<void> {
    return projectFileRequest(`${itemPath(id)}/files/${encodeProjectPath(path)}`, {
      method: 'DELETE',
      headers: { 'If-Match': `"${ifMatch}"` },
    })
  },

  check(id: string): Promise<ApiLibraryCheck> {
    return request(`${itemPath(id)}/check`, { method: 'POST' })
  },

  publish(id: string): Promise<ApiLibraryPublished> {
    return request(`${itemPath(id)}/versions`, { method: 'POST' })
  },

  listVersions(id: string): Promise<{ versions: ApiLibraryVersion[] }> {
    return request(`${itemPath(id)}/versions`)
  },

  getVersion(id: string, version: string): Promise<ApiLibraryVersionDetail> {
    return request(`${itemPath(id)}/versions/${pathSegment(version)}`)
  },

  restore(id: string, version: string): Promise<{ restoredFrom: string; version: string }> {
    return request(`${itemPath(id)}/versions/${pathSegment(version)}/restore`, { method: 'POST' })
  },

  getUsages(id: string): Promise<ApiLibraryUsages> {
    return request(`${itemPath(id)}/usages`)
  },
}
