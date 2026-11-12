import type { GrantRows } from './types.js'

export type LibraryKind = 'module' | 'node'

export interface LibraryItem {
  id: string
  projectId: string
  /** Null when the project itself owns the item. */
  workspaceId: string | null
  kind: LibraryKind
  slug: string
  name: string
  description: string
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface LibraryOwner {
  kind: 'workspace' | 'project'
  id: string
  name: string
}

/** An item the caller may open, with their rows at its owner and its latest version. */
export interface LibraryItemAccess extends GrantRows {
  item: LibraryItem
  organizationId: string
  owner: LibraryOwner
  latestVersion: string | null
  /** The latest version's publish order (0: none): what a publish must still find to land. */
  latestSeq: number
}

export interface CreateLibraryItemData {
  id: string
  projectId: string
  workspaceId: string | null
  kind: LibraryKind
  slug: string
  name: string
  description: string
  createdBy: string | null
  files: UpsertLibraryFileData[]
  /** The module slugs its files import (a duplicate's copied code): its usage rows, written with it. */
  usageSlugs?: string[]
}

export interface UpdateLibraryItemData {
  name?: string
  description?: string
  slug?: string
}

/** Why an update was refused, when the refusal is about other rows. */
export type LibraryItemUpdateOutcome =
  | { ok: true; item: LibraryItem }
  /** Another item of the same kind and owner already has the slug. */
  | { ok: false; reason: 'slug-taken' }
  /** Something uses the module whose slug would change. */
  | { ok: false; reason: 'in-use'; consumers: LibraryConsumers }
  | { ok: false; reason: 'missing' }

export interface LibraryFile {
  id: string
  itemId: string
  path: string
  source: string
  hash: string
  size: number
  createdAt: string
  updatedAt: string
}

export type LibraryFileSummary = Omit<LibraryFile, 'source'>

export interface UpsertLibraryFileData {
  id: string
  itemId: string
  path: string
  source: string
  hash: string
  /** UTF-8 byte size of `source`. */
  size: number
}

/** A published file, as a version row holds it. */
export interface LibraryVersionFile {
  path: string
  source: string
  hash: string
  size: number
}

/** A published file's metadata, read out of the version row without its source. */
export interface LibraryVersionFileSummary {
  version: string
  path: string
  hash: string
  size: number
  publishedAt: string
}

export interface LibraryVersionListItem {
  version: string
  seq: number
  publishedAt: string
  publishedBy: { id: string; name: string } | null
}

export interface LibraryVersionDetail extends LibraryVersionListItem {
  files: LibraryVersionFile[]
  imports: string[]
}

/** Where a consumer sits, so its imports resolve the way a deploy will. */
export interface LibraryConsumerPlace {
  itemId: string
  projectId: string
  workspaceId: string | null
}

export interface PublishLibraryVersionData {
  id: string
  item: LibraryConsumerPlace
  version: string
  /** The latest version's seq the publish was judged against (0: none yet). */
  expectedSeq: number
  files: LibraryVersionFile[]
  imports: string[]
  publishedBy: string | null
  /** Working-copy changes made in the same unit: a node's published folder leaves it. */
  removePaths: string[]
  /** And files rewritten in it: a module's bumped package.json, conditional on its hash. */
  rewrite: { file: UpsertLibraryFileData; expectedHash: string } | null
  /** The module slugs the working copy and every kept version import, for the usage rows. */
  usageSlugs: string[]
}

export type PublishLibraryVersionOutcome =
  | { ok: true; version: LibraryVersionListItem; pruned: string[] }
  /** A concurrent publish landed first: the version, the order, or the latest it was judged against moved. */
  | { ok: false; reason: 'conflict' }
  /** The file to rewrite changed since it was read. */
  | { ok: false; reason: 'changed' }

export interface RestoreLibraryVersionData {
  item: LibraryConsumerPlace
  /** Removed first: the module's whole working copy, or a node's unpublished folder. */
  removePaths: string[]
  files: UpsertLibraryFileData[]
  usageSlugs: string[]
}

export interface LibraryConsumerWorkflow {
  kind: 'workflow'
  id: string
  name: string
  workspace: { id: string; name: string }
  /** The version of this item the workflow's live deployment bundled, if any. */
  runs: string | null
}

export interface LibraryConsumerItem {
  kind: 'item'
  id: string
  itemKind: LibraryKind
  name: string
  slug: string
  owner: LibraryOwner
}

export interface LibraryConsumers {
  /** The ones the caller may open. */
  visible: (LibraryConsumerWorkflow | LibraryConsumerItem)[]
  /** The ones in places the caller may not open: counted, never named. */
  hiddenCount: number
}

export interface LibraryUses {
  id: string
  kind: LibraryKind
  slug: string
  name: string
  owner: LibraryOwner
}

export interface LibraryUsages {
  /**
   * The modules the item imports. Always ones the caller may open: an item
   * resolves only within its workspace and the project, both of which they can see.
   */
  uses: LibraryUses[]
  usedBy: LibraryConsumers
}

export interface LibrarySummaryRow {
  id: string
  kind: LibraryKind
  slug: string
  name: string
  description: string
  owner: LibraryOwner
  latestVersion: string | null
  publishedAt: string | null
  usedBy: number
  /** The later of the item's own change and its newest file write. */
  updatedAt: string
}

export interface LibraryMarketplaceRow {
  nodeId: string
  name: string
  version: string
}

export interface LibrarySummary {
  own: LibrarySummaryRow[]
  /** The project's own items, which a workspace may use: the workspace view only. */
  fromProject: LibrarySummaryRow[]
  /** The organization's installed marketplace nodes: the project view only. */
  marketplace: LibraryMarketplaceRow[]
  counts: { module: number; node: number; marketplace: number }
}

/** What a library summary is for: one workspace's view, or the project's. */
export type LibrarySummaryScope =
  | { level: 'workspace'; projectId: string; workspaceId: string; organizationId: string }
  | { level: 'project'; projectId: string; organizationId: string }

export interface LibraryVersionImports {
  version: string
  seq: number
  imports: string[]
}

/** A `#modules/<slug>` as a consumer resolves it. */
export interface LibraryResolvedModule {
  slug: string
  itemId: string
  latestVersion: string | null
}

/** One owner's library: a workspace's, or (workspaceId null) the project's own. */
export interface LibraryOwnerScope {
  projectId: string
  workspaceId: string | null
}

/** An item in its owner's tree: the Library IDE's explorer row with its files. */
export interface LibraryOwnerTreeItem {
  id: string
  kind: LibraryKind
  slug: string
  name: string
  latestVersion: string | null
  files: LibraryFileSummary[]
  /** A node's published files (all but the icon); empty for a module. */
  published: LibraryVersionFileSummary[]
}

/** One owner's items with their trees, and (for a workspace) the project's modules it may import. */
export interface LibraryOwnerTree {
  items: LibraryOwnerTreeItem[]
  /** The project's own modules, by slug: empty in the project's own tree. */
  projectModules: { id: string; slug: string; latestVersion: string | null }[]
}

/** What a duplicate copies: the working copy, and the latest version's files. */
export interface LibraryItemSources {
  files: { path: string; source: string }[]
  latest: { version: string; files: { path: string; source: string }[] } | null
}
