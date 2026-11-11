import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import type { RunSummary } from '../../lib/api-client'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import { flatSteps, focusStep, runWhereabouts } from '../../lib/run-step-list'
import { isTerminalRunStatus } from '../../lib/run-steps'
import { useRunTelemetry } from '../../hooks/use-run-telemetry'
import { useApi, useQueries } from '../../contexts/api-client-context'
import { runConnection } from './run-connection'
import { RunBand } from './run-band'
import { RunHead } from './run-head'
import { RunPathCard } from './run-path-card'
import { RunStepPanel } from './run-step-panel'
import { RunStepsCard } from './run-steps-card'
import { RunResult } from './run-result'
import { CallView } from './call-view'

interface RunDetailProps {
  slugs: WorkspaceSlugs
  runId: string
  workflowId: string
  /** A function's runs are calls, and read as one. */
  kind?: 'workflow' | 'script'
}

/** One run's page (26a–26c), under its workflow; the frame's breadcrumb names the workflow. */
export function RunDetail({ slugs, runId, workflowId, kind = 'workflow' }: RunDetailProps) {
  const api = useApi()
  const queryClient = useQueryClient()
  const prevStatus = useRef<string | null>(null)

  const { data: run, isLoading } = useQuery({
    queryKey: ['workflow-run', workflowId, runId],
    queryFn: () => api.getWorkflowRun(workflowId, runId),
    refetchInterval: (query) => {
      const data = query.state.data
      return data && !isTerminalRunStatus(data.status) ? 5_000 : false
    },
  })

  // Refresh run lists once this run transitions into a terminal state.
  useEffect(() => {
    if (!run) return
    const wasActive = prevStatus.current && !isTerminalRunStatus(prevStatus.current)
    if (wasActive && isTerminalRunStatus(run.status)) {
      queryClient.invalidateQueries({ queryKey: ['workflow-runs', workflowId] })
    }
    prevStatus.current = run.status
  }, [run, queryClient, workflowId])

  if (isLoading) {
    return (
      <div className="mt-12 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
      </div>
    )
  }
  if (!run) {
    return <div className="mt-12 text-center text-sm text-muted-foreground">Run not found</div>
  }
  if (kind === 'script') return <CallView slugs={slugs} workflowId={workflowId} run={run} />
  // Keyed by run: Run again opens another, which starts with its own selection.
  return <RunView key={run.id} slugs={slugs} workflowId={workflowId} run={run} />
}

function RunView({
  slugs,
  workflowId,
  run,
}: {
  slugs: WorkspaceSlugs
  workflowId: string
  run: RunSummary
}) {
  const queries = useQueries()
  const telemetry = useRunTelemetry(workflowId, run)
  const [picked, setPicked] = useState<string | undefined>(undefined)

  // A project's own accounts, named by the deploy page's answer.
  const { data: deployConnections } = useQuery({
    ...queries.connections.forDeploy(workflowId),
    retry: false,
  })
  const connection = runConnection(run.connectionId, deployConnections)

  const items = flatSteps(telemetry.entries)
  const focus = focusStep(items, run.status)
  // Until someone picks one, the panel follows where the run is.
  const selected = items.find((i) => i.id === picked) ?? focus
  const whereabouts = runWhereabouts(items, run.status)

  return (
    <div className="flex flex-col gap-[18px]">
      <RunHead slugs={slugs} workflowId={workflowId} run={run} />
      <RunBand
        workflowId={workflowId}
        run={run}
        connection={connection}
        whereabouts={whereabouts}
      />
      <div className="grid items-stretch gap-[18px] lg:grid-cols-[1.15fr_1fr]">
        <RunPathCard
          ir={telemetry.ir}
          nodeStatuses={telemetry.nodeStatuses}
          whereabouts={whereabouts}
        />
        <div className="flex min-w-0 flex-col gap-[18px]">
          <RunStepsCard
            entries={telemetry.entries}
            spanMs={telemetry.spanMs}
            loaded={telemetry.stepsLoaded}
            runStatus={run.status}
            selectedId={selected?.id}
            onSelect={setPicked}
            focus={focus}
          />
          {items.length > 0 && (
            <RunStepPanel workflowId={workflowId} runId={run.id} item={selected} />
          )}
          <RunResult run={run} explained={items.some((i) => i.state === 'failed')} />
        </div>
      </div>
    </div>
  )
}
