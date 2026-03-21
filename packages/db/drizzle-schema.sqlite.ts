import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

export const envVars = sqliteTable(
  'env_vars',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    value: text('value').notNull(),
    isSecret: integer('is_secret', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_env_vars_user_name').on(table.userId, table.name),
    index('idx_env_vars_user_id').on(table.userId),
  ],
)

// Better-auth tables (camelCase columns — required by better-auth's Kysely adapter)

export const user = sqliteTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
    image: text('image'),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  (table) => [index('idx_user_email').on(table.email)],
)

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: text('expiresAt').notNull(),
    token: text('token').notNull().unique(),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('idx_session_user_id').on(table.userId),
    index('idx_session_token').on(table.token),
  ],
)

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(),
    userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: text('accessTokenExpiresAt'),
    refreshTokenExpiresAt: text('refreshTokenExpiresAt'),
    scope: text('scope'),
    password: text('password'),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  (table) => [index('idx_account_user_id').on(table.userId)],
)

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: text('expiresAt').notNull(),
    createdAt: text('createdAt'),
    updatedAt: text('updatedAt'),
  },
  (table) => [index('idx_verification_identifier').on(table.identifier)],
)

// App tables (snake_case columns)

export const workflows = sqliteTable(
  'workflows',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    currentVersionId: text('current_version_id'),
    envVars: text('env_vars'),
    triggerCode: text('trigger_code'),
    dependencies: text('dependencies'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_workflows_user_id').on(table.userId)],
)

export const workflowVersions = sqliteTable(
  'workflow_versions',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    ir: text('ir').notNull(),
    generatedCode: text('generated_code'),
    locked: integer('locked').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_workflow_version_unique').on(table.workflowId, table.version),
    index('idx_workflow_versions_workflow_id').on(table.workflowId),
  ],
)

export const connections = sqliteTable(
  'connections',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    provider: text('provider').notNull(),
    name: text('name').notNull(),
    credentials: text('credentials').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_connections_user_id').on(table.userId)],
)

export const workflowRuns = sqliteTable(
  'workflow_runs',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
    versionId: text('version_id').notNull().references(() => workflowVersions.id),
    connectionId: text('connection_id').notNull().references(() => connections.id),
    instanceId: text('instance_id').notNull(),
    status: text('status').notNull().default('queued'),
    output: text('output'),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_workflow_runs_workflow_id').on(table.workflowId)],
)

export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    keyPrefix: text('key_prefix').notNull(),
    scopes: text('scopes').notNull(),
    expiresAt: text('expires_at'),
    lastUsedAt: text('last_used_at'),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_api_keys_user_id').on(table.userId),
    index('idx_api_keys_key_hash').on(table.keyHash),
  ],
)

export const deployments = sqliteTable(
  'deployments',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
    versionId: text('version_id').notNull().references(() => workflowVersions.id),
    connectionId: text('connection_id').notNull().references(() => connections.id),
    serviceName: text('service_name').notNull(),
    serviceUrl: text('service_url'),
    status: text('status').notNull().default('success'),
    error: text('error'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_deployments_workflow_id').on(table.workflowId)],
)
