import { useId } from 'react'
import { cn } from '../../../lib/utils'
import { AvatarStack } from '../../ui/avatar-stack'
import { Badge } from '../../ui/badge'
import { HealthLine } from '../../ui/health-line'
import { ShellLink } from '../../ui/shell-link'
import { WORKSPACE_TINT_CLASS } from '../../ui/workspace-colour'
import { ScopeChip } from '../../ui/workspace-dot'
import type { Project } from '../../../types/dashboard/projects'

interface ProjectCardProps {
  project: Project
  /** Where the card opens: the project's last-used workspace. */
  href: string
  /** The project the viewer was last in. */
  current?: boolean
}

function workflowCount(count: number): string {
  return `${count} ${count === 1 ? 'workflow' : 'workflows'}`
}

/**
 * A project on the org home: its workspaces, people and how its runs are
 * doing. One link. The header takes its first workspace's colour; the
 * current project has a primary border.
 */
export function ProjectCard({ project, href, current }: ProjectCardProps) {
  const nameId = useId()
  const detailId = useId()
  const tint = project.workspaces[0]?.colour
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
          tint ? WORKSPACE_TINT_CLASS[tint] : 'border-border bg-muted/40',
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-base font-semibold text-foreground"
        >
          {project.initial}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span id={nameId} className="truncate text-base font-semibold text-foreground">
            {project.name}
          </span>
          {project.description && (
            <span className="truncate text-xs text-muted-foreground">{project.description}</span>
          )}
        </span>
        {current && (
          <Badge variant="success" dot>
            Current
          </Badge>
        )}
      </span>
      <span id={detailId} className="flex flex-1 flex-col gap-4 px-5 pb-5 pt-4">
        <span className="flex flex-wrap items-center gap-1.5">
          {project.workspaces.map((workspace) => (
            <ScopeChip key={workspace.id} colour={workspace.colour}>
              {workspace.name}
            </ScopeChip>
          ))}
          <Badge variant="neutral" className="px-2.5 py-1 font-normal">
            {workflowCount(project.health.workflows)}
          </Badge>
        </span>
        <span className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <AvatarStack people={project.people} />
          <HealthLine failing={project.health.failing} lastRunAt={project.health.lastRunAt} />
        </span>
      </span>
    </ShellLink>
  )
}
