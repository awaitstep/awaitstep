import { Hono } from 'hono'
import type { AppEnv } from '../types.js'
import { providerCapabilities } from '../lib/provider-registry.js'

export const providers = new Hono<AppEnv>()

/** Provider capabilities the dashboard renders: handler kinds, queue rules, schedules. */
providers.get('/', (c) => c.json({ providers: providerCapabilities() }))
