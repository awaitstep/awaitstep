import { Hono } from 'hono'
import { INBOX_LIMIT, renderNotification, type InboxPage } from '@awaitstep/ir'
import type { AppEnv } from '../types.js'

// The Inbox (B8): `GET /notifications?org=`, read marks. A person's own —
// session only (the router), in the organization the query names.

export const notifications = new Hono<AppEnv>()

notifications.get('/', async (c) => {
  const list = await c
    .get('db')
    .listNotifications(c.get('organizationId'), c.get('userId'), INBOX_LIMIT)
  const now = new Date()
  const page: InboxPage = {
    data: list.rows.map((row) => renderNotification(row, now)),
    counts: list.counts,
  }
  return c.json(page)
})

/** The shell's badge: one count, not the list. */
notifications.get('/count', async (c) => {
  const unread = await c
    .get('db')
    .countUnreadNotifications(c.get('organizationId'), c.get('userId'))
  return c.json({ unread })
})

notifications.post('/read-all', async (c) => {
  const updated = await c
    .get('db')
    .markAllNotificationsRead(c.get('organizationId'), c.get('userId'), new Date().toISOString())
  return c.json({ updated })
})

notifications.post('/:id/read', async (c) => {
  const marked = await c
    .get('db')
    .markNotificationRead(
      c.get('organizationId'),
      c.get('userId'),
      c.req.param('id'),
      new Date().toISOString(),
    )
  if (!marked) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})
