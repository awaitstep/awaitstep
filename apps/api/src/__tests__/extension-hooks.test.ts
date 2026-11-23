import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuth } from '../auth/config.js'
import { organizationCreated, useExtensionHooks } from '../lib/extension-hooks.js'
import type { AppExtension } from '../types.js'
import { createSqliteApp } from './sqlite-app.js'
import { createTestApp, mockDb, resetStore, TEST_ORG_ID, TEST_USER_ID } from './helpers.js'

type Seen = { hook: string; organizationId: string; projectId?: string; userId: string }

/** An extension that notes what it is told, and whether it was handed the database. */
function listener(seen: Seen[], id = 'listener'): AppExtension {
  return {
    id,
    hooks: {
      organizationCreated: async ({ db, organizationId, userId }) => {
        expect(typeof db.createConnection).toBe('function')
        seen.push({ hook: 'organization', organizationId, userId })
      },
      projectCreated: async ({ organizationId, projectId, userId }) => {
        seen.push({ hook: 'project', organizationId, projectId, userId })
      },
    },
  }
}

const createProject = (app: ReturnType<typeof createTestApp>, slug: string) =>
  app.request(`/api/projects?organizationId=${TEST_ORG_ID}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: slug, slug }),
  })

describe('extension hooks', () => {
  beforeEach(() => resetStore())
  afterEach(() => useExtensionHooks([]))

  it('tells an extension about a new project, after the project exists', async () => {
    const seen: Seen[] = []
    const res = await createProject(createTestApp({ extensions: [listener(seen)] }), 'sales')
    expect(res.status).toBe(201)
    const { id } = (await res.json()) as { id: string }
    expect(seen).toEqual([
      { hook: 'project', organizationId: TEST_ORG_ID, projectId: id, userId: TEST_USER_ID },
    ])
  })

  it('tells nothing for a project that was not created', async () => {
    const seen: Seen[] = []
    const app = createTestApp({ extensions: [listener(seen)] })
    const taken = Object.assign(new Error('UNIQUE constraint failed: projects.slug'), {
      code: 'SQLITE_CONSTRAINT_UNIQUE',
    })
    const create = vi.spyOn(mockDb, 'createProject').mockRejectedValueOnce(taken)
    expect((await createProject(app, 'dup')).status).toBe(409)
    create.mockRestore()
    expect(seen).toEqual([])
  })

  it('still creates the project when a hook throws, and runs the other extensions’ hooks', async () => {
    const seen: Seen[] = []
    const failing: AppExtension = {
      id: 'failing',
      hooks: {
        projectCreated: async () => {
          throw new Error('down')
        },
      },
    }
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await createProject(
      createTestApp({ extensions: [failing, listener(seen)] }),
      'kept',
    )
    error.mockRestore()
    expect(res.status).toBe(201)
    expect(seen).toHaveLength(1)
  })

  it('tells an extension about a new organization, with who created it', async () => {
    const seen: Seen[] = []
    // Building the test app installs its own (empty) set, so install after it.
    const h = createSqliteApp()
    useExtensionHooks([listener(seen)])
    await h.seed.person('u-new', 'New Person', 'new@example.test')
    const auth = createAuth({
      baseURL: 'http://localhost:8080',
      secret: 'x'.repeat(40),
      database: drizzleAdapter(h.db, { provider: 'sqlite', schema: h.schema }),
      rateLimit: false,
      onOrganizationCreated: (data) => organizationCreated(h.adapter, data),
    })
    const org = await auth.api.createOrganization({
      body: { name: 'New Org', slug: 'new-org', userId: 'u-new' },
    })
    expect(seen).toEqual([{ hook: 'organization', organizationId: org!.id, userId: 'u-new' }])
  })

  it('runs no hook once an app without extensions is built', async () => {
    const seen: Seen[] = []
    createTestApp({ extensions: [listener(seen)] })
    await createProject(createTestApp(), 'plain')
    await organizationCreated(mockDb, { organizationId: 'o', userId: 'u' })
    expect(seen).toEqual([])
  })
})
