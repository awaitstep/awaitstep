import { describe, it, expect, beforeEach } from 'vitest'
import {
  createTestApp,
  resetStore,
  setTestOrgRole,
  TEST_ORG_ID,
  TEST_ORG_SLUG,
  TEST_PROJECT_ID,
  TEST_PROJECT_SLUG,
  TEST_USER_ID,
  TEST_WORKSPACE_ID,
} from './helpers.js'
import { parseOrgRole } from '../lib/org-role.js'
import { orgSlugProblem } from '../lib/slugs.js'

describe('orgSlugProblem', () => {
  it('holds organization slugs to the shape and the reserved top-level paths', () => {
    expect(orgSlugProblem('acme')).toBeNull()
    expect(orgSlugProblem('settings')).toMatch(/taken by a page/)
    expect(orgSlugProblem('sign-in')).toMatch(/taken by a page/)
    expect(orgSlugProblem('Has Spaces')).toMatch(/lowercase letters/)
    expect(orgSlugProblem('')).toBeTruthy()
    expect(orgSlugProblem(undefined)).toBe('An organization needs a URL')
  })
})

describe('parseOrgRole', () => {
  it('takes the highest of a comma-joined list and reads anything else as member', () => {
    expect(parseOrgRole('owner')).toBe('owner')
    expect(parseOrgRole('admin,member')).toBe('admin')
    expect(parseOrgRole('member, owner')).toBe('owner')
    expect(parseOrgRole('')).toBe('member')
    expect(parseOrgRole(null)).toBe('member')
    expect(parseOrgRole('superuser')).toBe('member')
  })
})

describe('GET /api/scope', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(() => {
    resetStore()
    app = createTestApp()
  })

  it('resolves the org alone', async () => {
    const res = await app.request(`/api/scope?org=${TEST_ORG_SLUG}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.found).toBe(true)
    expect(body.org).toMatchObject({
      id: TEST_ORG_ID,
      slug: TEST_ORG_SLUG,
      role: 'owner',
      projectCount: 1,
      memberCount: 1,
    })
    expect(body.org.viewerCan.manageSettings.allowed).toBe(true)
    expect(body.org.members).toEqual([
      { id: TEST_USER_ID, name: 'Test', email: 'test@example.com', image: null, role: 'owner' },
    ])
    expect(body.project).toBeUndefined()
  })

  it('resolves every level with its record and capabilities', async () => {
    const res = await app.request(
      `/api/scope?org=${TEST_ORG_SLUG}&project=${TEST_PROJECT_SLUG}&workspace=default`,
    )
    const body = await res.json()
    expect(body.found).toBe(true)
    expect(body.project).toMatchObject({
      id: TEST_PROJECT_ID,
      slug: TEST_PROJECT_SLUG,
      workspaces: [{ id: TEST_WORKSPACE_ID, slug: 'default', name: 'Default', colour: 'green' }],
      health: { workflows: 0, deployed: 0, failing: 0, lastRunAt: null },
      lock: null,
      viewerRole: 'admin',
    })
    expect(body.project.viewerCan.createWorkspace.allowed).toBe(true)
    expect(body.workspace).toMatchObject({
      id: TEST_WORKSPACE_ID,
      slug: 'default',
      createdBy: { id: TEST_USER_ID, name: 'Test' },
      inheritedLock: null,
      viewerRole: 'admin',
    })
    expect(body.workspace.viewerCan.delete.reason).toMatch(/last workspace/)
  })

  it('reads a member as a project member and workspace editor', async () => {
    setTestOrgRole('member')
    const body = await (
      await app.request(
        `/api/scope?org=${TEST_ORG_SLUG}&project=${TEST_PROJECT_SLUG}&workspace=default`,
      )
    ).json()
    expect(body.org.role).toBe('member')
    expect(body.project.viewerRole).toBe('member')
    expect(body.project.viewerCan.manageSettings.allowed).toBe(false)
    expect(body.workspace.viewerRole).toBe('editor')
    expect(body.workspace.viewerCan.edit.allowed).toBe(true)
    expect(body.workspace.viewerCan.manageSettings.allowed).toBe(false)
  })

  it('names the missing level and its parent', async () => {
    const workspace = await (
      await app.request(
        `/api/scope?org=${TEST_ORG_SLUG}&project=${TEST_PROJECT_SLUG}&workspace=nope`,
      )
    ).json()
    expect(workspace).toEqual({
      found: false,
      notFound: {
        kind: 'workspace',
        slug: 'nope',
        parent: { name: 'Test Project', slug: TEST_PROJECT_SLUG },
      },
    })
    const project = await (await app.request(`/api/scope?org=${TEST_ORG_SLUG}&project=nope`)).json()
    expect(project.notFound).toEqual({
      kind: 'project',
      slug: 'nope',
      parent: { name: 'Test Org', slug: TEST_ORG_SLUG },
    })
    const org = await (await app.request('/api/scope?org=nope')).json()
    expect(org.notFound).toEqual({ kind: 'organization', slug: 'nope', parent: null })
  })

  it('needs an org, and a project under a workspace', async () => {
    expect((await app.request('/api/scope')).status).toBe(422)
    expect((await app.request(`/api/scope?org=${TEST_ORG_SLUG}&workspace=default`)).status).toBe(
      400,
    )
  })
})

describe('GET /api/orgs', () => {
  it('lists the session’s organizations with role and counts', async () => {
    resetStore()
    const app = createTestApp()
    const res = await app.request('/api/orgs')
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({
      slug: TEST_ORG_SLUG,
      role: 'owner',
      projectCount: 1,
      memberCount: 1,
      grants: { projects: [], workspaces: [] },
      health: { failing: 0, lastRunAt: null },
    })
    expect(data[0].viewerCan.createProject.allowed).toBe(true)
  })
})

describe('GET /api/failing', () => {
  it('answers for the org by slug', async () => {
    resetStore()
    const app = createTestApp()
    const res = await app.request(`/api/failing?org=${TEST_ORG_SLUG}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: [] })
    expect((await app.request('/api/failing?org=elsewhere')).status).toBe(404)
  })
})
