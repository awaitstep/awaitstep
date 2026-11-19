import { Hono } from 'hono'
import { isExtensionId } from '@awaitstep/ir'
import type { AppEnv, AppExtension } from '../types.js'

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
