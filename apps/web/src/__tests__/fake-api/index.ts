/**
 * The dashboard's API, faked for tests: it answers the `fetch` calls
 * `request()` / `dashboardApi` / `libraryApi` and better-auth's `authClient`
 * make, with fixtures shaped like the real JSON (`__tests__/fixtures/api/`).
 * Thin on purpose: fixtures plus trivial answers, no backend rules. A write
 * answers the endpoint's success body and changes nothing; a test that checks
 * a write asserts the request it sent.
 *
 * Migrating a page test from `renderWithDashboardData`:
 *
 *   const { api } = renderWithDashboardApi(<ProfilePage currentOrg="acme" />)
 *   // as someone else: renderWithDashboardApi(ui, { viewer: PRIYA })
 *
 * The page asks on its first render, so anything that render needs is set up
 * before it: pass `routes`, or install the fake first and hand it over.
 *
 *   renderWithDashboardApi(ui, { routes: { 'GET /account': apiError(500, 'Down') } })
 *   const api = installFakeApi({ viewer: DANIEL })
 *   api.data.accounts[DANIEL]!.person.emailVerified = false
 *   renderWithDashboardApi(ui, { api })
 *
 * Changing an answer from a point in the test on (the next call reads it):
 *
 *   api.data.accounts[AMA]!.person.emailVerified = false     // edit the fixture
 *   api.on('GET /account/sessions', { data: [] })            // or replace the route
 *   api.on('GET /invitations/:token', (req) => ({ state: 'gone' }))
 *
 * "After the save, the server says…" is the test's own script, written where
 * it is used — the fake never applies a write:
 *
 *   api.on('POST /account/orgs/:orgId/leave', () => {
 *     api.data.accounts[AMA]!.orgs = api.data.accounts[AMA]!.orgs.filter((o) => o.id !== BOLT)
 *     return { ok: true }
 *   })
 *
 * Asserting a write:
 *
 *   expect(api.lastRequest('POST /auth/update-user').body).toEqual({ name: 'Ama K. Mensah' })
 *   expect(api.requestsTo('PUT /account/photo')).toHaveLength(0)
 *
 * Errors and loading:
 *
 *   api.fail('GET /account', 503, 'The service didn’t answer in time.')   // `{ error }`
 *   api.on('POST /auth/update-user', authError(400, 'Name too long'))    // better-auth's `{ message }`
 *   api.on('POST /x', reply(409, { error: 'Taken', field: 'slug' }))
 *   api.hang('GET /account')                                             // stays loading
 *
 * Routes are `'METHOD /path/:param'`, the path as `dashboardApi` writes it
 * (no `/api`, no query; handlers read `req.query`). A call no route answers
 * gets a 404 and fails the test when it ends, as does a handler that throws
 * or a missing per-viewer fixture. Hook tests (`renderHook`) use
 * `installFakeApi()` with `dashboardApiWrapper()`.
 *
 * A slice moving a domain here adds `fixtures/api/<domain>.ts` (typed by the
 * API's own response types) and `fake-api/routes/<domain>.ts`, registered in
 * `routes/index.ts`. App code never imports this folder.
 */
export { createFakeApi, installFakeApi, type FakeApi, type FakeApiOptions } from './fake-api'
export {
  createTestQueryClient,
  dashboardApiWrapper,
  renderWithDashboardApi,
  signInAs,
  type RenderWithDashboardApiOptions,
} from './render-with-dashboard-api'
export { apiError, authError, pending, reply, type FakeReply } from './responses'
export { asOrgRole, asProjectRole, asWorkspaceRole } from './roles'
export type { FakeRequest, RouteAnswer, RouteHandler, RouteTable } from './types'
export * from '../fixtures/api'
