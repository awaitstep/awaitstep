import { timeAgoOrDay } from '../../../lib/time'
import { cn } from '../../../lib/utils'
import type { ProjectWorkspaceConnection } from '../../../types/dashboard/project-connections'
import { Button } from '../../ui/button'
import { OverviewCard } from '../../workspaces/parts/overview-card'

const GRID = 'grid grid-cols-[minmax(150px,1fr)_minmax(190px,1.3fr)_150px_110px] items-center gap-4'

const SOURCE_TAG: Record<ProjectWorkspaceConnection['source'], string> = {
  default: 'Project default',
  override: 'Set for this workspace',
  none: 'Deploy stays disabled',
}

interface WorkspaceDeploysProps {
  workspaces: ProjectWorkspaceConnection[]
  /** Without it the table is read-only. */
  onChange?: (workspace: ProjectWorkspaceConnection) => void
  now?: Date
}

/** *Where each workspace deploys* (`ProjectConnections`). */
export function WorkspaceDeploys({
  workspaces,
  onChange,
  now = new Date(),
}: WorkspaceDeploysProps) {
  return (
    <OverviewCard title="Deployment Config">
      <div className="overflow-x-auto">
        <div role="table" aria-label="Where each workspace deploys" className="min-w-[720px]">
          <div
            role="row"
            className={cn(
              GRID,
              'border-b border-border px-5 py-2.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground',
            )}
          >
            <span role="columnheader">Workspace</span>
            <span role="columnheader">Deploys to</span>
            <span role="columnheader">Last deploy</span>
            <span role="columnheader">
              <span className="sr-only">Actions</span>
            </span>
          </div>
          {workspaces.map((workspace) => (
            <div
              key={workspace.workspaceId}
              role="row"
              className={cn(GRID, 'border-b border-border/60 px-5 py-3 text-sm last:border-b-0')}
            >
              <span role="cell" className="min-w-0 truncate font-medium">
                {workspace.name}
              </span>
              <span role="cell" className="flex min-w-0 items-center gap-2">
                {workspace.connectionName && (
                  <span className="truncate rounded-md bg-muted px-2 py-0.5 text-xs">
                    {workspace.connectionName}
                  </span>
                )}
                <span
                  className={cn(
                    'text-xs',
                    workspace.source === 'override'
                      ? 'text-status-warning'
                      : 'text-muted-foreground',
                  )}
                >
                  {SOURCE_TAG[workspace.source]}
                </span>
              </span>
              <span role="cell" className="min-w-0 text-xs text-muted-foreground">
                {workspace.lastDeployAt ? timeAgoOrDay(workspace.lastDeployAt, now) : 'Never'}
              </span>
              <span role="cell" className="min-w-0">
                {onChange && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Change where ${workspace.name} deploys`}
                    onClick={() => onChange(workspace)}
                  >
                    Change
                  </Button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </OverviewCard>
  )
}
