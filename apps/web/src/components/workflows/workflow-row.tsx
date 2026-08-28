import type { MouseEvent } from 'react'
import { Link } from '@tanstack/react-router'
import type { WorkflowSummary } from '../../lib/api-client'
import { timeAgo } from '../../lib/time'
import { Badge } from '../ui/badge'
import { TriggerButton } from '../dashboard/trigger-button'
import { WorkflowActionsMenu } from '../dashboard/workflow-actions-menu'
import { WorkflowStatusBadge } from './workflow-status-badge'

interface WorkflowRowProps {
  workflow: WorkflowSummary
  /** Timestamp shown at the right edge, e.g. updatedAt (list) or lastRunAt (dashboard). */
  timestamp?: string | null
}

/**
 * A single workflow list row. Border-less by design — render inside a
 * `divide-y divide-border rounded-lg border border-border bg-card` container.
 */
export function WorkflowRow({ workflow: wf, timestamp }: WorkflowRowProps) {
  const isOutdated = !!(
    wf.deployStatus === 'success' &&
    wf.currentVersionId &&
    wf.deployVersionId !== wf.currentVersionId
  )

  function handleActionAreaClick(e: MouseEvent<HTMLDivElement>) {
    e.preventDefault()
  }

  return (
    <Link
      to="/workflows/$workflowId"
      params={{ workflowId: wf.id }}
      className="group block transition-colors hover:bg-muted/20"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className="truncate text-sm font-medium text-foreground">{wf.name}</span>
            {wf.kind === 'script' && (
              <Badge
                variant="outline"
                className="uppercase tracking-wide"
                title="Stateless fetch-only Worker — runs synchronously, no sleeps or waits"
              >
                Function
              </Badge>
            )}
            <WorkflowStatusBadge
              hasVersion={!!wf.currentVersionId}
              deployStatus={wf.deployStatus ?? undefined}
              isOutdated={isOutdated}
            />
          </div>
          {wf.description && (
            <p className="mt-0.5 max-w-sm truncate text-xs text-muted-foreground/60">
              {wf.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3" onClick={handleActionAreaClick}>
          {timestamp && (
            <span className="font-mono text-2xs tabular-nums text-muted-foreground/60">
              {timeAgo(timestamp)}
            </span>
          )}
          <div className="flex items-center gap-1">
            {wf.deployStatus === 'success' && <TriggerButton workflowId={wf.id} />}
            <WorkflowActionsMenu workflow={wf} isDeployed={wf.deployStatus === 'success'} />
          </div>
        </div>
      </div>
    </Link>
  )
}

export function WorkflowRowSkeleton() {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <div className="h-4 w-32 animate-pulse rounded bg-muted/60" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted/40" />
        </div>
        <div className="mt-1.5 h-3 w-48 animate-pulse rounded bg-muted/30" />
      </div>
      <div className="flex items-center gap-3">
        <div className="h-3 w-12 animate-pulse rounded bg-muted/30" />
        <div className="h-7 w-7 animate-pulse rounded bg-muted/30" />
      </div>
    </div>
  )
}
