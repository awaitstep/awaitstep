import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core'
import { projects } from './projects.js'
import { workspaces } from './workspaces.js'
import { workflows } from './workflows.js'
import { deployments } from './deployments.js'

// The Library: reusable modules and custom nodes, owned by a workspace (usable
// only there) or, workspace_id null, by the project (usable in all its workspaces).
export const libraryItems = sqliteTable(
  'library_items',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['module', 'node'] }).notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_library_items_project').on(table.projectId),
    // One slug per kind per owner; a project item's owner is the project ('').
    uniqueIndex('idx_library_items_slug').on(
      table.projectId,
      sql`coalesce(${table.workspaceId}, '')`,
      table.kind,
      table.slug,
    ),
  ],
)

/** The working copy: what Save writes and no consumer ever sees. */
export const libraryItemFiles = sqliteTable(
  'library_item_files',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => libraryItems.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    source: text('source').notNull(),
    hash: text('hash').notNull(),
    size: integer('size').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('idx_library_item_files_path').on(table.itemId, table.path)],
)

/** A published version: immutable, at most three kept per item. */
export const libraryVersions = sqliteTable(
  'library_versions',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => libraryItems.id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    // Publish order; the version text rises with it.
    seq: integer('seq').notNull(),
    // JSON [{ path, source, hash, size }], paths relative to the version.
    files: text('files').notNull(),
    // JSON array of the module slugs the version imports.
    imports: text('imports').notNull().default('[]'),
    publishedBy: text('published_by'),
    publishedAt: text('published_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_library_versions_version').on(table.itemId, table.version),
    uniqueIndex('idx_library_versions_seq').on(table.itemId, table.seq),
  ],
)

/**
 * What a consumer imports or places: a module by the slug its code imports
 * (resolved when read, so a module created or shadowed later is
 * judged as a deploy would judge it), or a custom node by its id. The
 * consumer is a workflow or another library item; its delete cascades.
 */
export const libraryUsages = sqliteTable(
  'library_usages',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id').references(() => workflows.id, { onDelete: 'cascade' }),
    consumerItemId: text('consumer_item_id').references((): AnySQLiteColumn => libraryItems.id, {
      onDelete: 'cascade',
    }),
    // `#modules/<slug>`: a module import.
    slug: text('slug'),
    // A custom node the consumer places on its canvas.
    nodeId: text('node_id').references((): AnySQLiteColumn => libraryItems.id, {
      onDelete: 'cascade',
    }),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_library_usages_workflow').on(table.workflowId),
    index('idx_library_usages_consumer_item').on(table.consumerItemId),
    index('idx_library_usages_slug').on(table.slug),
    index('idx_library_usages_node').on(table.nodeId),
    uniqueIndex('idx_library_usages_pair').on(
      sql`coalesce(${table.workflowId}, '')`,
      sql`coalesce(${table.consumerItemId}, '')`,
      sql`coalesce(${table.slug}, '')`,
      sql`coalesce(${table.nodeId}, '')`,
    ),
  ],
)

/** Which library versions a deployment bundled; the text outlives the version row. */
export const deploymentLibraryVersions = sqliteTable(
  'deployment_library_versions',
  {
    deploymentId: text('deployment_id')
      .notNull()
      .references(() => deployments.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull(),
    slug: text('slug').notNull(),
    version: text('version').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.deploymentId, table.itemId] }),
    index('idx_deployment_library_versions_item').on(table.itemId),
  ],
)
