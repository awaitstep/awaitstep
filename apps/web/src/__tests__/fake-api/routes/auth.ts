import { authSession } from '../../fixtures/api'
import type { FakeApiContext, FakeRequest, RouteTable } from '../types'

interface CreateOrgBody {
  name: string
  slug: string
}

/**
 * better-auth's own routes (`/api/auth/*`), which `authClient` calls: the
 * session, the name, providers, deletion and new orgs. Their success bodies.
 */
export function authRoutes(api: FakeApiContext): RouteTable {
  return {
    'GET /auth/get-session': () => authSession(api.now, api.viewer),
    'POST /auth/sign-out': { success: true },
    'POST /auth/update-user': { status: true },
    // Real shape: the client then sends the browser to `url`, which jsdom logs as
    // "Not implemented: navigation". A test clicking Connect answers
    // `{ url: '', redirect: false }` instead and asserts the request.
    'POST /auth/link-social': {
      url: 'https://github.com/login/oauth/authorize?client_id=test',
      redirect: true,
    },
    'POST /auth/unlink-account': { status: true },
    'POST /auth/delete-user': { success: true, message: 'User deleted' },
    'POST /auth/organization/update': (req: FakeRequest) => ({
      ...((req.body as { data?: object }).data ?? {}),
    }),
    'POST /auth/organization/create': (req: FakeRequest) => {
      const body = req.body as CreateOrgBody
      return {
        id: `org_${body.slug}`,
        name: body.name,
        slug: body.slug,
        logo: null,
        metadata: null,
        createdAt: api.now.toISOString(),
        members: [],
      }
    },
  }
}
