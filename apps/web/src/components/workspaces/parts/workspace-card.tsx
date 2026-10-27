import { useId } from 'react'
import { ArrowRight } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { AvatarStack } from '../../ui/avatar-stack'
import { Badge } from '../../ui/badge'
import { HealthLine } from '../../ui/health-line'
import { ShellLink } from '../../ui/shell-link'
import { WORKSPACE_TILE_CLASS, WORKSPACE_TINT_CLASS } from '../../ui/workspace-colour'
import type { Workspace, WorkspaceCounts } from '../../../types/dashboard/workspaces'
import { plural } from '../../../lib/plural'
import { format } from 'date-fns'

interface WorkspaceCardProps {
  workspace: Workspace
  href: string
  /** The workspace the viewer is in. */
  current?: boolean
  /** Created recently; the page decides what counts as new. */
  isNew?: boolean
  /** For "Created today by …"; tests pin it. */
  now?: Date
}

function countChips(counts: WorkspaceCounts): string[] {
  if (counts.workflows === 0 && counts.functions === 0) return ['Nothing built yet']
  return [
    plural(counts.workflows, 'workflow', 'workflows'),
    plural(counts.functions, 'function', 'functions'),
    `${counts.sharedOut} shared out`,
  ]
}

/** "Created today by Ama Mensah", for a workspace with no description. */
function createdLine(workspace: Workspace, now: Date): string {
  const created = new Date(workspace.createdAt)
  const day = created.toDateString() === now.toDateString() ? 'today' : format(created, 'd MMM')
  return `Created ${day} by ${workspace.createdBy.name}`
}

/** A workspace on the project's Workspaces page. One link, to the workspace. */
export function WorkspaceCard({
  workspace,
  href,
  current,
  isNew,
  now = new Date(),
}: WorkspaceCardProps) {
  const nameId = useId()
  const detailId = useId()
  const chips = countChips(workspace.counts)
  const empty = workspace.counts.workflows === 0 && workspace.counts.functions === 0
  return (
    <ShellLink
      href={href}
      aria-labelledby={nameId}
      aria-describedby={detailId}
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        current ? 'border-primary' : 'border-border hover:border-foreground/20',
      )}
    >
      <span
        className={cn(
          'flex items-start gap-3.5 border-b px-5 pb-4 pt-5',
          WORKSPACE_TINT_CLASS[workspace.colour],
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-xl text-base font-semibold',
            WORKSPACE_TILE_CLASS[workspace.colour],
          )}
        >
          {workspace.initial}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span id={nameId} className="truncate text-base font-semibold text-foreground">
            {workspace.name}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {workspace.description ?? createdLine(workspace, now)}
          </span>
        </span>
        {current ? (
          <Badge variant="success" dot>
            You’re here
          </Badge>
        ) : (
          isNew && <Badge variant="info">New</Badge>
        )}
      </span>
      <span className="flex flex-1 flex-col gap-4 px-5 pb-5 pt-4">
        <span id={detailId} className="flex flex-col gap-4">
          {/* Chips for the eye; one line for screen readers: "4 workflows · 2 functions · 1 shared out". */}
          <span className="sr-only">{chips.join(' · ')}</span>
          <span aria-hidden="true" className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <Badge key={chip} className={cn('font-normal', empty && 'text-muted-foreground')}>
                {chip}
              </Badge>
            ))}
          </span>
          <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <AvatarStack people={workspace.people} />
            <HealthLine failing={workspace.counts.failing} lastRunAt={workspace.counts.lastRunAt} />
          </span>
        </span>
        <span
          aria-hidden="true"
          className="mt-auto flex items-center justify-between border-t border-border pt-3.5 text-xs font-medium text-foreground"
        >
          Open workspace
          <ArrowRight className="size-4" />
        </span>
      </span>
    </ShellLink>
  )
}
