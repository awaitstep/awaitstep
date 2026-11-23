import type { DatabaseAdapter } from '@awaitstep/db'
import type { AppExtension, ExtensionHooks } from '../types.js'
import { createLogger } from './logger.js'

const log = createLogger('extensions')

// The hooks the running app's extensions carry, set once at startup by
// `useExtensionHooks`. Module state, like the extensions' providers: an
// organization is created inside the auth library, which the entry point
// builds before any app exists.
let installed: readonly { id: string; hooks: ExtensionHooks }[] = []

/** Installs the extensions' hooks, replacing any set an earlier app installed. */
export function useExtensionHooks(extensions: readonly AppExtension[]): void {
  installed = extensions.flatMap((extension) =>
    extension.hooks ? [{ id: extension.id, hooks: extension.hooks }] : [],
  )
}

async function run<K extends keyof ExtensionHooks>(
  name: K,
  event: Parameters<NonNullable<ExtensionHooks[K]>>[0],
): Promise<void> {
  for (const { id, hooks } of installed) {
    const hook = hooks[name] as ((event: unknown) => Promise<void>) | undefined
    if (!hook) continue
    try {
      await hook(event)
    } catch (err) {
      // What was created stays created: an extension's failure is its own to repair.
      log.error(`Extension "${id}" failed in its ${name} hook`, err)
    }
  }
}

/** Tells every extension an organization now exists. Never throws. */
export function organizationCreated(
  db: DatabaseAdapter,
  event: { organizationId: string; userId: string },
): Promise<void> {
  return run('organizationCreated', { db, ...event })
}

/** Tells every extension a project now exists. Never throws. */
export function projectCreated(
  db: DatabaseAdapter,
  event: { organizationId: string; projectId: string; userId: string },
): Promise<void> {
  return run('projectCreated', { db, ...event })
}
