import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import type { AppEnv } from '../types.js'
import type { SelfHostedConnection } from '../app.js'

const createConnectionSchema = z.object({
  provider: z.string().min(1).max(100),
  credentials: z.record(z.string(), z.string()),
  name: z.string().min(1).max(255),
})

export function createConnectionRoutes(selfHostedConnection?: SelfHostedConnection) {
  const connections = new Hono<AppEnv>()

  connections.get('/', async (c) => {
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const list = await db.listConnectionsByOrganization(organizationId)
    return c.json(list.map(redactCredentials))
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
    return c.json(redactCredentials(conn), 201)
  })

  connections.post(
    '/verify-token',
    zValidator('json', z.object({
      provider: z.string().min(1),
      credentials: z.record(z.string(), z.string()),
    })),
    async (c) => {
      const { provider, credentials } = c.req.valid('json')

      if (provider === 'cloudflare') {
        return verifyCloudflareCredentials(c, credentials)
      }

      return c.json({ error: `Unsupported provider: ${provider}` }, 400)
    },
  )

  connections.get('/self-hosted', async (c) => {
    if (!selfHostedConnection) {
      return c.json({ configured: false })
    }

    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const existing = await db.listConnectionsByOrganization(organizationId)
    const alreadyRegistered = existing.some((conn) => {
      if (conn.provider !== 'cloudflare') return false
      const creds = JSON.parse(conn.credentials) as { accountId?: string }
      return creds.accountId === selfHostedConnection.accountId
    })

    return c.json({
      configured: true,
      registered: alreadyRegistered,
      accountId: selfHostedConnection.accountId,
      name: selfHostedConnection.name ?? 'Self-Hosted',
    })
  })

  connections.post('/self-hosted', async (c) => {
    if (!selfHostedConnection) {
      return c.json({ error: 'No self-hosted connection configured' }, 400)
    }

    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const userId = c.get('userId')

    const existing = await db.listConnectionsByOrganization(organizationId)
    const alreadyRegistered = existing.find((conn) => {
      if (conn.provider !== 'cloudflare') return false
      const creds = JSON.parse(conn.credentials) as { accountId?: string }
      return creds.accountId === selfHostedConnection.accountId
    })
    if (alreadyRegistered) {
      return c.json(redactCredentials(alreadyRegistered))
    }

    const conn = await db.createConnection({
      id: nanoid(),
      organizationId,
      createdBy: userId,
      provider: 'cloudflare',
      credentials: JSON.stringify({
        accountId: selfHostedConnection.accountId,
        apiToken: selfHostedConnection.apiToken,
      }),
      name: selfHostedConnection.name ?? 'Self-Hosted',
    })
    return c.json(redactCredentials(conn), 201)
  })

  connections.patch('/:id', zValidator('json', z.object({
    name: z.string().min(1).max(255).optional(),
    credentials: z.record(z.string(), z.string()).optional(),
  })), async (c) => {
    const db = c.get('db')
    const id = c.req.param('id')
    const body = c.req.valid('json')

    const updates: { name?: string; credentials?: string } = {}
    if (body.name) updates.name = body.name
    if (body.credentials) updates.credentials = JSON.stringify(body.credentials)

    const conn = await db.updateConnection(id, updates)
    if (!conn) return c.json({ error: 'Not found' }, 404)
    return c.json(redactCredentials(conn))
  })

  connections.delete('/:id', async (c) => {
    const db = c.get('db')
    await db.deleteConnection(c.req.param('id'))
    return c.json({ ok: true })
  })

  return connections
}

async function verifyCloudflareCredentials(
  c: Context,
  credentials: Record<string, string>,
) {
  const apiToken = credentials.apiToken
  if (!apiToken) {
    return c.json({ valid: false, accounts: [] }, 200)
  }

  const CF_BASE = 'https://api.cloudflare.com/client/v4'
  const headers = { Authorization: `Bearer ${apiToken}` }

  const verifyRes = await fetch(`${CF_BASE}/user/tokens/verify`, { headers })
  if (!verifyRes.ok) {
    return c.json({ valid: false, accounts: [] }, 200)
  }
  const verify = (await verifyRes.json()) as { result: { status: string } }
  if (verify.result?.status !== 'active') {
    return c.json({ valid: false, accounts: [] }, 200)
  }

  const accountsRes = await fetch(`${CF_BASE}/accounts?per_page=50`, { headers })
  if (!accountsRes.ok) {
    return c.json({ valid: true, accounts: [] }, 200)
  }
  const accountsData = (await accountsRes.json()) as { result: { id: string; name: string }[] }

  return c.json({
    valid: true,
    accounts: (accountsData.result ?? []).map((a) => ({ id: a.id, name: a.name })),
  })
}

const SAFE_CREDENTIAL_FIELDS = new Set(['accountId', 'accountName', 'name', 'provider', 'region', 'email'])

function redactCredentials(conn: { credentials: string; [key: string]: unknown }) {
  const creds = JSON.parse(conn.credentials) as Record<string, string>
  const redacted: Record<string, string> = {}
  for (const [key, value] of Object.entries(creds)) {
    redacted[key] = SAFE_CREDENTIAL_FIELDS.has(key) ? value : '***'
  }
  return { ...conn, credentials: redacted }
}
