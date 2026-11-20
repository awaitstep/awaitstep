import { accountExport } from '../../fixtures/api'
import type { FakeApiContext, RouteTable } from '../types'
import { viewerFixture } from './fixture-lookup'

/** Your account (`/account/*`): reads from the viewer's fixtures; writes answer as the API does. */
export function accountRoutes(api: FakeApiContext): RouteTable {
  return {
    'GET /account': () => viewerFixture(api.data.accounts, api.viewer, 'account'),
    'POST /account/orgs/:orgId/leave': { ok: true },
    'PUT /account/photo': () => ({ image: `/api/images/${api.viewer}-photo.webp` }),
    'DELETE /account/photo': { image: null },
    'GET /account/sessions': () => ({
      data: viewerFixture(api.data.sessions, api.viewer, 'sessions'),
    }),
    'DELETE /account/sessions/:id': { ok: true },
    // `?scope=others`: how many it signed out.
    'DELETE /account/sessions': () => ({
      count: viewerFixture(api.data.sessions, api.viewer, 'sessions').filter((s) => !s.current)
        .length,
    }),
    'POST /account/export': () =>
      accountExport(
        api.now,
        viewerFixture(api.data.accounts, api.viewer, 'account'),
        viewerFixture(api.data.sessions, api.viewer, 'sessions'),
      ),
  }
}
