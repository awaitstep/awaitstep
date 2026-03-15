import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import type { AppEnv } from '../types.js'

const createConnectionSchema = z.object({
  accountId: z.string().min(1).max(100),
  apiToken: z.string().min(1),
  name: z.string().min(1).max(255),
})

export const connections = new Hono<AppEnv>()

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

connections.delete('/:id', async (c) => {
  const db = c.get('db')
  await db.deleteConnection(c.req.param('id'))
  return c.json({ ok: true })
})

function redactToken(conn: { apiToken: string; [key: string]: unknown }) {
  return { ...conn, apiToken: '***' }
}
