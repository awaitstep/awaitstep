import { useScope, useWorkspaces } from '../../data/dashboard/workspaces'
import { VariableDialog, type VariableDialogMode } from './variable-dialog'
import { variableTargets } from './variable-targets'

interface VariableDialogHostProps {
  org: string
  project: { slug: string; name: string }
  /** On workspace settings: the page's workspace, where the dialog starts. */
  workspace?: { slug: string; name: string }
  mode: VariableDialogMode
  onClose: () => void
}

/**
 * Mounted only while a variable dialog is open: loads what "Applies to" needs
 * (who may change which level, the project's workspaces) and opens the dialog
 * at the page's own level. Until the list arrives, the page's workspace
 * stands in for it, so the dialog never starts somewhere broader.
 */
export function VariableDialogHost({
  org,
  project,
  workspace,
  mode,
  onClose,
}: VariableDialogHostProps) {
  const projectScope = useScope({ org, project: project.slug }).data
  // On a workspace page also its own scope: a workspace admin may set its variables.
  const workspaceScope = useScope({ org, project: project.slug, workspace: workspace?.slug }).data
  const list = useWorkspaces(org, project.slug)

  const found = projectScope?.found ? projectScope : null
  const projectManages = found?.project?.viewerCan.manageVariables.allowed ?? false
  const workspaceManages =
    workspace !== undefined &&
    workspaceScope?.found === true &&
    (workspaceScope.workspace?.viewerCan.manageVariables.allowed ?? false)
  const workspaces = list.data ?? (workspace ? [workspace] : [])
  const allTargets = variableTargets({
    project: { slug: project.slug, name: project.name, canManage: projectManages },
    // A project admin may set any workspace's; a workspace admin only their own.
    workspaces: workspaces.map((w) => ({
      slug: w.slug,
      name: w.name,
      canManage: projectManages || (w.slug === workspace?.slug && workspaceManages),
    })),
  })
  // On a workspace page the level is the workspace itself: nothing to choose.
  const targets = workspace ? allTargets.filter((t) => t.id === `ws:${workspace.slug}`) : allTargets
  const startTarget = workspace ? `ws:${workspace.slug}` : 'project'

  return (
    <VariableDialog
      org={org}
      mode={mode}
      targets={targets}
      startTarget={startTarget}
      onClose={onClose}
    />
  )
}
