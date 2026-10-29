import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
  check,
  primaryKey,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const envVars = sqliteTable(
  'env_vars',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').notNull(),
    name: text('name').notNull(),
    value: text('value').notNull(),
    isSecret: integer('is_secret', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_env_vars_org_name').on(table.organizationId, table.projectId, table.name),
    index('idx_env_vars_org_id').on(table.organizationId),
    index('idx_env_vars_project_id').on(table.projectId),
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
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    activeOrganizationId: text('activeOrganizationId'),
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
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
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

// Organization tables (better-auth organization plugin)

export const organization = sqliteTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  metadata: text('metadata'),
  createdAt: text('createdAt').notNull(),
})

export const member = sqliteTable(
  'member',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    organizationId: text('organizationId')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: text('createdAt').notNull(),
  },
  (table) => [
    index('idx_member_user_id').on(table.userId),
    index('idx_member_org_id').on(table.organizationId),
    uniqueIndex('uq_member_org_user').on(table.organizationId, table.userId),
  ],
)

export const invitation = sqliteTable(
  'invitation',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    inviterId: text('inviterId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    organizationId: text('organizationId')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    role: text('role'),
    status: text('status').notNull(),
    expiresAt: text('expiresAt').notNull(),
    createdAt: text('createdAt').notNull(),
    askedForNewAt: text('askedForNewAt'),
  },
  (table) => [index('idx_invitation_org_id').on(table.organizationId)],
)

// App tables (snake_case columns)

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    lockedBy: text('locked_by'),
    lockedAt: text('locked_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_projects_org_slug').on(table.organizationId, table.slug),
    index('idx_projects_org_id').on(table.organizationId),
  ],
)

export const workspaces = sqliteTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    colour: text('colour').notNull().default('green'),
    createdBy: text('created_by'),
    lockedBy: text('locked_by'),
    lockedAt: text('locked_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_workspaces_project_slug').on(table.projectId, table.slug),
    index('idx_workspaces_project_id').on(table.projectId),
  ],
)

export const workflows = sqliteTable(
  'workflows',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    kind: text('kind', { enum: ['workflow', 'script'] })
      .notNull()
      .default('workflow'),
    currentVersionId: text('current_version_id'),
    envVars: text('env_vars'),
    triggerCode: text('trigger_code'),
    dependencies: text('dependencies'),
    deployConfig: text('deploy_config'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_workflows_project_id').on(table.projectId),
    index('idx_workflows_workspace_id').on(table.workspaceId),
    index('idx_workflows_created_by').on(table.createdBy),
  ],
)

export const workflowVersions = sqliteTable(
  'workflow_versions',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    ir: text('ir').notNull(),
    sourceMode: text('source_mode').notNull().default('generated'),
    source: text('source'),
    manifest: text('manifest'),
    baseGeneratedHash: text('base_generated_hash'),
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
    organizationId: text('organization_id').notNull(),
    createdBy: text('created_by').notNull(),
    provider: text('provider').notNull(),
    name: text('name').notNull(),
    credentials: text('credentials').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_connections_org_id').on(table.organizationId),
    index('idx_connections_created_by').on(table.createdBy),
  ],
)

export const workflowRuns = sqliteTable(
  'workflow_runs',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    versionId: text('version_id').references(() => workflowVersions.id, {
      onDelete: 'set null',
    }),
    connectionId: text('connection_id').references(() => connections.id, { onDelete: 'set null' }),
    instanceId: text('instance_id').notNull(),
    status: text('status').notNull().default('queued'),
    output: text('output'),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_workflow_runs_workflow_id').on(table.workflowId)],
)

export const workflowRunSteps = sqliteTable(
  'workflow_run_steps',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => workflowRuns.id, { onDelete: 'cascade' }),
    nodeId: text('node_id'),
    stepName: text('step_name').notNull(),
    kind: text('kind').notNull(),
    stepIndex: integer('step_index').notNull().default(1),
    status: text('status').notNull(),
    attemptCount: integer('attempt_count').notNull().default(1),
    error: text('error'),
    startedAt: text('started_at'),
    endedAt: text('ended_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_workflow_run_steps_run_id').on(table.runId),
    uniqueIndex('idx_workflow_run_steps_identity').on(
      table.runId,
      table.stepName,
      table.kind,
      table.stepIndex,
    ),
  ],
)

export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').references(() => organization.id, {
      onDelete: 'cascade',
    }),
    parentKeyId: text('parent_key_id').references((): AnySQLiteColumn => apiKeys.id, {
      onDelete: 'cascade',
    }),
    createdBy: text('created_by').notNull(),
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
    index('idx_api_keys_project_id').on(table.projectId),
    index('idx_api_keys_organization_id').on(table.organizationId),
    index('idx_api_keys_parent_key_id').on(table.parentKeyId),
    index('idx_api_keys_key_hash').on(table.keyHash),
    check('api_keys_one_level', sql`(project_id IS NULL) <> (organization_id IS NULL)`),
  ],
)

export const installedNodes = sqliteTable(
  'installed_nodes',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    nodeId: text('node_id').notNull(),
    version: text('version').notNull(),
    bundle: text('bundle').notNull(),
    installedBy: text('installed_by').notNull(),
    installedAt: text('installed_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_installed_nodes_org_node').on(table.organizationId, table.nodeId),
    index('idx_installed_nodes_org_id').on(table.organizationId),
  ],
)

export const deployments = sqliteTable(
  'deployments',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    versionId: text('version_id').references(() => workflowVersions.id, {
      onDelete: 'set null',
    }),
    connectionId: text('connection_id').references(() => connections.id, { onDelete: 'set null' }),
    serviceName: text('service_name').notNull(),
    serviceUrl: text('service_url'),
    status: text('status').notNull().default('success'),
    error: text('error'),
    configSnapshot: text('config_snapshot'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_deployments_workflow_id').on(table.workflowId),
    index('idx_deployments_workflow_version').on(table.workflowId, table.versionId),
  ],
)

export const deploymentConfigs = sqliteTable(
  'deployment_configs',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    config: text('config').notNull(),
    updatedAt: text('updated_at').notNull(),
    updatedBy: text('updated_by'),
  },
  (table) => [
    uniqueIndex('idx_deployment_configs_workflow_connection').on(
      table.workflowId,
      table.connectionId,
    ),
    index('idx_deployment_configs_workflow_id').on(table.workflowId),
  ],
)

export const workflowFiles = sqliteTable(
  'workflow_files',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    source: text('source').notNull(),
    hash: text('hash').notNull(),
    size: integer('size').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_workflow_files_workflow_id').on(table.workflowId),
    uniqueIndex('idx_workflow_files_path').on(table.workflowId, table.path),
  ],
)

export const testSessions = sqliteTable(
  'test_sessions',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id').references(() => workflows.id, { onDelete: 'set null' }),
    versionId: text('version_id').references(() => workflowVersions.id, {
      onDelete: 'set null',
    }),
    userId: text('user_id').notNull(),
    runtime: text('runtime', { enum: ['sandbox', 'node'] }).notNull(),
    containerId: text('container_id').notNull(),
    processId: text('process_id'),
    port: integer('port'),
    slot: integer('slot').notNull().default(0),
    status: text('status', { enum: ['starting', 'running', 'stopped', 'failed'] })
      .notNull()
      .default('starting'),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    lastUsedAt: text('last_used_at').notNull(),
    stoppedAt: text('stopped_at'),
  },
  (table) => [
    index('idx_test_sessions_workflow_id').on(table.workflowId),
    index('idx_test_sessions_user_status').on(table.userId, table.status),
    index('idx_test_sessions_status_last_used').on(table.status, table.lastUsedAt),
    // The per-project quota counts a window of a workflow's sessions on
    // every start; without this it reads every session the project ever had.
    index('idx_test_sessions_workflow_created').on(table.workflowId, table.createdAt),
    uniqueIndex('idx_test_sessions_live_slot')
      .on(table.userId, table.slot)
      .where(sql`${table.status} in ('starting', 'running')`),
  ],
)

// Access below the organization (B2): project and workspace roles, where an
// invitation leads, and a Viewer's edit-access requests.

export const projectMembers = sqliteTable(
  'project_members',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'member'] }).notNull(),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    index('idx_project_members_user_id').on(table.userId),
  ],
)

export const workspaceMembers = sqliteTable(
  'workspace_members',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'editor', 'viewer'] }).notNull(),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index('idx_workspace_members_user_id').on(table.userId),
  ],
)

export const invitationPlaces = sqliteTable(
  'invitation_places',
  {
    id: text('id').primaryKey(),
    invitationId: text('invitation_id')
      .notNull()
      .references(() => invitation.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
  },
  (table) => [index('idx_invitation_places_invitation_id').on(table.invitationId)],
)

export const accessRequests = sqliteTable(
  'access_requests',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    toUserId: text('to_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pending', 'approved', 'declined'] })
      .notNull()
      .default('pending'),
    alreadyEditing: integer('already_editing', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    decidedAt: text('decided_at'),
    decidedBy: text('decided_by'),
  },
  (table) => [
    index('idx_access_requests_workspace_id').on(table.workspaceId),
    index('idx_access_requests_user_id').on(table.userId),
    index('idx_access_requests_to_user_id').on(table.toUserId),
    uniqueIndex('uq_access_requests_pending')
      .on(table.workspaceId, table.userId)
      .where(sql`status = 'pending'`),
  ],
)
