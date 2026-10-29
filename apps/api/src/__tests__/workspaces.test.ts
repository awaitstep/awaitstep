import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createTestApp,
  resetStore,
  mockDb,
  setTestOrgRole,
  TEST_USER_ID,
  TEST_ORG_ID,
  TEST_ORG_SLUG,
  TEST_PROJECT_ID,
  TEST_PROJECT_SLUG,
  TEST_WORKSPACE_ID,
} from './helpers.js'
import { presetPermissions } from '@awaitstep/ir'
import { hashApiKey } from '../lib/api-key-hash.js'

const byId = (path: string) =>
  `${path}${path.includes('?') ? '&' : '?'}projectId=${TEST_PROJECT_ID}`
const bySlugs = (path: string) =>
  `${path}${path.includes('?') ? '&' : '?'}org=${TEST_ORG_SLUG}&project=${TEST_PROJECT_SLUG}`

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

describe('workspace routes', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(() => {
    resetStore()
    app = createTestApp()
  })

  describe('GET /api/workspaces', () => {
    it('lists the project’s workspaces with counts and what the viewer may do', async () => {
      const res = await app.request(byId('/api/workspaces'))
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data).toHaveLength(1)
      expect(data[0]).toMatchObject({
        id: TEST_WORKSPACE_ID,
        slug: 'default',
        name: 'Default',
        colour: 'green',
        createdBy: { id: TEST_USER_ID, name: 'Test' },
        counts: { workflows: 0, functions: 0 },
        viewerRole: 'admin',
        lock: null,
      })
      expect(data[0].viewerCan.delete).toEqual({
        allowed: false,
        reason: 'A project’s last workspace can’t be deleted',
      })
      // People carry their workspace role and where it comes from.
      expect(data[0].members[0]).toMatchObject({
        id: TEST_USER_ID,
        role: 'admin',
        inherited: true,
        orgRole: 'owner',
      })
    })

    it('is addressable by the org and project slugs', async () => {
      const res = await app.request(bySlugs('/api/workspaces'))
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data[0].id).toBe(TEST_WORKSPACE_ID)
    })

    it('is not found through the wrong org slug', async () => {
      const res = await app.request(`/api/workspaces?org=elsewhere&project=${TEST_PROJECT_SLUG}`)
      expect(res.status).toBe(404)
    })

    it('reads a member as an editor', async () => {
      setTestOrgRole('member')
      const { data } = await (await app.request(byId('/api/workspaces'))).json()
      expect(data[0].viewerRole).toBe('editor')
      expect(data[0].viewerCan.manageSettings.allowed).toBe(false)
    })
  })

  describe('POST /api/workspaces', () => {
    it('creates a workspace, slugging the name', async () => {
      const res = await app.request(
        byId('/api/workspaces'),
        json({ name: 'Sales & Ops', colour: 'blue' }),
      )
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body).toMatchObject({
        projectId: TEST_PROJECT_ID,
        name: 'Sales & Ops',
        slug: 'sales-ops',
        colour: 'blue',
        createdBy: TEST_USER_ID,
      })
    })

    it('refuses a reserved or malformed slug, and one a sibling uses', async () => {
      expect(
        (await app.request(byId('/api/workspaces'), json({ name: 'X', slug: 'settings' }))).status,
      ).toBe(422)
      expect(
        (await app.request(byId('/api/workspaces'), json({ name: 'X', slug: 'Bad Slug' }))).status,
      ).toBe(422)
      expect((await app.request(byId('/api/workspaces'), json({ name: '!!!' }))).status).toBe(422)
      const dup = await app.request(byId('/api/workspaces'), json({ name: 'Default' }))
      expect(dup.status).toBe(409)
    })

    it('refuses an unknown colour', async () => {
      const res = await app.request(byId('/api/workspaces'), json({ name: 'X', colour: 'teal' }))
      expect(res.status).toBe(422)
    })

    it('is for org owners and admins only, until roles arrive', async () => {
      setTestOrgRole('member')
      const res = await app.request(byId('/api/workspaces'), json({ name: 'Sneaky' }))
      expect(res.status).toBe(403)
      expect((await res.json()).error).toMatch(/project admins/)
      // A refused member spends no write budget: the same call still answers 403, not 429, many times.
      for (let i = 0; i < 35; i++) {
        expect((await app.request(byId('/api/workspaces'), json({ name: 'Sneaky' }))).status).toBe(
          403,
        )
      }
    })

    it('answers a unique-index race on create or rename with 409', async () => {
      const taken = Object.assign(new Error('UNIQUE constraint failed: workspaces.slug'), {
        code: 'SQLITE_CONSTRAINT_UNIQUE',
      })
      const create = vi.spyOn(mockDb, 'createWorkspace').mockRejectedValueOnce(taken)
      expect((await app.request(byId('/api/workspaces'), json({ name: 'Race' }))).status).toBe(409)
      create.mockRestore()
      const update = vi.spyOn(mockDb, 'updateWorkspace').mockRejectedValueOnce(taken)
      const res = await app.request(
        `/api/workspaces/${TEST_WORKSPACE_ID}`,
        json({ slug: 'race' }, 'PATCH'),
      )
      expect(res.status).toBe(409)
      update.mockRestore()
    })

    it('names the real problem with a name that makes no URL, or a page’s', async () => {
      const empty = await app.request(byId('/api/workspaces'), json({ name: '!!!' }))
      expect(empty.status).toBe(422)
      expect(JSON.stringify(await empty.json())).toMatch(/letter or number/)
      const reserved = await app.request(byId('/api/workspaces'), json({ name: 'Settings' }))
      expect(reserved.status).toBe(422)
      expect(JSON.stringify(await reserved.json())).toMatch(/taken by a page/)
    })
  })

  describe('/api/workspaces/:id', () => {
    it('reads, renames and recolours', async () => {
      const get = await app.request(`/api/workspaces/${TEST_WORKSPACE_ID}`)
      expect(get.status).toBe(200)
      expect((await get.json()).slug).toBe('default')

      const patch = await app.request(
        `/api/workspaces/${TEST_WORKSPACE_ID}`,
        json({ name: 'Main', slug: 'main', colour: 'rose', description: '  Primary  ' }, 'PATCH'),
      )
      expect(patch.status).toBe(200)
      expect(await patch.json()).toMatchObject({
        name: 'Main',
        slug: 'main',
        colour: 'rose',
        description: 'Primary',
      })
    })

    it('refuses a rename onto a sibling’s slug', async () => {
      await app.request(byId('/api/workspaces'), json({ name: 'Ops' }))
      const res = await app.request(
        `/api/workspaces/${TEST_WORKSPACE_ID}`,
        json({ slug: 'ops' }, 'PATCH'),
      )
      expect(res.status).toBe(409)
    })

    it('is not found for a workspace that is not the caller’s', async () => {
      const res = await app.request('/api/workspaces/nope', json({ name: 'x' }, 'PATCH'))
      expect(res.status).toBe(404)
    })

    it('refuses to delete the last workspace, then deletes a second one with its workflows', async () => {
      const last = await app.request(`/api/workspaces/${TEST_WORKSPACE_ID}`, { method: 'DELETE' })
      expect(last.status).toBe(409)

      const created = await (
        await app.request(byId('/api/workspaces'), json({ name: 'Ops' }))
      ).json()
      const wf = await mockDb.createWorkflow({
        id: 'wf-ops',
        projectId: TEST_PROJECT_ID,
        workspaceId: created.id,
        createdBy: TEST_USER_ID,
        name: 'In ops',
      })
      expect(wf?.workspaceId).toBe(created.id)

      const del = await app.request(`/api/workspaces/${created.id}`, { method: 'DELETE' })
      expect(del.status).toBe(200)
      expect(await mockDb.getWorkflowById('wf-ops')).toBeNull()
    })
  })

  describe('POST /api/workspaces/:id/move-workflows', () => {
    it('moves the listed workflows and reports which', async () => {
      const ops = await (await app.request(byId('/api/workspaces'), json({ name: 'Ops' }))).json()
      await mockDb.createWorkflow({
        id: 'wf-1',
        projectId: TEST_PROJECT_ID,
        createdBy: TEST_USER_ID,
        name: 'A',
      })
      await mockDb.createWorkflow({
        id: 'wf-2',
        projectId: TEST_PROJECT_ID,
        createdBy: TEST_USER_ID,
        name: 'B',
      })

      const res = await app.request(
        `/api/workspaces/${TEST_WORKSPACE_ID}/move-workflows`,
        json({ workflowIds: ['wf-1', 'nope'], targetWorkspaceId: ops.id }),
      )
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ moved: ['wf-1'] })
      expect((await mockDb.getWorkflowById('wf-1'))?.workspaceId).toBe(ops.id)
      expect((await mockDb.getWorkflowById('wf-2'))?.workspaceId).toBe(TEST_WORKSPACE_ID)
    })

    it('is not found for a target in another project', async () => {
      await mockDb.createProject({
        id: 'p-other',
        organizationId: TEST_ORG_ID,
        name: 'Other',
        slug: 'other',
        defaultWorkspaceId: 'ws-other',
      })
      const res = await app.request(
        `/api/workspaces/${TEST_WORKSPACE_ID}/move-workflows`,
        json({ workflowIds: ['wf-1'], targetWorkspaceId: 'ws-other' }),
      )
      expect(res.status).toBe(404)
    })

    it('refuses moving into the same workspace', async () => {
      const res = await app.request(
        `/api/workspaces/${TEST_WORKSPACE_ID}/move-workflows`,
        json({ workflowIds: ['wf-1'], targetWorkspaceId: TEST_WORKSPACE_ID }),
      )
      expect(res.status).toBe(400)
    })
  })

  describe('workflows in workspaces', () => {
    it('creates a workflow in the named workspace, else the oldest one', async () => {
      const ops = await (await app.request(byId('/api/workspaces'), json({ name: 'Ops' }))).json()

      const inOps = await app.request(
        byId('/api/workflows'),
        json({ name: 'In ops', workspaceId: ops.id }),
      )
      expect(inOps.status).toBe(201)
      expect((await inOps.json()).workspaceId).toBe(ops.id)

      const bySlug = await app.request(
        `${byId('/api/workflows')}&workspace=ops`,
        json({ name: 'Also ops' }),
      )
      expect((await bySlug.json()).workspaceId).toBe(ops.id)

      const plain = await app.request(byId('/api/workflows'), json({ name: 'Plain' }))
      expect((await plain.json()).workspaceId).toBe(TEST_WORKSPACE_ID)

      const elsewhere = await app.request(
        byId('/api/workflows'),
        json({ name: 'Nope', workspaceId: 'ws-x' }),
      )
      expect(elsewhere.status).toBe(404)
      expect(
        (await app.request(`${byId('/api/workflows')}&workspace=nope`, json({ name: 'Nope' })))
          .status,
      ).toBe(404)
    })

    it('lists by workspace and kind', async () => {
      const ops = await (await app.request(byId('/api/workspaces'), json({ name: 'Ops' }))).json()
      await app.request(byId('/api/workflows'), json({ name: 'W', workspaceId: ops.id }))
      await app.request(
        byId('/api/workflows'),
        json({ name: 'F', kind: 'script', workspaceId: ops.id }),
      )
      await app.request(byId('/api/workflows'), json({ name: 'D' }))

      const all = await (await app.request(byId('/api/workflows'))).json()
      expect(all.data).toHaveLength(3)
      expect(all.data[0]).toMatchObject({ recentRunStatuses: [], deployedVersion: null })

      const opsOnly = await (await app.request(`${byId('/api/workflows')}&workspace=ops`)).json()
      expect(opsOnly.data.map((w: { name: string }) => w.name).sort()).toEqual(['F', 'W'])

      const functions = await (
        await app.request(`${byId('/api/workflows')}&workspace=ops&kind=script`)
      ).json()
      expect(functions.data.map((w: { name: string }) => w.name)).toEqual(['F'])
    })
  })

  describe('GET /api/runs', () => {
    it('answers a workspace’s runs with counts and the result filter', async () => {
      const wf = (await mockDb.createWorkflow({
        id: 'wf-1',
        projectId: TEST_PROJECT_ID,
        createdBy: TEST_USER_ID,
        name: 'A',
      }))!
      for (const [id, status] of [
        ['r-1', 'complete'],
        ['r-2', 'errored'],
        ['r-3', 'running'],
      ] as const) {
        await mockDb.createRun({
          id,
          workflowId: wf.id,
          versionId: 'v',
          connectionId: 'c',
          instanceId: id,
          status,
        })
      }
      const res = await app.request(
        `${byId('/api/runs')}&workspace=default&result=failed&period=7d`,
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.counts).toEqual({ all: 3, succeeded: 1, failed: 1, running: 1 })
      expect(body.data.map((r: { id: string }) => r.id)).toEqual(['r-2'])
      expect(body.data[0]).toMatchObject({ workflowName: 'A', kind: 'workflow' })
    })

    it('still lists the project’s runs plainly, and refuses filters without a workspace', async () => {
      const plain = await app.request(byId('/api/runs'))
      expect(plain.status).toBe(200)
      expect(await plain.json()).toEqual({ data: [], nextCursor: null })
      expect((await app.request(`${byId('/api/runs')}&result=failed`)).status).toBe(400)
    })
  })

  describe('API keys', () => {
    const PROJECT_KEY = 'ask_ws-project'
    const ORG_KEY = 'ask_ws-org'

    beforeEach(async () => {
      await mockDb.createApiKey({
        id: 'k-p',
        level: 'project',
        organizationId: TEST_ORG_ID,
        projectId: TEST_PROJECT_ID,
        createdBy: TEST_USER_ID,
        name: 'project',
        keyHash: await hashApiKey(PROJECT_KEY),
        keyPrefix: PROJECT_KEY.slice(0, 8),
        scopes: '["read","write"]',
        permissions: JSON.stringify(presetPermissions('project', 'full')),
      })
      await mockDb.createApiKey({
        id: 'k-o',
        level: 'organization',
        organizationId: TEST_ORG_ID,
        createdBy: TEST_USER_ID,
        name: 'org',
        keyHash: await hashApiKey(ORG_KEY),
        keyPrefix: ORG_KEY.slice(0, 8),
        scopes: '["read","write"]',
        permissions: JSON.stringify(presetPermissions('organization', 'full')),
      })
    })

    it('lets a project key manage its project’s workspaces by its write scope', async () => {
      const headers = { Authorization: `Bearer ${PROJECT_KEY}`, 'Content-Type': 'application/json' }
      const list = await app.request('/api/workspaces', { headers })
      expect(list.status).toBe(200)
      const create = await app.request('/api/workspaces', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'From key' }),
      })
      expect(create.status).toBe(201)
      const created = await create.json()
      const get = await app.request(`/api/workspaces/${created.id}`, { headers })
      expect(get.status).toBe(200)
    })

    it('acts with its creator’s standing: a member’s key cannot manage workspaces', async () => {
      setTestOrgRole('member')
      const headers = { Authorization: `Bearer ${PROJECT_KEY}`, 'Content-Type': 'application/json' }
      const create = await app.request('/api/workspaces', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'From a member key' }),
      })
      expect(create.status).toBe(403)
      expect((await create.json()).error).toMatch(/project admins/)
      // Reading is still fine, as the member's session could.
      expect((await app.request('/api/workspaces', { headers })).status).toBe(200)
    })

    it('never hands a key the member roster', async () => {
      const headers = { Authorization: `Bearer ${PROJECT_KEY}` }
      const { data } = await (await app.request('/api/workspaces', { headers })).json()
      expect(data[0].members).toEqual([])
      // The organization's projects are an organization key's to list (B3).
      const projects = await (
        await app.request('/api/projects', { headers: { Authorization: `Bearer ${ORG_KEY}` } })
      ).json()
      expect(projects.data[0].members).toEqual([])
      // A session sees it.
      const mine = await (await app.request(byId('/api/workspaces'))).json()
      expect(mine.data[0].members).toHaveLength(1)
    })

    it('refuses an organization key, which carries no project', async () => {
      const headers = { Authorization: `Bearer ${ORG_KEY}` }
      expect((await app.request('/api/workspaces', { headers })).status).toBe(403)
      expect((await app.request(`/api/workspaces/${TEST_WORKSPACE_ID}`, { headers })).status).toBe(
        403,
      )
    })

    it('keeps the dashboard reads to sessions', async () => {
      const headers = { Authorization: `Bearer ${PROJECT_KEY}` }
      expect((await app.request(`/api/scope?org=${TEST_ORG_SLUG}`, { headers })).status).toBe(403)
      expect((await app.request('/api/orgs', { headers })).status).toBe(403)
      // Failing runs span the org, wider than a project key's pin.
      expect((await app.request('/api/failing', { headers })).status).toBe(403)
      expect((await app.request(`/api/failing?org=${TEST_ORG_SLUG}`)).status).toBe(200)
    })
  })
})
