import { invitations, personAccess } from '../../fixtures/api/org-settings'
import { apiError } from '../responses'
import type { FakeApiContext, FakeRequest, RouteTable } from '../types'

/** Org Settings: a person's access, invitations, the logo, and the writes' plain answers. */
export function orgSettingsRoutes(api: FakeApiContext): RouteTable {
  const seed = () => api.data.seed
  const orgOf = (req: FakeRequest) => seed().orgs.find((o) => o.slug === req.query.org)
  return {
    'GET /members/:id/access': (req: FakeRequest) => {
      const org = orgOf(req)
      const access = org && personAccess(seed(), org.id, req.params.id!)
      return access ?? apiError(404, 'Not found')
    },
    'PUT /members/:id/access': { ok: true },
    'DELETE /members/:id': { ok: true },
    'GET /invitations': (req: FakeRequest) => {
      const org = orgOf(req)
      return org ? { data: invitations(seed(), org.id) } : apiError(404, 'Not found')
    },
    'POST /invitations': (req: FakeRequest) => ({
      data: (req.body as { emails: string[] }).emails.map((email, i) => ({
        id: `inv_new_${i}`,
        email,
      })),
    }),
    'POST /invitations/:id/resend': { ok: true },
    'DELETE /invitations/:id': { ok: true },
    'PUT /orgs/:id/logo': { logo: 'data:image/png;base64,iVBORw0KGgo=' },
    'DELETE /orgs/:id/logo': { logo: null },
    'POST /connections': (req: FakeRequest) => ({
      id: 'conn_new',
      ...(req.body as object),
    }),
    'PATCH /connections/:id': (req: FakeRequest) => ({
      id: req.params.id,
      ...(req.body as object),
    }),
    'DELETE /connections/:id': { ok: true },
  }
}
