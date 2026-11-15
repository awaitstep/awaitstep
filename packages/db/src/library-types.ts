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
  /** The project's name: the owner a move or a copy to the project names. */
  projectName: string
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

/** Moving a workspace's item to its project's library. */
export type LibraryMoveOutcome =
  | { ok: true; item: LibraryItem }
  /** The project already has an item of this kind and slug. */
  | { ok: false; reason: 'slug-taken' }
  /** The project's library holds as many items as it may. */
  | { ok: false; reason: 'full' }
  /** It imports modules the project's library has none of: a project item could not reach them. */
  | { ok: false; reason: 'unresolved'; slugs: string[] }
  /** Gone, or no longer in the workspace the caller was judged on. */
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
  /** A node's icon.svg content hash, for its image URL; null without one (and for a module). */
  iconHash: string | null
}

export interface LibraryMarketplaceRow {
  nodeId: string
  name: string
  version: string
  /** The node's logo URL from its definition, or null. */
  icon: string | null
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
  /** When it was last saved: the item's own change or its newest file write, as ISO text. */
  savedAt: string
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

/** What a workflow's bundle starts from: where it sits, what its code imports and the custom nodes it places. */
export interface LibraryBundleRoots {
  projectId: string
  workspaceId: string | null
  /** `#modules/<slug>` slugs the workflow's own code imports. */
  slugs: string[]
  /** Item ids of the `custom:<itemId>` nodes on its canvas. */
  nodeItemIds: string[]
  /**
   * Whose items an import may reach. A deploy reaches the workspace's and
   * the project's (the default); a workspace-level key reads its own
   * workspace's items only, so for it the project's never resolve.
   */
  reach?: WorkflowCustomNodeReach
}

/** An item a bundle reaches, at its latest published version (null: never published). */
export interface LibraryBundleItem {
  id: string
  kind: LibraryKind
  slug: string
  name: string
  /** Null for the project's own item. */
  workspaceId: string | null
  version: string | null
  /** The version's files, relative to it; empty without a version. */
  files: LibraryVersionFile[]
  /** The module slugs that version imports. */
  imports: string[]
  /** Who reached it: another item's id, or null for the workflow itself. */
  importers: (string | null)[]
}

/** How much one bundle may reach: items, and the files of their versions in total. */
export interface LibraryBundleLimits {
  items: number
  /** Characters of the versions' stored file JSON, summed. */
  bytes: number
  files: number
}

export interface LibraryBundle {
  items: LibraryBundleItem[]
  /** More items were reachable than the cap allows. */
  truncated: boolean
  /** The items' files together pass a limit; every item then comes back without its files. */
  oversize: boolean
}

/**
 * A published custom node in a workflow's reach, for its palette: the
 * latest version's `node.json` and icon as stored (the caller validates
 * the manifest), never its other files.
 */
export interface WorkflowCustomNode {
  itemId: string
  /** The workflow's workspace owns it, or the project does. */
  owner: 'workspace' | 'project'
  version: string
  manifest: string | null
  icon: string | null
}

/** A published custom node's template, for the code preview, with what it is checked by. */
export interface WorkflowCustomNodeTemplate {
  itemId: string
  version: string
  manifest: string | null
  template: string | null
}

/**
 * Whose nodes a caller reaches from a workflow: its workspace's and the
 * project's (a member, a project key), or its workspace's only (a workspace key).
 */
export type WorkflowCustomNodeReach = 'workspace-and-project' | 'workspace-only'

/** One library version a deployment bundled. */
export interface DeploymentLibraryVersion {
  itemId: string
  slug: string
  version: string
}

/** A workflow as a library consumer: what it uses (where it sits is read from its row). */
export interface WorkflowLibraryUses {
  workflowId: string
  slugs: string[]
  nodeItemIds: string[]
}
