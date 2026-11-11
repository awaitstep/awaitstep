import { useQuery } from '@tanstack/react-query'
import { useApi } from '../../contexts/api-client-context'
import type { RunSummary } from '../../lib/api-client'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import { formatDurationMs } from '../../lib/time'
import { useQueries } from '../../contexts/api-client-context'
import { Badge } from '../ui/badge'
import { Bone, LoadingRegion } from '../ui/skeletons'
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
 * it took — the request beside the response. No graph or steps — a call has no
 * provider instance to read.
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
      <div className="flex flex-wrap items-stretch gap-[18px] [&>*]:min-w-0 [&>*]:flex-[1_1_320px]">
        <CallRequest workflowId={workflowId} run={run} />
        <CallResponse run={run} />
      </div>
    </div>
  )
}

/** What the call came to, under its duration. */
export function callWhereabouts(run: RunSummary): string {
  if (run.responseStatus != null) return `Answered ${run.responseStatus}`
  return run.status === 'errored' ? 'No answer' : 'Finished'
}

const BODY =
  'max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-3 font-mono text-sm leading-relaxed text-foreground/80'

/** The body the call sent, read with the page; a kept string shows as itself. */
function CallRequest({ workflowId, run }: { workflowId: string; run: RunSummary }) {
  const api = useApi()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['workflow-run-params', workflowId, run.id],
    queryFn: () => api.getWorkflowRunParams(workflowId, run.id),
    enabled: run.hasParams,
    // A run's payload never changes.
    staleTime: Infinity,
  })

  let body
  if (!run.hasParams) {
    body = <span className="text-xs text-muted-foreground">Sent with no body.</span>
  } else if (isLoading) {
    body = (
      <LoadingRegion label="Loading the request body">
        <Bone className="h-16 w-full rounded-lg" />
      </LoadingRegion>
    )
  } else if (isError || !data) {
    body = <span className="text-xs text-status-error">Couldn’t load the request body.</span>
  } else {
    body = <pre className={BODY}>{requestText(data.params)}</pre>
  }

  return (
    <RunCard title="Request">
      <div className="flex flex-col gap-3 px-4 py-3.5">{body}</div>
    </RunCard>
  )
}

/** A JSON body indented to read; a body kept as text, as it was sent. */
export function requestText(params: unknown): string {
  return typeof params === 'string' ? params : JSON.stringify(params, null, 2)
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
          <pre className={BODY}>{prettyBody(run.output, 'application/json')}</pre>
        ) : (
          status != null && (
            <span className="text-xs text-muted-foreground">Nothing was returned.</span>
          )
        )}
      </div>
    </RunCard>
  )
}
