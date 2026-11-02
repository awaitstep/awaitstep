import { Hono, type Context } from 'hono'
import { orgCapabilities } from '@awaitstep/ir'
import { LOGO_RULE } from '@awaitstep/storage'
import type { AppEnv } from '../types.js'
import { parseOrgRole } from '../lib/org-role.js'
import { recordAudit } from '../lib/audit.js'
import { imageBodyLimit, readImageUpload } from '../lib/image-upload.js'
import { IMAGE_RACE, clearOwnerImage, saveOwnerImage } from '../lib/images.js'

// An organization's logo (`/api/orgs/:orgId/logo`), session only. Who may
// set or clear it is who may rename the organization: its owners and
// admins. The name and URL still go through better-auth's update, whose
// hook refuses a logo there.

/** The organization, when the caller may change its settings; else the refusal. */
async function managedOrg(
  c: Context<AppEnv>,
): Promise<{ org: { id: string; name: string } } | { refusal: Response }> {
  const org = await c
    .get('db')
    .getOrganizationIfMember(c.get('userId'), { id: c.req.param('orgId')! })
  if (!org) return { refusal: c.json({ error: 'Not found' }, 404) }
  const can = orgCapabilities(parseOrgRole(org.role)).manageSettings
  if (!can.allowed) return { refusal: c.json({ error: can.reason ?? 'Forbidden' }, 403) }
  return { org }
}

export const orgLogo = new Hono<AppEnv>()

/** Uploads the logo: the image as the body. Answers its path. */
orgLogo.put('/:orgId/logo', imageBodyLimit(LOGO_RULE, 'logo'), async (c) => {
  const found = await managedOrg(c)
  if ('refusal' in found) return found.refusal
  const upload = await readImageUpload(c, LOGO_RULE)
  if ('problem' in upload) return c.json({ error: upload.problem, field: 'logo' }, 400)
  const owner = { kind: 'org' as const, id: found.org.id }
  const logo = await saveOwnerImage(
    c.get('db'),
    c.get('imageStore'),
    owner,
    upload.bytes,
    upload.info,
  )
  if (!logo) return c.json({ error: IMAGE_RACE }, 409)
  await recordAudit(c, {
    event: 'organization.update',
    facts: { name: found.org.name, change: 'New logo' },
    organizationId: found.org.id,
  })
  return c.json({ logo })
})

/** Removes the logo: the initial shows instead. */
orgLogo.delete('/:orgId/logo', async (c) => {
  const found = await managedOrg(c)
  if ('refusal' in found) return found.refusal
  await clearOwnerImage(c.get('db'), c.get('imageStore'), { kind: 'org', id: found.org.id })
  await recordAudit(c, {
    event: 'organization.update',
    facts: { name: found.org.name, change: 'Logo removed' },
    organizationId: found.org.id,
  })
  return c.json({ logo: null })
})
