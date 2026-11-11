import type { ActiveRunForSync, DatabaseAdapter } from '@awaitstep/db'
import { runFailureGroupKey } from '@awaitstep/ir'
import type { AppEmails } from '../types.js'
import { emailEach, sendNotice } from './notify.js'

/** The workflow or function that failed, and where it lives. */
export interface FailedItem {
  place: ActiveRunForSync['place']
  workflowId: string
  workflowName: string
  /** A call to a function, with what went wrong: told as a failed call, not a run. */
  call?: { errorMessage: string }
}

/**
 * A run or a function call failed: its workflow's creator and its workspace's
 * admins hear of it, failures of one workflow folding into one row an hour.
 * Only a new row is emailed, so a flapping workflow mails each person at most
 * once an hour.
 */
export async function tellRunFailed(
  db: DatabaseAdapter,
  item: FailedItem,
  step: string | null,
  emails: AppEmails | undefined,
): Promise<void> {
  const { place } = item
  if (!place.organizationId) return
  const now = new Date()
  const reached = await sendNotice(
    db,
    {
      event: 'run.failed',
      organizationId: place.organizationId,
      projectId: place.projectId,
      workspaceId: place.workspaceId,
      groupKey: runFailureGroupKey(item.workflowId, now),
      meta: {
        workflow: item.workflowName,
        ...(step && { step }),
        ...(item.call && { call: true }),
      },
      recipients: { workflowWatchers: { workflowId: item.workflowId } },
      onRepeat: 'fold',
    },
    now,
  )
  if (!emails || !place.orgSlug || !place.projectSlug || !place.workspaceSlug) return
  const url = emails.runsUrl({
    org: place.orgSlug,
    project: place.projectSlug,
    workspace: place.workspaceSlug,
  })
  const placeName = [place.projectName, place.workspaceName].filter(Boolean).join(' · ')
  await emailEach(
    reached.filter((to) => to.count === 1),
    (to) =>
      emails.sendRunFailed({
        to: to.email,
        url,
        workflowName: item.workflowName,
        stepName: step,
        placeName,
        projectName: place.projectName || undefined,
        workspaceName: place.workspaceName || undefined,
        ...(item.call && { call: true, errorMessage: item.call.errorMessage }),
      }),
  )
}
