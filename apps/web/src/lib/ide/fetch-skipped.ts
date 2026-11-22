import type { LiveDeployment } from '@awaitstep/ir'

/**
 * Whether runs from AwaitStep skip a workflow's `handlers/fetch.ts`: it is
 * live, but on no account whose deploy has a URL AwaitStep can reach (a
 * route or custom domain), so runs start through the provider's API. Not
 * live anywhere is not said: there are no runs yet.
 */
export function fetchHandlerSkipped(
  kind: string | undefined,
  live: ReadonlyArray<Pick<LiveDeployment, 'callable'>>,
): boolean {
  return kind !== 'script' && live.length > 0 && !live.some((l) => l.callable)
}
