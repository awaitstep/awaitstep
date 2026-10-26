import { useId } from 'react'
import { ArrowRight } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { AvatarStack } from '../../ui/avatar-stack'
import { Badge } from '../../ui/badge'
import { HealthLine } from '../../ui/health-line'
import { ShellLink } from '../../ui/shell-link'
import { WORKSPACE_TILE_CLASS } from '../../ui/workspace-colour'
import type { Workspace, WorkspaceCounts } from '../../../types/dashboard/workspaces'

interface WorkspaceCardProps {
  workspace: Workspace
  href: string
  /** The workspace the viewer is in. */
  current?: boolean
  /** Created recently; the page decides what counts as new. */
  isNew?: boolean
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function describeCounts(counts: WorkspaceCounts): string {
  if (counts.workflows === 0 && counts.functions === 0) return 'Nothing built yet'
  return [
    plural(counts.workflows, 'workflow', 'workflows'),
    plural(counts.functions, 'function', 'functions'),
    `${counts.sharedOut} shared out`,
  ].join(' · ')
}

/** A workspace on the project's Workspaces page. One link, to the workspace. */
export function WorkspaceCard({ workspace, href, current, isNew }: WorkspaceCardProps) {
  const nameId = useId()
  const detailId = useId()
  return (
    <ShellLink
      href={href}
      aria-labelledby={nameId}
      aria-describedby={detailId}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-semibold',
            WORKSPACE_TILE_CLASS[workspace.colour],
          )}
        >
          {workspace.initial}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span id={nameId} className="truncate text-sm font-semibold text-foreground">
            {workspace.name}
          </span>
          {workspace.description && (
            <span className="truncate text-xs text-muted-foreground">{workspace.description}</span>
          )}
        </span>
        {current ? (
          <Badge variant="success" dot>
            You’re here
          </Badge>
        ) : (
          isNew && <Badge variant="info">New</Badge>
        )}
      </span>
      <span id={detailId} className="flex flex-col gap-3">
        <span className="text-2xs text-muted-foreground">{describeCounts(workspace.counts)}</span>
        <span className="flex items-center justify-between gap-3">
          <AvatarStack people={workspace.people} />
          <HealthLine failing={workspace.counts.failing} lastRunAt={workspace.counts.lastRunAt} />
        </span>
      </span>
      <span
        aria-hidden="true"
        className="mt-auto flex items-center gap-1.5 text-xs font-medium text-status-success"
      >
        Open workspace
        <ArrowRight className="size-3.5" />
      </span>
    </ShellLink>
  )
}
