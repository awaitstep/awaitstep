import { Hono } from 'hono'
import { isExtensionId } from '@awaitstep/ir'
import type { AppEnv, AppExtension, ScheduledContext } from '../types.js'
import type { Logger } from './logger.js'

/**
 * Refuses, at startup, a set of extensions the app could not mount
 * unambiguously: an id that is not a URL segment, or one used twice.
 */
export function checkExtensions(extensions: readonly AppExtension[]): void {
  const seen = new Set<string>()
  for (const { id } of extensions) {
    if (!isExtensionId(id)) {
      throw new Error(
        `Extension id "${id}" is not valid: use lowercase letters, digits and dashes (at most 64).`,
      )
    }
    if (seen.has(id)) throw new Error(`Extension id "${id}" is registered twice.`)
    seen.add(id)
  }
}

/** Mounts each extension's routes on `router` under `/ext/<id>`. */
export function mountExtensions(router: Hono<AppEnv>, extensions: readonly AppExtension[]): void {
  for (const extension of extensions) {
    if (!extension.routes) continue
    const sub = new Hono<AppEnv>()
    extension.routes(sub)
    router.route(`/ext/${extension.id}`, sub)
  }
}

/**
 * Runs every extension's scheduled hook. One failing is logged and does not
 * stop the others, nor reject: the core's own cron jobs settle beside it.
 */
export async function runScheduledExtensions(
  extensions: readonly AppExtension[],
  ctx: ScheduledContext,
  log: Logger,
): Promise<void> {
  const hooked = extensions.filter((extension) => extension.scheduled)
  // async: a hook that throws before returning its promise becomes a rejection, not a throw out of map.
  const results = await Promise.allSettled(
    hooked.map(async (extension) => extension.scheduled!(ctx)),
  )
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason)
      log.error('Extension scheduled hook failed', { extension: hooked[i]!.id, error: reason })
    }
  })
}

/**
 * The Node entries' counterpart of the Worker cron: runs the extensions'
 * scheduled hooks every `intervalMs` (a minute, like the cron). Returns the
 * stop function; with no hooked extension it starts no timer.
 */
export function startScheduledExtensionsLoop(
  extensions: readonly AppExtension[],
  ctx: Omit<ScheduledContext, 'now'>,
  log: Logger,
  intervalMs = 60_000,
): () => void {
  if (!extensions.some((extension) => extension.scheduled)) return () => {}
  const tick = () => void runScheduledExtensions(extensions, { ...ctx, now: new Date() }, log)
  const timer = setInterval(tick, intervalMs)
  if (typeof timer.unref === 'function') timer.unref()
  return () => clearInterval(timer)
}
