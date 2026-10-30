import { Hono } from 'hono'
import { z } from 'zod'
import type { ReleaseVisit } from '@awaitstep/ir'
import { zValidator } from '../lib/validation.js'
import type { AppEnv } from '../types.js'

// What's new (B8): the notes ship with the web app; the API keeps only when
// each person last looked and which notes they saw, so "New to you"
// follows them across devices — and a note shipped in a later upgrade is new
// however it is dated. Session only (the router).

const visitSchema = z.object({
  seen: z.array(z.string().min(1).max(100)).max(500),
})

export const releases = new Hono<AppEnv>()

releases.get('/visit', async (c) => {
  const row = await c.get('db').getReleaseVisit(c.get('userId'))
  const visit: ReleaseVisit = { lastVisit: row?.seenAt ?? null, seen: row?.seenIds ?? [] }
  return c.json(visit)
})

/** Closing What's new: now, and the ids of the notes it showed. */
releases.put('/visit', zValidator('json', visitSchema), async (c) => {
  const { seen } = c.req.valid('json')
  const row = await c
    .get('db')
    .setReleaseVisit(c.get('userId'), new Date().toISOString(), [...new Set(seen)])
  const visit: ReleaseVisit = { lastVisit: row.seenAt, seen: row.seenIds }
  return c.json(visit)
})
