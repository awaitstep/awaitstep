import type { DatabaseAdapter } from '@awaitstep/db'
import type { AppEmails } from '../types.js'
import { tellRunFailed } from './run-failure.js'
import { failureMessage } from './run-record.js'
import { syncRunById } from './run-sync.js'

export interface RecordedRun {
  runId: string
  workflowId: string
  organizationId: string
}

/**
 * Brings one recorded run up to date now, for whoever recorded it outside a
 * request: a run is read from its provider (and its watchers told when it
 * failed), a failed call's watchers are told. Answers the run's status, or
 * null when the run isn't that organization's or can't be read.
 */
export async function settleRun(
  db: DatabaseAdapter,
  ref: RecordedRun,
  emails?: AppEmails,
): Promise<string | null> {
  const found = await db.getRunForSyncWithAccount(ref.runId, ref.workflowId, ref.organizationId)
  // The read hides another organization's account, not its run.
  if (!found || found.entry.place.organizationId !== ref.organizationId) return null
  const { run, place, workflowName, workflowKind } = found.entry
  // By what the workflow is, not by the run's id: a run may be named anything.
  if (workflowKind !== 'script') {
    const detail = await syncRunById(db, ref.runId, ref.workflowId, ref.organizationId, { emails })
    return detail?.status ?? null
  }
  if (run.status === 'errored') {
    await tellRunFailed(
      db,
      {
        place,
        workflowId: ref.workflowId,
        workflowName,
        call: { errorMessage: failureMessage(run.error) },
      },
      null,
      emails,
    )
  }
  return run.status
}

/** A function call that failed, counted and not recorded: no run to read its place from. */
export interface FailedCall {
  organizationId: string
  workflowId: string
  /** The call's error as recorded (`{ name, message }` JSON); null for none. */
  error: string | null
}

/**
 * Tells the watchers of each function that failed calls, once per function
 * (its newest failure; repeats fold into one notice as a run's do). One that
 * is not that organization's is left out.
 */
export async function tellFunctionsFailed(
  db: DatabaseAdapter,
  calls: readonly FailedCall[],
  emails?: AppEmails,
): Promise<void> {
  const newest = new Map<string, FailedCall>()
  for (const call of calls) newest.set(`${call.organizationId}/${call.workflowId}`, call)
  await Promise.all(
    [...newest.values()].map(async (call) => {
      const found = await db.getWorkflowFailurePlace(call.workflowId, call.organizationId)
      if (!found) return
      await tellRunFailed(
        db,
        {
          place: found.place,
          workflowId: call.workflowId,
          workflowName: found.workflowName,
          call: { errorMessage: failureMessage(call.error) },
        },
        null,
        emails,
      )
    }),
  )
}
