import type { MouseEvent } from 'react'
import { Link } from '@tanstack/react-router'
import type { WorkflowSummary } from '../../lib/api-client'
import { timeAgo } from '../../lib/time'
import { cn } from '../../lib/utils'
import { Badge } from '../ui/badge'
import { TriggerButton } from '../dashboard/trigger-button'
import { WorkflowActionsMenu } from '../dashboard/workflow-actions-menu'
import { WorkflowStatusBadge } from './workflow-status-badge'

// Shared column template so the header and rows stay aligned.
const GRID = 'md:grid md:grid-cols-[minmax(0,1fr)_7rem_8.5rem_8.5rem_5rem] md:items-center md:gap-3'

/** Column header for workflow lists. Render as the first child of the list container. */
export function WorkflowListHeader() {
  return (
    <div
      className={cn(
        'hidden px-4 py-2 text-2xs font-medium uppercase tracking-wider text-muted-foreground/60',
        GRID,
      )}
    >
      <span>Name</span>
      <span>Status</span>
      <span>Last run</span>
      <span>Updated</span>
      <span />
    </div>
  )
}

/**
 * A single workflow list row, presented as table columns on md+ screens.
 * Border-less by design — render inside a
 * `divide-y divide-border rounded-lg border border-border bg-card` container.
 */
export function WorkflowRow({ workflow: wf }: { workflow: WorkflowSummary }) {
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
      className={cn(
        'group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/20',
        GRID,
      )}
    >
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
          <span className="md:hidden">
            <WorkflowStatusBadge
              hasVersion={!!wf.currentVersionId}
              deployStatus={wf.deployStatus ?? undefined}
              isOutdated={isOutdated}
            />
          </span>
        </div>
        {wf.description && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground/60">{wf.description}</p>
        )}
      </div>
      <div className="hidden md:block">
        <WorkflowStatusBadge
          hasVersion={!!wf.currentVersionId}
          deployStatus={wf.deployStatus ?? undefined}
          isOutdated={isOutdated}
        />
      </div>
      <span className="hidden font-mono text-2xs tabular-nums text-muted-foreground md:block">
        {wf.lastRunAt ? timeAgo(wf.lastRunAt) : '—'}
      </span>
      <span className="hidden font-mono text-2xs tabular-nums text-muted-foreground md:block">
        {timeAgo(wf.updatedAt)}
      </span>
      <div className="flex items-center justify-end gap-1" onClick={handleActionAreaClick}>
        {wf.deployStatus === 'success' && <TriggerButton workflowId={wf.id} />}
        <WorkflowActionsMenu workflow={wf} isDeployed={wf.deployStatus === 'success'} />
      </div>
    </Link>
  )
}

export function WorkflowRowSkeleton() {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex h-6 items-center gap-2.5">
          <div className="h-3.5 w-32 animate-pulse rounded bg-muted/60" />
          <div className="h-3.5 w-16 animate-pulse rounded bg-muted/40" />
        </div>
        <div className="mt-0.5 flex h-[1.125rem] items-center">
          <div className="h-3 w-48 animate-pulse rounded bg-muted/30" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-3 w-12 animate-pulse rounded bg-muted/30" />
        <div className="h-7 w-7 animate-pulse rounded bg-muted/30" />
      </div>
    </div>
  )
}
