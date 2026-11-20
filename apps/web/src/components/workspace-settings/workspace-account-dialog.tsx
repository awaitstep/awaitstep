import {
  useProjectConnections,
  useSetWorkspaceConnection,
} from '../../data/dashboard/project-connections'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import type { ProjectWorkspaceConnection } from '../../types/dashboard/project-connections'
import { useConnectAccountLink } from '../connections/connect-account-link'
import { useWorkspaceScope } from '../workspaces/use-workspace-scope'
import { ChangeWorkspaceDialog } from '../project-connections/change-workspace-dialog'

interface WorkspaceAccountDialogProps {
  slugs: WorkspaceSlugs
  workspace: Pick<
    ProjectWorkspaceConnection,
    'workspaceId' | 'name' | 'connectionId' | 'connectionName' | 'source'
  >
  onClose: () => void
}

/**
 * Workspace Settings → *Change* on Deploys to. Mounted only while open, so the
 * project's accounts are fetched when it opens.
 */
export function WorkspaceAccountDialog({ slugs, workspace, onClose }: WorkspaceAccountDialogProps) {
  const listed = useProjectConnections(slugs.org, slugs.project)
  const setWorkspace = useSetWorkspaceConnection(slugs.org, slugs.project)
  const orgManager = useWorkspaceScope(slugs)?.orgManager === true
  const connectLink = useConnectAccountLink(slugs, orgManager)

  function handleSubmit(connectionId: string | null) {
    setWorkspace.mutate(
      { workspaceId: workspace.workspaceId, connectionId },
      { onSuccess: onClose },
    )
  }

  return (
    <ChangeWorkspaceDialog
      workspace={{ ...workspace, lastDeployAt: null }}
      connections={listed.data?.connections ?? []}
      loading={!listed.data && !listed.isError}
      loadError={listed.error?.message}
      error={setWorkspace.error?.message}
      pending={setWorkspace.isPending}
      connectLink={connectLink}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  )
}
