import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { DrizzleDatabaseAdapter } from '../adapters/index.js'
import * as sqliteSchema from '../schema/sqlite/index.js'

const now = '2026-10-25T00:00:00.000Z'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE organization (id text PRIMARY KEY, name text, createdAt text);
    CREATE TABLE member (
      id text PRIMARY KEY, userId text NOT NULL, organizationId text NOT NULL,
      role text NOT NULL, createdAt text NOT NULL
    );
    CREATE TABLE projects (id text PRIMARY KEY, organization_id text NOT NULL, name text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL);
    CREATE TABLE workspaces (id text PRIMARY KEY, project_id text NOT NULL, name text NOT NULL, slug text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL);
    CREATE TABLE project_members (project_id text NOT NULL, user_id text NOT NULL, role text NOT NULL, created_by text, created_at text NOT NULL, PRIMARY KEY (project_id, user_id));
    CREATE TABLE workspace_members (workspace_id text NOT NULL, user_id text NOT NULL, role text NOT NULL, created_by text, created_at text NOT NULL, PRIMARY KEY (workspace_id, user_id));
    CREATE TABLE api_keys (
      id text PRIMARY KEY, project_id text, organization_id text,
      parent_key_id text REFERENCES api_keys(id) ON DELETE CASCADE,
      created_by text NOT NULL, name text NOT NULL,
      key_hash text NOT NULL UNIQUE, key_prefix text NOT NULL, scopes text NOT NULL,
      expires_at text, last_used_at text, revoked_at text, created_at text NOT NULL,
      CONSTRAINT api_keys_one_level CHECK((project_id IS NULL) <> (organization_id IS NULL))
    );
    INSERT INTO organization VALUES ('org-1', 'One', '${now}');
    INSERT INTO organization VALUES ('org-2', 'Two', '${now}');
    INSERT INTO member VALUES ('m-1', 'u-1', 'org-1', 'owner', '${now}');
    INSERT INTO projects VALUES ('p-1', 'org-1', 'One', '${now}', '${now}');
    INSERT INTO projects VALUES ('p-2', 'org-2', 'Two', '${now}', '${now}');
    INSERT INTO workspaces VALUES ('ws-1', 'p-1', 'Default', 'default', '${now}', '${now}');
    INSERT INTO project_members VALUES ('p-1', 'u-1', 'admin', NULL, '${now}');
  `)
  const adapter = new DrizzleDatabaseAdapter(drizzle(sqlite), sqliteSchema)
  return { adapter, sqlite }
}

function keyData(overrides: {
  id: string
  organizationId: string
  projectId?: string | null
  parentKeyId?: string | null
  createdBy?: string
  expiresAt?: string | null
}) {
  return {
    createdBy: 'u-1',
    name: overrides.id,
    keyHash: `hash-${overrides.id}`,
    keyPrefix: 'ask_test',
    scopes: '["read"]',
    ...overrides,
  }
}

describe('ApiKeysAdapter', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  it('creates exactly one level and validates the project belongs to the org', async () => {
    const projectKey = await db.adapter.createApiKey(
      keyData({ id: 'k-p', organizationId: 'org-1', projectId: 'p-1' }),
    )
    expect(projectKey?.projectId).toBe('p-1')
    expect(projectKey?.organizationId).toBeNull()

    const orgKey = await db.adapter.createApiKey(keyData({ id: 'k-o', organizationId: 'org-1' }))
    expect(orgKey?.projectId).toBeNull()
    expect(orgKey?.organizationId).toBe('org-1')

    const foreign = await db.adapter.createApiKey(
      keyData({ id: 'k-x', organizationId: 'org-1', projectId: 'p-2' }),
    )
    expect(foreign).toBeNull()
    // Refused in the same statement that would have written it.
    expect(await db.adapter.getApiKeyById('k-x')).toBeNull()
  })

  it('stores a project key in one statement, booleans and nulls intact', async () => {
    const key = await db.adapter.createApiKey(
      keyData({ id: 'k-p', organizationId: 'org-1', projectId: 'p-1', expiresAt: now }),
    )
    const stored = await db.adapter.getApiKeyById('k-p')
    expect(stored).toEqual(key)
    expect(stored?.expiresAt).toBe(now)
    expect(stored?.revokedAt).toBeNull()
  })

  it('the CHECK refuses a row carrying both levels, or neither', async () => {
    expect(() =>
      db.sqlite
        .prepare(
          `INSERT INTO api_keys (id, project_id, organization_id, created_by, name, key_hash, key_prefix, scopes, created_at)
           VALUES ('bad', 'p-1', 'org-1', 'u-1', 'bad', 'h-bad', 'ask_test', '[]', '${now}')`,
        )
        .run(),
    ).toThrow(/CHECK/)
    expect(() =>
      db.sqlite
        .prepare(
          `INSERT INTO api_keys (id, project_id, organization_id, created_by, name, key_hash, key_prefix, scopes, created_at)
           VALUES ('bad2', NULL, NULL, 'u-1', 'bad2', 'h-bad2', 'ask_test', '[]', '${now}')`,
        )
        .run(),
    ).toThrow(/CHECK/)
  })

  it('resolves the organization and membership in one read', async () => {
    await db.adapter.createApiKey(keyData({ id: 'k-p', organizationId: 'org-1', projectId: 'p-1' }))
    const viaProject = await db.adapter.getApiKeyAuthByHash('hash-k-p')
    expect(viaProject?.resolvedOrganizationId).toBe('org-1')
    expect(viaProject?.createdByIsMember).toBe(true)
    expect(viaProject?.createdByRole).toBe('owner')

    await db.adapter.createApiKey(keyData({ id: 'k-o', organizationId: 'org-1' }))
    const viaOrg = await db.adapter.getApiKeyAuthByHash('hash-k-o')
    expect(viaOrg?.resolvedOrganizationId).toBe('org-1')
    expect(viaOrg?.createdByIsMember).toBe(true)
  })

  it('reports a creator who left the organization', async () => {
    await db.adapter.createApiKey(
      keyData({ id: 'k-g', organizationId: 'org-1', createdBy: 'departed' }),
    )
    const ghost = await db.adapter.getApiKeyAuthByHash('hash-k-g')
    expect(ghost?.createdByIsMember).toBe(false)
    expect(ghost?.createdByRole).toBeNull()

    // Minted while a member (a key is minted only in a project its creator can open), then they leave.
    await db.adapter.createApiKey(keyData({ id: 'k-l', organizationId: 'org-1', projectId: 'p-1' }))
    db.sqlite.prepare(`DELETE FROM member WHERE userId = 'u-1'`).run()
    const left = await db.adapter.getApiKeyAuthByHash('hash-k-l')
    expect(left?.createdByIsMember).toBe(false)
  })

  it('hides a revoked key from auth', async () => {
    await db.adapter.createApiKey(keyData({ id: 'k-o', organizationId: 'org-1' }))
    await db.adapter.revokeApiKey('k-o', 'org-1')
    expect(await db.adapter.getApiKeyAuthByHash('hash-k-o')).toBeNull()
  })

  it('stops a minted key when the key that minted it is revoked', async () => {
    await db.adapter.createApiKey(keyData({ id: 'k-o', organizationId: 'org-1' }))
    await db.adapter.createApiKey(
      keyData({ id: 'k-child', organizationId: 'org-1', projectId: 'p-1', parentKeyId: 'k-o' }),
    )
    expect((await db.adapter.getApiKeyAuthByHash('hash-k-child'))?.parentKeyLive).toBe(true)

    await db.adapter.revokeApiKey('k-o', 'org-1')
    expect((await db.adapter.getApiKeyAuthByHash('hash-k-child'))?.parentKeyLive).toBe(false)
  })

  it('stops a minted key when the key that minted it has expired', async () => {
    await db.adapter.createApiKey(
      keyData({ id: 'k-o', organizationId: 'org-1', expiresAt: '2000-01-01T00:00:00.000Z' }),
    )
    await db.adapter.createApiKey(
      keyData({ id: 'k-child', organizationId: 'org-1', projectId: 'p-1', parentKeyId: 'k-o' }),
    )
    expect((await db.adapter.getApiKeyAuthByHash('hash-k-child'))?.parentKeyLive).toBe(false)
  })

  it('treats a key nobody minted as having a live parent', async () => {
    await db.adapter.createApiKey(keyData({ id: 'k-p', organizationId: 'org-1', projectId: 'p-1' }))
    expect((await db.adapter.getApiKeyAuthByHash('hash-k-p'))?.parentKeyLive).toBe(true)
  })

  it('revokes only within the organization', async () => {
    await db.adapter.createApiKey(keyData({ id: 'k-p', organizationId: 'org-1', projectId: 'p-1' }))
    expect(await db.adapter.revokeApiKey('k-p', 'org-2')).toBeNull()
    expect((await db.adapter.getApiKeyById('k-p'))?.revokedAt).toBeNull()

    const revoked = await db.adapter.revokeApiKey('k-p', 'org-1')
    expect(revoked?.revokedAt).not.toBeNull()
  })

  it('lists live keys with project names and scopes the project list by org', async () => {
    await db.adapter.createApiKey(keyData({ id: 'k-p', organizationId: 'org-1', projectId: 'p-1' }))
    await db.adapter.createApiKey(keyData({ id: 'k-o', organizationId: 'org-1' }))
    await db.adapter.createApiKey(
      keyData({ id: 'k-dead', organizationId: 'org-1', projectId: 'p-1' }),
    )
    await db.adapter.revokeApiKey('k-dead', 'org-1')

    const orgList = await db.adapter.listApiKeysByOrganization('org-1')
    expect(orgList.data.map((k) => k.id).sort()).toEqual(['k-o', 'k-p'])
    expect(orgList.data.find((k) => k.id === 'k-p')?.projectName).toBe('One')
    expect(orgList.data.find((k) => k.id === 'k-o')?.projectName).toBeNull()

    const projectList = await db.adapter.listApiKeysByProject('org-1', 'p-1')
    expect(projectList.data.map((k) => k.id)).toEqual(['k-p'])

    // A project id from another organization matches nothing.
    const foreign = await db.adapter.listApiKeysByProject('org-1', 'p-2')
    expect(foreign.data).toEqual([])
  })

  it('lists both key levels of one organization and nothing of another', async () => {
    await db.adapter.createApiKey(keyData({ id: 'k-p', organizationId: 'org-1', projectId: 'p-1' }))
    await db.adapter.createApiKey(keyData({ id: 'k-o', organizationId: 'org-1' }))
    await db.adapter.createApiKey(
      keyData({ id: 'k-other-p', organizationId: 'org-2', projectId: 'p-2' }),
    )
    await db.adapter.createApiKey(keyData({ id: 'k-other-o', organizationId: 'org-2' }))

    const listed = await db.adapter.listApiKeysByOrganization('org-1')
    expect(listed.data.map((k) => k.id).sort()).toEqual(['k-o', 'k-p'])
  })
})
