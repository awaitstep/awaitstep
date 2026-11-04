import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { DrizzleDatabaseAdapter } from '../adapters/index.js'
import type { CreateApiKeyData } from '../types.js'
import * as sqliteSchema from '../schema/sqlite/index.js'

const now = '2026-10-25T00:00:00.000Z'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(`
    CREATE TABLE organization (id text PRIMARY KEY, name text, createdAt text);
    CREATE TABLE member (
      id text PRIMARY KEY, userId text NOT NULL, organizationId text NOT NULL,
      role text NOT NULL, createdAt text NOT NULL
    );
    CREATE TABLE projects (id text PRIMARY KEY, organization_id text NOT NULL, name text NOT NULL, slug text NOT NULL DEFAULT 'p', created_at text NOT NULL, updated_at text NOT NULL);
    CREATE TABLE workspaces (id text PRIMARY KEY, project_id text NOT NULL, name text NOT NULL, slug text NOT NULL, colour text NOT NULL DEFAULT 'green', created_at text NOT NULL, updated_at text NOT NULL);
    CREATE TABLE project_members (project_id text NOT NULL, user_id text NOT NULL, role text NOT NULL, created_by text, created_at text NOT NULL, PRIMARY KEY (project_id, user_id));
    CREATE TABLE workspace_members (workspace_id text NOT NULL, user_id text NOT NULL, role text NOT NULL, created_by text, created_at text NOT NULL, PRIMARY KEY (workspace_id, user_id));
    CREATE TABLE user (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL);
    CREATE TABLE api_keys (
      id text PRIMARY KEY, organization_id text NOT NULL, level text NOT NULL,
      parent_key_id text REFERENCES api_keys(id) ON DELETE CASCADE,
      created_by text NOT NULL, name text NOT NULL,
      key_hash text NOT NULL UNIQUE, key_prefix text NOT NULL, key_suffix text, scopes text NOT NULL,
      permissions text NOT NULL DEFAULT '{}',
      expires_at text, last_used_at text, revoked_at text, created_at text NOT NULL
    );
    CREATE TABLE api_key_projects (
      key_id text NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      revoked_at text, PRIMARY KEY (key_id, project_id)
    );
    CREATE TABLE api_key_workspaces (
      key_id text NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      revoked_at text, PRIMARY KEY (key_id, workspace_id)
    );
    INSERT INTO organization VALUES ('org-1', 'One', '${now}');
    INSERT INTO organization VALUES ('org-2', 'Two', '${now}');
    INSERT INTO member VALUES ('m-1', 'u-1', 'org-1', 'owner', '${now}');
    INSERT INTO user VALUES ('u-1', 'User One', 'u1@one.test');
    INSERT INTO projects VALUES ('p-1', 'org-1', 'One', 'one', '${now}', '${now}');
    INSERT INTO projects VALUES ('p-3', 'org-1', 'Three', 'three', '${now}', '${now}');
    INSERT INTO projects VALUES ('p-2', 'org-2', 'Two', 'two', '${now}', '${now}');
    INSERT INTO workspaces VALUES ('ws-1', 'p-1', 'Default', 'default', 'green', '${now}', '${now}');
    INSERT INTO workspaces VALUES ('ws-2', 'p-1', 'Other', 'other', 'blue', '${now}', '${now}');
    INSERT INTO project_members VALUES ('p-1', 'u-1', 'admin', NULL, '${now}');
  `)
  const adapter = new DrizzleDatabaseAdapter(drizzle(sqlite), sqliteSchema)
  return { adapter, sqlite }
}

function orgKey(id: string, overrides: Partial<CreateApiKeyData> = {}): CreateApiKeyData {
  return {
    level: 'organization',
    organizationId: 'org-1',
    id,
    createdBy: 'u-1',
    name: id,
    keyHash: `hash-${id}`,
    keyPrefix: 'ask_test',
    scopes: '["read"]',
    permissions: '{"projects":["read"]}',
    ...overrides,
  }
}

function projectKey(
  id: string,
  projectIds: string[],
  overrides: Partial<CreateApiKeyData> = {},
): CreateApiKeyData {
  return {
    level: 'project',
    organizationId: 'org-1',
    projectIds,
    id,
    createdBy: 'u-1',
    name: id,
    keyHash: `hash-${id}`,
    keyPrefix: 'ask_test',
    scopes: '["read"]',
    permissions: '{"workflows":["read"]}',
    ...overrides,
  } as CreateApiKeyData
}

function workspaceKey(
  id: string,
  workspaceIds: string[],
  overrides: Partial<CreateApiKeyData> = {},
): CreateApiKeyData {
  return {
    level: 'workspace',
    organizationId: 'org-1',
    projectId: 'p-1',
    workspaceIds,
    id,
    createdBy: 'u-1',
    name: id,
    keyHash: `hash-${id}`,
    keyPrefix: 'ask_test',
    scopes: '["read"]',
    permissions: '{"workflows":["read"]}',
    ...overrides,
  } as CreateApiKeyData
}

describe('ApiKeysAdapter', () => {
  let db: ReturnType<typeof createTestDb>
  beforeEach(() => {
    db = createTestDb()
  })

  describe('create', () => {
    it('writes an organization key with no scope rows', async () => {
      const key = await db.adapter.createApiKey(orgKey('k-o'))
      expect(key?.level).toBe('organization')
      expect(key?.organizationId).toBe('org-1')
      const auth = await db.adapter.getApiKeyAuthByHash('hash-k-o')
      expect(auth?.projectScopes).toEqual([])
      expect(auth?.workspaceScopes).toEqual([])
    })

    it('writes a single-project key as a set of one', async () => {
      const key = await db.adapter.createApiKey(projectKey('k-p', ['p-1']))
      expect(key?.level).toBe('project')
      expect(key?.organizationId).toBe('org-1')
      const auth = await db.adapter.getApiKeyAuthByHash('hash-k-p')
      expect(auth?.projectScopes).toEqual(['p-1'])
    })

    it('writes a multi-project key with one secret and all its scope rows', async () => {
      const key = await db.adapter.createApiKey(projectKey('k-mp', ['p-1', 'p-3']))
      expect(key?.id).toBe('k-mp')
      const auth = await db.adapter.getApiKeyAuthByHash('hash-k-mp')
      expect(auth?.projectScopes?.sort()).toEqual(['p-1', 'p-3'])
    })

    it('refuses the whole key when a scope is outside the creator’s reach (all-or-nothing)', async () => {
      // p-2 is another org’s project; the owner of org-1 cannot open it.
      const foreign = await db.adapter.createApiKey(projectKey('k-x', ['p-1', 'p-2']))
      expect(foreign).toBeNull()
      expect(await db.adapter.getApiKeyById('k-x')).toBeNull()
      expect(await db.adapter.getApiKeyAuthByHash('hash-k-x')).toBeNull()
    })

    it('writes a multi-workspace key bound to one project', async () => {
      const key = await db.adapter.createApiKey(workspaceKey('k-mw', ['ws-1', 'ws-2']))
      expect(key?.level).toBe('workspace')
      const auth = await db.adapter.getApiKeyAuthByHash('hash-k-mw')
      expect(auth?.workspaceScopes?.sort()).toEqual(['ws-1', 'ws-2'])
      expect(auth?.projectScopes).toEqual([])
    })
  })

  describe('auth', () => {
    it('resolves organization, membership and a live parent in one read', async () => {
      await db.adapter.createApiKey(projectKey('k-p', ['p-1']))
      const auth = await db.adapter.getApiKeyAuthByHash('hash-k-p')
      expect(auth?.organizationId).toBe('org-1')
      expect(auth?.createdByIsMember).toBe(true)
      expect(auth?.createdByRole).toBe('owner')
      expect(auth?.parentKeyLive).toBe(true)
    })

    it('reports a creator who left the organization', async () => {
      await db.adapter.createApiKey(orgKey('k-g', { createdBy: 'departed' }))
      const ghost = await db.adapter.getApiKeyAuthByHash('hash-k-g')
      expect(ghost?.createdByIsMember).toBe(false)
      expect(ghost?.createdByRole).toBeNull()
    })

    it('stops a minted key when the key that minted it is revoked', async () => {
      await db.adapter.createApiKey(orgKey('k-o'))
      await db.adapter.createApiKey(projectKey('k-child', ['p-1'], { parentKeyId: 'k-o' }))
      expect((await db.adapter.getApiKeyAuthByHash('hash-k-child'))?.parentKeyLive).toBe(true)
      await db.adapter.revokeApiKey('k-o', { level: 'organization', organizationId: 'org-1' })
      expect((await db.adapter.getApiKeyAuthByHash('hash-k-child'))?.parentKeyLive).toBe(false)
    })

    it('hides a revoked key from auth', async () => {
      await db.adapter.createApiKey(orgKey('k-o'))
      await db.adapter.revokeApiKey('k-o', { level: 'organization', organizationId: 'org-1' })
      expect(await db.adapter.getApiKeyAuthByHash('hash-k-o')).toBeNull()
    })
  })

  describe('per-consumer revoke', () => {
    it('drops one project’s slice without touching the others, and kills the key on the last', async () => {
      await db.adapter.createApiKey(projectKey('k-mp', ['p-1', 'p-3']))

      const afterFirst = await db.adapter.revokeApiKeyScope({
        level: 'project',
        keyId: 'k-mp',
        projectId: 'p-1',
      })
      expect(afterFirst?.revokedAt).toBeNull() // key still alive
      const auth = await db.adapter.getApiKeyAuthByHash('hash-k-mp')
      expect(auth?.projectScopes).toEqual(['p-3']) // p-1 gone, p-3 lives

      const afterLast = await db.adapter.revokeApiKeyScope({
        level: 'project',
        keyId: 'k-mp',
        projectId: 'p-3',
      })
      expect(afterLast?.revokedAt).not.toBeNull() // last slice stamps the key dead
      expect(await db.adapter.getApiKeyAuthByHash('hash-k-mp')).toBeNull()
    })

    it('is a no-op (null) for a place the key does not reach, or an already-revoked slice', async () => {
      await db.adapter.createApiKey(projectKey('k-mp', ['p-1', 'p-3']))
      expect(
        await db.adapter.revokeApiKeyScope({ level: 'project', keyId: 'k-mp', projectId: 'p-2' }),
      ).toBeNull()
      await db.adapter.revokeApiKeyScope({ level: 'project', keyId: 'k-mp', projectId: 'p-1' })
      expect(
        await db.adapter.revokeApiKeyScope({ level: 'project', keyId: 'k-mp', projectId: 'p-1' }),
      ).toBeNull()
    })

    it('drops one workspace’s slice of a multi-workspace key', async () => {
      await db.adapter.createApiKey(workspaceKey('k-mw', ['ws-1', 'ws-2']))
      await db.adapter.revokeApiKeyScope({ level: 'workspace', keyId: 'k-mw', workspaceId: 'ws-1' })
      expect((await db.adapter.getApiKeyAuthByHash('hash-k-mw'))?.workspaceScopes).toEqual(['ws-2'])
    })
  })

  describe('whole-key kill-switch', () => {
    it('kills a single-project key from its project home, not from the org', async () => {
      await db.adapter.createApiKey(projectKey('k-p', ['p-1']))
      expect(
        await db.adapter.revokeApiKey('k-p', { level: 'organization', organizationId: 'org-1' }),
      ).toBeNull()
      expect(
        await db.adapter.revokeApiKey('k-p', { level: 'project', projectId: 'p-3' }),
      ).toBeNull()
      const killed = await db.adapter.revokeApiKey('k-p', { level: 'project', projectId: 'p-1' })
      expect(killed?.revokedAt).not.toBeNull()
    })

    it('kills a multi-project key from the org home, not from any one project', async () => {
      await db.adapter.createApiKey(projectKey('k-mp', ['p-1', 'p-3']))
      expect(
        await db.adapter.revokeApiKey('k-mp', { level: 'project', projectId: 'p-1' }),
      ).toBeNull()
      const killed = await db.adapter.revokeApiKey('k-mp', {
        level: 'organization',
        organizationId: 'org-1',
      })
      expect(killed?.revokedAt).not.toBeNull()
      expect(await db.adapter.getApiKeyAuthByHash('hash-k-mp')).toBeNull()
    })

    it('kills a multi-workspace key from its project home, not from any one workspace', async () => {
      await db.adapter.createApiKey(workspaceKey('k-mw', ['ws-1', 'ws-2']))
      // A multi-workspace key lives at its project; a single workspace cannot kill it whole.
      expect(
        await db.adapter.revokeApiKey('k-mw', { level: 'workspace', workspaceId: 'ws-1' }),
      ).toBeNull()
      const killed = await db.adapter.revokeApiKey('k-mw', { level: 'project', projectId: 'p-1' })
      expect(killed?.revokedAt).not.toBeNull()
      expect(await db.adapter.getApiKeyAuthByHash('hash-k-mw')).toBeNull()
    })
  })

  describe('listing and home placement', () => {
    it('lists a multi-workspace key as own on its project home', async () => {
      await db.adapter.createApiKey(workspaceKey('k-mw', ['ws-1', 'ws-2']))
      const page = await db.adapter.listApiKeysByProject('org-1', 'p-1')
      expect(page.own.map((k) => k.id)).toEqual(['k-mw'])
      expect(page.own[0]?.workspaces.map((w) => w.workspace.id).sort()).toEqual(['ws-1', 'ws-2'])
      expect(page.reaching).toEqual([])
    })

    it('lists org keys and multi-project keys at the organization, single-project keys at their project', async () => {
      await db.adapter.createApiKey(orgKey('k-o'))
      await db.adapter.createApiKey(projectKey('k-p', ['p-1']))
      await db.adapter.createApiKey(projectKey('k-mp', ['p-1', 'p-3']))
      await db.adapter.createApiKey(
        orgKey('k-other', { organizationId: 'org-2', createdBy: 'u-1' }),
      )

      const org = await db.adapter.listApiKeysByOrganization('org-1')
      expect(org.data.map((k) => k.id).sort()).toEqual(['k-mp', 'k-o'])
      expect(
        org.data
          .find((k) => k.id === 'k-mp')
          ?.projects.map((p) => p.projectId)
          .sort(),
      ).toEqual(['p-1', 'p-3'])
      expect(org.data.find((k) => k.id === 'k-o')?.createdByName).toBe('User One')
    })

    it('splits a project page into its own keys and the keys reaching it', async () => {
      await db.adapter.createApiKey(orgKey('k-o'))
      await db.adapter.createApiKey(projectKey('k-p', ['p-1']))
      await db.adapter.createApiKey(projectKey('k-mp', ['p-1', 'p-3']))

      const page = await db.adapter.listApiKeysByProject('org-1', 'p-1')
      expect(page.own.map((k) => k.id)).toEqual(['k-p'])
      // Multi-project keys reach the project; org keys live at the org, not here.
      expect(page.reaching.map((k) => k.id)).toEqual(['k-mp'])
      expect(page.own[0]?.projects[0]).toMatchObject({ projectId: 'p-1', projectName: 'One' })
    })

    it('hides a project’s slice from its page once that slice is revoked', async () => {
      await db.adapter.createApiKey(projectKey('k-mp', ['p-1', 'p-3']))
      await db.adapter.revokeApiKeyScope({ level: 'project', keyId: 'k-mp', projectId: 'p-1' })
      const page = await db.adapter.listApiKeysByProject('org-1', 'p-1')
      expect(page.reaching.map((k) => k.id)).toEqual([])
      const stillOnThree = await db.adapter.listApiKeysByProject('org-1', 'p-3')
      expect(stillOnThree.reaching.map((k) => k.id)).toEqual(['k-mp'])
    })

    it('lists workspace keys at their workspace and counts them per workspace', async () => {
      await db.adapter.createApiKey(workspaceKey('k-w', ['ws-1']))
      await db.adapter.createApiKey(workspaceKey('k-mw', ['ws-1', 'ws-2']))
      await db.adapter.createApiKey(projectKey('k-p', ['p-1']))

      const page = await db.adapter.listApiKeysByWorkspace('ws-1', now)
      expect(page.own.map((k) => k.id)).toEqual(['k-w'])
      expect(page.reaching.map((k) => k.id).sort()).toEqual(['k-mw', 'k-p'])

      const counts = await db.adapter.countApiKeysByWorkspace('p-1', 'u-1')
      const ws1 = counts.find((c) => c.workspace.id === 'ws-1')
      expect(ws1?.count).toBe(2) // k-w + k-mw reach ws-1
    })

    it('omits a project from another organization', async () => {
      await db.adapter.createApiKey(projectKey('k-p', ['p-1']))
      const foreign = await db.adapter.listApiKeysByProject('org-1', 'p-2')
      expect(foreign.own).toEqual([])
      expect(foreign.reaching).toEqual([])
    })
  })
})
