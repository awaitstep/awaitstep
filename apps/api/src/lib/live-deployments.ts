import type { LiveDeployment } from '@awaitstep/ir'
import type { LiveDeploymentRow } from '@awaitstep/db'
import { resolveProvider } from './provider-resolver.js'

/**
 * What is live on each account, as a page reads it (D-8): the worker's URL
 * stays on the server; the page learns only whether AwaitStep can call it,
 * as the account's provider judges the URL.
 */
export function liveDeploymentRecords(rows: LiveDeploymentRow[]): LiveDeployment[] {
  return rows.map(({ serviceUrl, provider, ...row }) => ({
    ...row,
    callable: serviceUrl !== null && canCall(provider, serviceUrl),
  }))
}

function canCall(provider: string, url: string): boolean {
  try {
    return resolveProvider(provider).canCallUrl?.(url) ?? false
  } catch {
    // An account of a provider this deployment doesn't run: nothing to call it with.
    return false
  }
}
