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
    CREATE TABLE api_keys (
      id text PRIMARY KEY, project_id text, organization_id text,
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
  `)
  const adapter = new DrizzleDatabaseAdapter(drizzle(sqlite), sqliteSchema)
  return { adapter, sqlite }
}

function keyData(overrides: {
  id: string
  organizationId: string
  projectId?: string | null
  createdBy?: string
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

    db.sqlite.prepare(`DELETE FROM member WHERE userId = 'u-1'`).run()
    await db.adapter.createApiKey(keyData({ id: 'k-l', organizationId: 'org-1', projectId: 'p-1' }))
    const left = await db.adapter.getApiKeyAuthByHash('hash-k-l')
    expect(left?.createdByIsMember).toBe(false)
  })

  it('hides a revoked key from auth', async () => {
    await db.adapter.createApiKey(keyData({ id: 'k-o', organizationId: 'org-1' }))
    await db.adapter.revokeApiKey('k-o', 'org-1')
    expect(await db.adapter.getApiKeyAuthByHash('hash-k-o')).toBeNull()
  })

  it('revokes only within the organization', async () => {
    await db.adapter.createApiKey(keyData({ id: 'k-p', organizationId: 'org-1', projectId: 'p-1' }))
    expect(await db.adapter.revokeApiKey('k-p', 'org-2')).toBeNull()
    expect((await db.adapter.getApiKeyById('k-p'))?.revokedAt).toBeNull()

    const revoked = await db.adapter.revokeApiKey('k-p', 'org-1')
    expect(revoked?.revokedAt).not.toBeNull()
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
