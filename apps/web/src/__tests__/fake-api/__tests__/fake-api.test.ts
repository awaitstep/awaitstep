import { describe, expect, it } from 'vitest'
import { ApiError, request } from '../../../lib/api-client'
import { dashboardApi } from '../../../lib/dashboard-api'
import { AMA, BOLT, PRIYA, apiError, createFakeApi, installFakeApi, reply, type FakeApi } from '..'
import { parseRoute } from '../route-pattern'

/** Calls the fake without failing the test on purpose-made problems. */
function call(api: FakeApi, path: string, init?: RequestInit) {
  return api.fetch(`/api${path}`, init)
}

describe('default answers', () => {
  it('answers GET /account with the viewer’s account fixture', async () => {
    installFakeApi()
    const account = await dashboardApi.getAccount()
    expect(account.person).toMatchObject({ id: AMA, email: 'ama@acme.test' })
    expect(account.orgs.map((o) => o.slug)).toEqual(['acme', 'bolt-labs'])
  })

  it('answers as another viewer when asked', async () => {
    installFakeApi({ viewer: PRIYA })
    expect((await dashboardApi.getAccount()).person.email).toBe('priya@acme.test')
  })

  it('reads the fixtures at request time, so editing them changes the next answer', async () => {
    const api = installFakeApi()
    api.data.accounts[AMA]!.person.emailVerified = false
    expect((await dashboardApi.getAccount()).person.emailVerified).toBe(false)
  })

  it('resolves GET /scope from the slugs, and names what is missing', async () => {
    installFakeApi()
    const scope = await dashboardApi.getScope({
      org: 'acme',
      project: 'project-101',
      workspace: 'it',
    })
    expect(scope.found && scope.workspace?.name).toBe('IT')
    expect(await dashboardApi.getScope({ org: 'acme', project: 'nope' })).toEqual({
      found: false,
      notFound: { kind: 'project', slug: 'nope', parent: { name: 'Acme Inc', slug: 'acme' } },
    })
  })

  it('builds fresh fixtures for every fake', () => {
    const first = createFakeApi()
    first.data.accounts[AMA]!.orgs = []
    expect(createFakeApi().data.accounts[AMA]!.orgs).toHaveLength(2)
  })
})

describe('recording requests', () => {
  it('records the method, path, query and parsed JSON body of each call', async () => {
    const api = installFakeApi({ routes: { 'PUT /releases/visit': { ok: true } } })
    await dashboardApi.revokeOtherAccountSessions()
    await request('/releases/visit', { method: 'PUT', body: JSON.stringify({ seen: ['a'] }) })
    expect(api.lastRequest('DELETE /account/sessions')).toMatchObject({
      method: 'DELETE',
      path: '/account/sessions',
      query: { scope: 'others' },
      body: undefined,
    })
    expect(api.requests[1]).toMatchObject({
      method: 'PUT',
      body: { seen: ['a'] },
      headers: expect.objectContaining({ 'content-type': 'application/json' }),
    })
  })

  it('matches recorded calls by pattern or by concrete path', async () => {
    const api = installFakeApi()
    await dashboardApi.leaveOrg(BOLT)
    expect(api.requestsTo('POST /account/orgs/:orgId/leave')).toHaveLength(1)
    expect(api.lastRequest(`POST /account/orgs/${BOLT}/leave`).params).toEqual({ orgId: BOLT })
    expect(api.requestsTo('POST /account/orgs/org_acme/leave')).toHaveLength(0)
  })

  it('says which requests it saw when none matched', async () => {
    const api = installFakeApi()
    await dashboardApi.getAccount()
    expect(() => api.lastRequest('POST /account/export')).toThrow(
      'no request matched POST /account/export. Requests: GET /account',
    )
  })
})

describe('overrides and errors', () => {
  it('answers a per-test route over the default, the newest one winning', async () => {
    const api = installFakeApi({ routes: { 'GET /account/sessions': { data: [] } } })
    expect((await dashboardApi.listAccountSessions()).data).toEqual([])
    api.on('GET /account/sessions', () => ({ data: [{ id: 'ses_x' }] }))
    expect((await dashboardApi.listAccountSessions()).data).toEqual([{ id: 'ses_x' }])
  })

  it('turns fail() into the API’s { error } refusal, read as an ApiError', async () => {
    const api = installFakeApi()
    api.fail('GET /account', 503, 'The service didn’t answer in time.')
    const failure = await dashboardApi.getAccount().catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({ status: 503, message: 'The service didn’t answer in time.' })
  })

  it('keeps a reply’s status and extra fields', async () => {
    const api = installFakeApi()
    api.on('POST /account/orgs/:orgId/leave', reply(409, { error: 'Keep an owner', field: 'org' }))
    await expect(dashboardApi.leaveOrg(BOLT)).rejects.toMatchObject({ status: 409, field: 'org' })
  })
})

describe('failing loudly', () => {
  it('answers a call no route knows with a 404 naming it, and lists it as a problem', async () => {
    const api = createFakeApi()
    const res = await call(api, '/nowhere?x=1')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Fake API: no route for GET /nowhere' })
    expect(() => api.assertNoProblems()).toThrow('no route for GET /nowhere')
  })

  it('lists a call outside the API as a problem', async () => {
    const api = createFakeApi()
    await api.fetch('https://registry.example/index.json')
    expect(api.problems).toEqual(['Fake API: no route for GET https://registry.example/index.json'])
  })

  it('lists a handler that throws, or answers nothing, as a problem', async () => {
    const api = createFakeApi()
    api.on('GET /boom', () => {
      throw new Error('bad fixture')
    })
    api.on('GET /empty', () => undefined)
    expect((await call(api, '/boom')).status).toBe(500)
    await call(api, '/empty')
    expect(api.problems).toEqual([
      'Fake API: GET /boom failed: bad fixture',
      'Fake API: GET /empty failed: the handler for GET /empty returned nothing',
    ])
  })

  it('lists a viewer with no fixture as a problem rather than answering for someone else', async () => {
    const api = createFakeApi({ viewer: 'usr_tom' })
    expect((await call(api, '/account')).status).toBe(500)
    expect(api.problems[0]).toContain('no account fixture for usr_tom')
  })

  it('is quiet when every call was answered', async () => {
    const api = createFakeApi()
    await call(api, '/account')
    expect(() => api.assertNoProblems()).not.toThrow()
    expect(apiError(400, 'x', { field: 'name' }).body).toEqual({ error: 'x', field: 'name' })
  })
})

describe('route patterns', () => {
  it('refuses a route without a method or with a query', () => {
    expect(() => parseRoute('/account')).toThrow('METHOD /path/:param')
    expect(() => parseRoute('DELETE /account/sessions?scope=others')).toThrow('has a query')
  })

  it('decodes a path parameter', async () => {
    const api = createFakeApi()
    api.on('GET /things/:id', (req) => ({ id: req.params.id }))
    expect(await (await call(api, '/things/a%2Fb')).json()).toEqual({ id: 'a/b' })
  })
})
