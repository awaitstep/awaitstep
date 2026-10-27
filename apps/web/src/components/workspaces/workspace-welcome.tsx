import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import type { ProjectScope, WorkspaceScope } from '../../types/dashboard/scope'
import { EmptyProject } from './empty-project'
import { EmptyWorkspace } from './empty-workspace'
import type { EmptyView } from './workspace-empty-view'

interface WorkspaceWelcomeProps {
  view: Exclude<EmptyView, null>
  slugs: WorkspaceSlugs
  orgName: string
  project: ProjectScope
  workspace: WorkspaceScope
}

/** An empty workspace's page body on Overview, Workflows and Functions (D-P2-5). */
export function WorkspaceWelcome({
  view,
  slugs,
  orgName,
  project,
  workspace,
}: WorkspaceWelcomeProps) {
  const readOnly = !workspace.viewerCan.edit.allowed
  if (view === 'project') {
    return (
      <EmptyProject
        slugs={slugs}
        org={{ name: orgName }}
        project={project.project}
        workspace={workspace.workspace}
        readOnly={readOnly}
        canAddWorkspace={project.viewerCan.createWorkspace.allowed}
      />
    )
  }
  return (
    <EmptyWorkspace
      slugs={slugs}
      workspaceName={workspace.workspace.name}
      projectName={project.project.name}
      readOnly={readOnly}
    />
  )
}
