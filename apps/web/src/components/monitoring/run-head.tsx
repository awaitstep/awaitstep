import { Play } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { RunSummary } from '../../lib/api-client'
import type { ActionToast } from '../../lib/action-toast'
import { isTerminalRunStatus } from '../../lib/run-steps'
import { runPath, type WorkspaceSlugs } from '../../lib/dashboard-paths'
import { useApi } from '../../contexts/api-client-context'
import { useGoTo } from '../navigation/router-shell-link'
import { Button } from '../ui/button'
import { RunActions } from './run-actions'
import { RunStatusBadge } from './run-status-badge'

// It opens the new run: that says it worked.
const RUN_AGAIN_TOAST: ActionToast = { success: null, error: 'Couldn’t run it again' }

/** Runs that stopped short; a finished one isn't offered again (26b). */
const RETRYABLE = new Set(['errored', 'terminated'])

interface RunHeadProps {
  slugs: WorkspaceSlugs
  workflowId: string
  run: RunSummary
  /** A function's run is a call: "Call …", and it can be made again whatever came back. */
  call?: boolean
}

/** "Run 16906129" (or "Call …"), its state, and the actions that fit it (26a/26b). */
export function RunHead({ slugs, workflowId, run, call = false }: RunHeadProps) {
  const api = useApi()
  const queryClient = useQueryClient()
  const goTo = useGoTo()
  const connectionId = run.connectionId

  const again = useMutation({
    meta: { toast: RUN_AGAIN_TOAST },
    mutationFn: () => api.runWorkflowAgain(workflowId, run.id, connectionId ?? ''),
    onSuccess: (next) => {
      void queryClient.invalidateQueries({ queryKey: ['workflow-runs', workflowId] })
      goTo(runPath(slugs, { id: workflowId }, 'runId' in next ? next.runId : next.id))
    },
  })

  function handleRunAgain() {
    again.mutate()
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="truncate text-2xl font-semibold tracking-tight">
        {call ? 'Call' : 'Run'} <span className="font-mono">{shortRunId(run.instanceId)}</span>
      </h2>
      <RunStatusBadge status={run.status} />
      <span className="flex-1" />
      {!isTerminalRunStatus(run.status) && (
        <RunActions workflowId={workflowId} runId={run.id} status={run.status} />
      )}
      {(call || RETRYABLE.has(run.status)) && connectionId && (
        <Button size="sm" className="gap-1.5" disabled={again.isPending} onClick={handleRunAgain}>
          <Play aria-hidden="true" className="size-3.5" />
          {call ? 'Call again' : 'Run again'}
        </Button>
      )}
    </div>
  )
}

/** The instance id's head, enough to tell runs apart in a heading. */
export function shortRunId(instanceId: string): string {
  const id = instanceId.replace(/^call_/, '')
  return id.length > 12 ? id.slice(0, 8) : id
}
