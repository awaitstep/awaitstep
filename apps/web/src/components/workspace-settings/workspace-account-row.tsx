import { useState } from 'react'
import { useProjectConnectionSummary } from '../../data/dashboard/project-connections'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import { Button } from '../ui/button'
import { Bone } from '../ui/skeletons'
import { AccountSettingCard } from '../connections/account-setting-card'
import { workspaceAccountText } from '../connections/account-choices'
import { useWorkspaceScope } from '../workspaces/use-workspace-scope'
import { WorkspaceAccountDialog } from './workspace-account-dialog'

interface WorkspaceAccountRowProps {
  slugs: WorkspaceSlugs
}

/**
 * Workspace Settings → General: where the workspace deploys, from the
 * connections summary. The picker fetches the project's accounts when it opens.
 */
export function WorkspaceAccountRow({ slugs }: WorkspaceAccountRowProps) {
  const scope = useWorkspaceScope(slugs)
  // The project's admins (and the org's owners and admins) change it, as the API checks.
  const canManage = scope?.project.viewerCan.manageSettings.allowed === true
  const workspace = scope?.workspace.workspace
  // Only the workspace's own answer: without its id this would ask for the project's.
  const summary = useProjectConnectionSummary(slugs.org, slugs.project, workspace?.id, {
    enabled: workspace !== undefined,
  })
  const [open, setOpen] = useState(false)
  const current = summary.data?.workspace

  function handleOpen() {
    setOpen(true)
  }

  function handleClose() {
    setOpen(false)
  }

  let body
  if (summary.isError) {
    body = <span className="text-status-error">{summary.error.message}</span>
  } else if (!current) {
    body = <Bone className="h-5 w-40 rounded" />
  } else {
    body = <span className="font-medium text-foreground">{workspaceAccountText(current)}</span>
  }

  const action =
    canManage && current ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Change where this workspace deploys"
        onClick={handleOpen}
      >
        Change
      </Button>
    ) : undefined

  return (
    <>
      <AccountSettingCard title="Deploys to" action={action}>
        {body}
      </AccountSettingCard>
      {open && workspace && current && (
        <WorkspaceAccountDialog
          slugs={slugs}
          workspace={{ workspaceId: workspace.id, name: workspace.name, ...current }}
          onClose={handleClose}
        />
      )}
    </>
  )
}
