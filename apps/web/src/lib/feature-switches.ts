import type { AnyRouteMatch } from '@tanstack/react-router'
import type { OssFeature } from '@awaitstep/ir'
import { useInstanceStore } from '../stores/instance-store'

/** Whether the API instance leaves `feature` on (`GET /api/instance` → `disabled`). */
export function useFeatureOn(feature: OssFeature): boolean {
  return useInstanceStore((s) => !s.disabled.includes(feature))
}

/** The open-source features the API instance switches off. */
export function useDisabledFeatures(): readonly OssFeature[] {
  return useInstanceStore((s) => s.disabled)
}

/**
 * What the instance switches off, for a route's `head`: it runs before the
 * layout puts the answer in the store, so it reads the `_authed` match.
 */
export function disabledIn(matches: readonly AnyRouteMatch[]): readonly OssFeature[] {
  const loaderData = matches.find((match) => match.routeId === '/_authed')?.loaderData as
    { disabled?: readonly OssFeature[] } | undefined
  return loaderData?.disabled ?? []
}
