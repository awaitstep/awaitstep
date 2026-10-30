import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import type { AppEnv } from '../types.js'
import { createLogger } from '../lib/logger.js'
import { recordAudit } from '../lib/audit.js'
import { abandonVerifyGate, closeVerifyGate, openVerifyGate } from '../lib/verify-lockout.js'

const createConnectionSchema = z.object({
  provider: z.string().min(1).max(100),
  credentials: z.record(z.string(), z.string()),
  name: z.string().min(1).max(255),
})

export function createConnectionRoutes() {
  const connections = new Hono<AppEnv>()

  connections.get('/', zValidator('query', paginationQuerySchema), async (c) => {
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const { cursor, limit } = c.req.valid('query')
    const result = await db.listConnectionsByOrganization(organizationId, { cursor, limit })
    return c.json({ data: result.data.map(redactCredentials), nextCursor: result.nextCursor })
  })

  connections.post('/', zValidator('json', createConnectionSchema), async (c) => {
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const userId = c.get('userId')
    const body = c.req.valid('json')
    const conn = await db.createConnection({
      id: nanoid(),
      organizationId,
      createdBy: userId,
      provider: body.provider,
      credentials: JSON.stringify(body.credentials),
      name: body.name,
    })
    await recordAudit(c, {
      event: 'connection.create',
      facts: { name: body.name, provider: body.provider },
    })
    return c.json(redactCredentials(conn), 201)
  })

  connections.post(
    '/verify-token',
    zValidator(
      'json',
      z.object({
        provider: z.string().min(1),
        credentials: z.record(z.string(), z.string()),
      }),
    ),
    async (c) => {
      const { provider, credentials } = c.req.valid('json')
      if (provider !== 'cloudflare') {
        return c.json({ error: `Unsupported provider: ${provider}` }, 400)
      }

      // Locked callers are refused before anything reaches Cloudflare (SA-12).
      const gate = await openVerifyGate(c, 'Cloudflare')
      if (gate instanceof Response) return gate
      let result: VerifyResult
      try {
        result = await verifyCloudflareCredentials(credentials)
      } catch (error) {
        await abandonVerifyGate(c, gate)
        throw error
      }
      await closeVerifyGate(c, gate, 'Cloudflare', result.valid)
      return c.json(result)
    },
  )

  connections.patch(
    '/:id',
    zValidator(
      'json',
      z.object({
        name: z.string().min(1).max(255).optional(),
        credentials: z.record(z.string(), z.string()).optional(),
      }),
    ),
    async (c) => {
      const db = c.get('db')
      const id = c.req.param('id')
      const body = c.req.valid('json')

      const updates: { name?: string; credentials?: string } = {}
      if (body.name) updates.name = body.name
      if (body.credentials) updates.credentials = JSON.stringify(body.credentials)

      const conn = await db.updateConnection(id, updates)
      if (!conn) return c.json({ error: 'Not found' }, 404)
      const before = c.get('connection')
      const change = [
        body.name && before && body.name !== before.name ? `Renamed from ${before.name}` : null,
        body.credentials ? 'Credentials changed' : null,
      ].filter((part): part is string => part !== null)
      if (change.length > 0) {
        await recordAudit(c, {
          event: 'connection.update',
          facts: { name: conn.name, change: change.join(', ') },
        })
      }
      return c.json(redactCredentials(conn))
    },
  )

  connections.delete('/:id', async (c) => {
    const db = c.get('db')
    // A delete that found the row already gone (a concurrent one) records nothing.
    if (await db.deleteConnection(c.req.param('id'))) {
      await recordAudit(c, {
        event: 'connection.delete',
        facts: { name: c.get('connection')?.name ?? c.req.param('id') },
      })
    }
    return c.json({ ok: true })
  })

  return connections
}

interface VerifyResult {
  valid: boolean
  accounts: { id: string; name: string }[]
}

async function verifyCloudflareCredentials(
  credentials: Record<string, string>,
): Promise<VerifyResult> {
  const apiToken = credentials.apiToken
  if (!apiToken) {
    return { valid: false, accounts: [] }
  }

  const CF_BASE = 'https://api.cloudflare.com/client/v4'
  const headers = { Authorization: `Bearer ${apiToken}` }

  const verifyRes = await fetch(`${CF_BASE}/user/tokens/verify`, { headers })
  if (!verifyRes.ok) {
    return { valid: false, accounts: [] }
  }
  const verify = (await verifyRes.json()) as { result: { status: string } }
  if (verify.result?.status !== 'active') {
    return { valid: false, accounts: [] }
  }

  const accountsRes = await fetch(`${CF_BASE}/accounts?per_page=50`, { headers })
  if (!accountsRes.ok) {
    return { valid: true, accounts: [] }
  }
  const accountsData = (await accountsRes.json()) as { result: { id: string; name: string }[] }

  return {
    valid: true,
    accounts: (accountsData.result ?? []).map((a) => ({ id: a.id, name: a.name })),
  }
}

const SAFE_CREDENTIAL_FIELDS = new Set([
  'accountId',
  'accountName',
  'name',
  'provider',
  'region',
  'email',
])

function redactCredentials(conn: { credentials: string; [key: string]: unknown }) {
  try {
    const creds = JSON.parse(conn.credentials) as Record<string, string>
    const redacted: Record<string, string> = {}
    for (const [key, value] of Object.entries(creds)) {
      redacted[key] = SAFE_CREDENTIAL_FIELDS.has(key) ? value : '***'
    }
    return { ...conn, credentials: redacted }
  } catch (error) {
    createLogger('redactCredentials').error('failed', error)
    return { ...conn, credentials: '****' }
  }
}
