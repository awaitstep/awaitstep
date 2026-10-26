import { useId } from 'react'
import { AvatarStack } from '../../ui/avatar-stack'
import { Badge } from '../../ui/badge'
import { HealthLine } from '../../ui/health-line'
import { ShellLink } from '../../ui/shell-link'
import { Tile } from '../../ui/tile'
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

/** A project on the org home: its workspaces, people and how its runs are doing. One link. */
export function ProjectCard({ project, href, current }: ProjectCardProps) {
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
        <Tile>{project.initial}</Tile>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span id={nameId} className="truncate text-sm font-semibold text-foreground">
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
      <span id={detailId} className="flex flex-col gap-3">
        <span className="flex flex-wrap items-center gap-1.5">
          {project.workspaces.map((workspace) => (
            <ScopeChip key={workspace.id} colour={workspace.colour}>
              {workspace.name}
            </ScopeChip>
          ))}
          <span className="text-2xs text-muted-foreground">
            {workflowCount(project.health.workflows)}
          </span>
        </span>
        <span className="flex items-center justify-between gap-3">
          <AvatarStack people={project.people} />
          <HealthLine failing={project.health.failing} lastRunAt={project.health.lastRunAt} />
        </span>
      </span>
    </ShellLink>
  )
}
