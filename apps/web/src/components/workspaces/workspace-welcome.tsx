import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import type { ProjectScope, WorkspaceScope } from '../../types/dashboard/scope'
import { EmptyWorkspace } from './empty-workspace'

interface WorkspaceWelcomeProps {
  slugs: WorkspaceSlugs
  project: ProjectScope
  workspace: WorkspaceScope
}

/** An empty workspace's page body on Workflows and Functions (`EmptyWorkspace`). */
export function WorkspaceWelcome({ slugs, project, workspace }: WorkspaceWelcomeProps) {
  return (
    <EmptyWorkspace
      slugs={slugs}
      workspaceName={workspace.workspace.name}
      projectName={project.project.name}
      readOnly={!workspace.viewerCan.edit.allowed}
    />
  )
}
