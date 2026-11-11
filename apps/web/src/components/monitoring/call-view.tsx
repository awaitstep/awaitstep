import { useQuery } from '@tanstack/react-query'
import type { RunSummary } from '../../lib/api-client'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import { formatDurationMs } from '../../lib/time'
import { useQueries } from '../../contexts/api-client-context'
import { Badge } from '../ui/badge'
import { prettyBody } from '../workflow-detail/function-call'
import { RunCard } from './parts/run-card'
import { runConnection } from './run-connection'
import { RunBand } from './run-band'
import { RunErrorBlock } from './run-error-block'
import { RunHead } from './run-head'

interface CallViewProps {
  slugs: WorkspaceSlugs
  workflowId: string
  run: RunSummary
}

/**
 * A function's run is one call (D-5): what was sent, what came back, how long
 * it took. No graph or steps — a call has no provider instance to read.
 */
export function CallView({ slugs, workflowId, run }: CallViewProps) {
  const queries = useQueries()
  const { data: deployConnections } = useQuery({
    ...queries.connections.forDeploy(workflowId),
    retry: false,
  })
  const connection = runConnection(run.connectionId, deployConnections)

  return (
    <div className="flex flex-col gap-[18px]">
      <RunHead slugs={slugs} workflowId={workflowId} run={run} call />
      <RunBand
        workflowId={workflowId}
        run={run}
        connection={connection}
        whereabouts={callWhereabouts(run)}
        call
      />
      <CallResponse run={run} />
    </div>
  )
}

/** What the call came to, under its duration. */
export function callWhereabouts(run: RunSummary): string {
  if (run.responseStatus != null) return `Answered ${run.responseStatus}`
  return run.status === 'errored' ? 'No answer' : 'Finished'
}

function CallResponse({ run }: { run: RunSummary }) {
  const status = run.responseStatus
  const ok = status != null && status >= 200 && status < 300
  const meta = (
    <span className="flex items-center gap-2">
      {status != null && <Badge variant={ok ? 'success' : 'error'}>{status}</Badge>}
      {run.durationMs != null && <span>{formatDurationMs(run.durationMs)}</span>}
    </span>
  )

  return (
    <RunCard title="Response" meta={meta}>
      <div className="flex flex-col gap-3 px-4 py-3.5">
        {status == null && run.error && <RunErrorBlock error={run.error} />}
        {run.output ? (
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-3 font-mono text-[11.5px] leading-relaxed text-foreground/80">
            {prettyBody(run.output, 'application/json')}
          </pre>
        ) : (
          status != null && (
            <span className="text-xs text-muted-foreground">Nothing was returned.</span>
          )
        )}
      </div>
    </RunCard>
  )
}
