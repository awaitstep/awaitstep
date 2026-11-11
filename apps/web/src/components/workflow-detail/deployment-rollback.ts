import type { DeploymentSummary } from '../../lib/api-client'
import { deployBlockedReason } from './parts/deploy-link'

export interface RollBackRules {
  /** Each account's live deployment. */
  liveIds: ReadonlySet<string>
  /** Left out for someone who can't deploy: no Roll back. */
  rollBackHref?: (versionId: string, connectionId?: string) => string
  /** The version live on that account is locked: nothing replaces it there. */
  lockedOn: (connectionId: string | null) => boolean
  /** The accounts Deploy offers: a row on another can't go back to its account. */
  offeredIds: ReadonlySet<string>
}

export interface RollBack {
  href: string
  /** `redeploy` for a taken-down row (nothing is live there to replace), else `rollback`. */
  kind: 'rollback' | 'redeploy'
  /** "Redeploy" or "Roll back", for the row. */
  label: string
  /** Why it can't go out now (a lock); the button shows disabled with it. */
  blockedReason?: string
}

/**
 * Whether a deployment can go out again, to the same account (the history
 * row's Roll back and the details drawer's). Only a version that went out and
 * still exists can, and only to an account the project still deploys to.
 */
export function rollBackFor(d: DeploymentSummary, rules: RollBackRules): RollBack | null {
  if (
    !rules.rollBackHref ||
    rules.liveIds.has(d.id) ||
    d.status === 'failed' ||
    !d.versionId ||
    !d.connectionId ||
    !rules.offeredIds.has(d.connectionId) ||
    d.version == null
  ) {
    return null
  }
  const kind = d.status === 'taken_down' ? 'redeploy' : 'rollback'
  return {
    href: rules.rollBackHref(d.versionId, d.connectionId),
    kind,
    label: kind === 'redeploy' ? 'Redeploy' : 'Roll back',
    blockedReason: deployBlockedReason(d.versionLocked === 1, rules.lockedOn(d.connectionId)),
  }
}

export type DeploymentState = 'live' | 'failed' | 'taken_down' | 'replaced'

/** Live, Failed, Taken down, or Replaced (a later deploy took its place on that account). */
export function deploymentState(
  d: DeploymentSummary,
  liveIds: ReadonlySet<string>,
): DeploymentState {
  if (liveIds.has(d.id)) return 'live'
  if (d.status === 'failed') return 'failed'
  if (d.status === 'taken_down') return 'taken_down'
  return 'replaced'
}
