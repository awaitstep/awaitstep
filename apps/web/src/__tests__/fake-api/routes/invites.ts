import { apiError } from '../responses'
import type { FakeApiContext, FakeRequest, RouteTable } from '../types'
import { viewerFixture } from './fixture-lookup'

/** Opening and answering an invite (P9), by its token. */
export function inviteRoutes(api: FakeApiContext): RouteTable {
  return {
    // A token with no fixture is one the API no longer knows.
    'GET /invitations/:token': (req: FakeRequest) =>
      api.data.inviteViews[req.params.token!] ?? { state: 'gone' },
    'POST /invitations/:token/accept': (req: FakeRequest) =>
      api.data.acceptedInvites[req.params.token!] ?? apiError(404, 'Not found'),
    'POST /invitations/:token/decline': { ok: true },
    'POST /invitations/:token/undo-decline': { ok: true },
    'POST /invitations/:token/ask-again': { ok: true },
    'GET /me/invitations': () => ({
      data: viewerFixture(api.data.myInvites, api.viewer, 'invitations'),
    }),
  }
}
