import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { RunStep, RunSummary } from '../lib/api-client'
import { isTerminalRunStatus } from '../lib/run-steps'
import { useApi } from '../contexts/api-client-context'

const NO_STEPS: RunStep[] = []
const NO_MERGES: Record<string, string> = {}
const ACTIVE_POLL_MS = 5_000
/** A run this old is most likely paused on a sleep or an event, so it is polled less often. */
const SLOW_AFTER_MS = 10 * 60_000
const SLOW_POLL_FACTOR = 6

/** How often to re-ask about an unfinished run: the base rate, slowed once it has been going a while. */
export function pollIntervalFor(
  run: Pick<RunSummary, 'createdAt'>,
  baseMs: number,
  now: number = Date.now(),
): number {
  const age = now - Date.parse(run.createdAt)
  return Number.isFinite(age) && age > SLOW_AFTER_MS ? baseMs * SLOW_POLL_FACTOR : baseMs
}

function lastRunKey(workflowId: string) {
  return ['workflow-last-run', workflowId] as const
}

export interface LastRunSteps {
  run: RunSummary | null
  steps: RunStep[]
  coalescedInto: Record<string, string>
  /** Neither query has answered yet. */
  loading: boolean
  failed: boolean
}

/**
 * The workflow's latest run and the steps it reported. Two dependent queries
 * that run only while `enabled` — the inspector being open — so a closed
 * inspector costs no requests. The steps share the run page's cache key, so
 * a run already looked at there is not fetched twice.
 *
 * While the latest run is in progress both are polled, so its steps fill in
 * and the run is seen to finish; once it has finished nothing polls. A run
 * started after the inspector opened shows up on the next focus or open.
 */
export function useLastRunSteps(
  workflowId: string,
  enabled: boolean,
  pollMs = ACTIVE_POLL_MS,
): LastRunSteps {
  const api = useApi()
  const queryClient = useQueryClient()
  const runs = useQuery({
    queryKey: lastRunKey(workflowId),
    queryFn: async () => {
      const previous = queryClient.getQueryData<{ data: RunSummary[] }>(lastRunKey(workflowId))
        ?.data[0]
      const latest = await api.listWorkflowRuns(workflowId, { limit: 1 })
      const next = latest.data[0]
      // It was running a moment ago and is not now: the steps fetched while it
      // ran are not its final ones.
      if (previous && next?.id === previous.id && !isTerminalRunStatus(previous.status)) {
        if (isTerminalRunStatus(next.status)) {
          void queryClient.invalidateQueries({
            queryKey: ['workflow-run-steps', workflowId, next.id],
          })
        }
      }
      return latest
    },
    enabled,
    staleTime: 15_000,
    retry: false,
    refetchInterval: (query) => {
      const latest = query.state.data?.data[0]
      return latest && !isTerminalRunStatus(latest.status) ? pollIntervalFor(latest, pollMs) : false
    },
  })
  const run = runs.data?.data[0] ?? null
  const active = run !== null && !isTerminalRunStatus(run.status)

  const steps = useQuery({
    queryKey: ['workflow-run-steps', workflowId, run?.id],
    queryFn: () => api.getWorkflowRunSteps(workflowId, run!.id),
    enabled: enabled && run !== null,
    refetchInterval: active && run ? pollIntervalFor(run, pollMs) : false,
    retry: false,
  })

  return {
    run,
    steps: steps.data?.data ?? NO_STEPS,
    coalescedInto: steps.data?.coalescedInto ?? NO_MERGES,
    loading: enabled && (runs.isPending || (run !== null && steps.isPending)),
    failed: runs.isError || steps.isError,
  }
}
