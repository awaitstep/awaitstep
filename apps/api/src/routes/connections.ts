import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import type { AppEnv } from '../types.js'
import type { SelfHostedConnection } from '../app.js'

const createConnectionSchema = z.object({
  accountId: z.string().min(1).max(100),
  apiToken: z.string().min(1),
  name: z.string().min(1).max(255),
})

export function createConnectionRoutes(selfHostedConnection?: SelfHostedConnection) {
  const connections = new Hono<AppEnv>()

  connections.get('/', async (c) => {
    const db = c.get('db')
    const userId = c.get('userId')
    const list = await db.listConnectionsByUser(userId)
    return c.json(list.map(redactToken))
  })

  connections.post('/', zValidator('json', createConnectionSchema), async (c) => {
    const db = c.get('db')
    const userId = c.get('userId')
    const body = c.req.valid('json')
    const conn = await db.createConnection({
      id: nanoid(),
      userId,
      accountId: body.accountId,
      apiToken: body.apiToken,
      name: body.name,
    })
    return c.json(redactToken(conn), 201)
  })

  connections.post('/verify-token', zValidator('json', z.object({ apiToken: z.string().min(1) })), async (c) => {
    const { apiToken } = c.req.valid('json')
    const CF_BASE = 'https://api.cloudflare.com/client/v4'
    const headers = { Authorization: `Bearer ${apiToken}` }

    const verifyRes = await fetch(`${CF_BASE}/user/tokens/verify`, { headers })
    if (!verifyRes.ok) {
      return c.json({ valid: false, accounts: [] }, 200)
    }
    const verify = await verifyRes.json() as { result: { status: string } }
    if (verify.result?.status !== 'active') {
      return c.json({ valid: false, accounts: [] }, 200)
    }

    const accountsRes = await fetch(`${CF_BASE}/accounts?per_page=50`, { headers })
    if (!accountsRes.ok) {
      return c.json({ valid: true, accounts: [] }, 200)
    }
    const accountsData = await accountsRes.json() as { result: { id: string; name: string }[] }

    return c.json({
      valid: true,
      accounts: (accountsData.result ?? []).map((a) => ({ id: a.id, name: a.name })),
    })
  })

  connections.get('/self-hosted', async (c) => {
    if (!selfHostedConnection) {
      return c.json({ configured: false })
    }

    const db = c.get('db')
    const userId = c.get('userId')
    const existing = await db.listConnectionsByUser(userId)
    const alreadyRegistered = existing.some((conn) => conn.accountId === selfHostedConnection.accountId)

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
    const userId = c.get('userId')

    const existing = await db.listConnectionsByUser(userId)
    const alreadyRegistered = existing.find((conn) => conn.accountId === selfHostedConnection.accountId)
    if (alreadyRegistered) {
      return c.json(redactToken(alreadyRegistered))
    }

    const conn = await db.createConnection({
      id: nanoid(),
      userId,
      accountId: selfHostedConnection.accountId,
      apiToken: selfHostedConnection.apiToken,
      name: selfHostedConnection.name ?? 'Self-Hosted',
    })
    return c.json(redactToken(conn), 201)
  })

  connections.delete('/:id', async (c) => {
    const db = c.get('db')
    await db.deleteConnection(c.req.param('id'))
    return c.json({ ok: true })
  })

  return connections
}

function redactToken(conn: { apiToken: string; [key: string]: unknown }) {
  return { ...conn, apiToken: '***' }
}
