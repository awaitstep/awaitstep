import type { DeploymentLibraryVersion } from './library-types.js'

/**
 * A deployment row's status. A deploy writes its row when it starts
 * (`deploying`), moves it to `uploading` when it hands the build to the
 * provider, and settles it as `success`, `failed` or `cancelled`. A cancel
 * asked for before the upload turns `deploying` into `cancelling`; the
 * running deploy sees it and stops. `taken_down` is a success later removed
 * from its account.
 */
export type DeploymentStatus =
  'deploying' | 'uploading' | 'cancelling' | 'success' | 'failed' | 'cancelled' | 'taken_down'

/** The statuses of a deploy that is still running. */
export const IN_FLIGHT_DEPLOYMENT_STATUSES = ['deploying', 'uploading', 'cancelling'] as const

/** How a deploy ended. */
export type SettledDeploymentStatus = 'success' | 'failed' | 'cancelled'

/**
 * What asking to cancel a deploy found: `cancelling` (the deploy will stop),
 * `uploading` (too late: the provider has the build), `finished` (it already
 * settled), `interrupted` (left running by a server that stopped; nothing is
 * there to stop) or `not_found` (no such deployment of this workflow).
 */
export type CancelDeploymentOutcome =
  'cancelling' | 'uploading' | 'finished' | 'interrupted' | 'not_found'

/** The answer to a cancel, with what its audit record names. */
export interface CancelDeploymentAnswer {
  outcome: CancelDeploymentOutcome
  versionNumber: number | null
  /** This request is the one that turned the deploy to `cancelling` (not an ask again). */
  asked: boolean
}

/**
 * A deploy row still running after this long was left by a server that
 * stopped. Well past the longest deploy: the sandbox is destroyed at 5
 * minutes, and the host deployer's steps time out sooner than this in sum.
 * Readers show such a row as interrupted, a cancel finds nothing to stop, and
 * the next deploy of the workflow settles it.
 */
export const STALE_DEPLOY_MS = 15 * 60_000

/** A deploy as it starts: what it ships, where, and who started it. */
export interface StartDeploymentData {
  id: string
  workflowId: string
  versionId: string
  /** The version's number, kept on the row once the version is deleted. */
  versionNumber: number
  connectionId: string
  configSnapshot?: string
  createdBy?: string
  /** The library versions it bundles, written with the row. */
  libraryVersions?: DeploymentLibraryVersion[]
}

/** How a deploy ended, and what the provider named it. */
export interface SettleDeploymentData {
  status: SettledDeploymentStatus
  serviceName?: string
  serviceUrl?: string
  /** The provider's name for what was deployed, which its runs are found under. */
  deployedName?: string
  error?: string
}

/** The reason a deploy left running by a server that stopped is given. */
export const INTERRUPTED_DEPLOY_ERROR = 'Interrupted — the server stopped during this deploy.'

/**
 * The reason for one interrupted during its upload: part of it may have
 * reached the account, so it never claims that nothing changed.
 */
export const INTERRUPTED_UPLOAD_ERROR =
  'Interrupted during the upload — part of it may have reached the account. Check it before deploying again.'
