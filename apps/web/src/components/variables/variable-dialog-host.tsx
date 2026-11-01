import { useScope, useWorkspaces } from '../../data/dashboard/workspaces'
import { VariableDialog, type VariableDialogMode } from './variable-dialog'
import type { PlaceChoices } from './parts/reach-picker'
import { projectVariableTarget, workspaceVariableTarget } from './variable-targets'

interface VariableDialogHostProps {
  org: string
  project: { slug: string; name: string }
  /** On workspace settings: the page's workspace, the only place the variable is saved. */
  workspace?: { slug: string; name: string }
  mode: VariableDialogMode
  onClose: () => void
}

/**
 * Mounted only while a variable dialog is open: loads what saving needs (who
 * may change the page's level, the project's workspaces) and opens the dialog
 * at the page's own level. On a project page "Applies to" chooses every
 * workspace or specific ones; on a workspace page there is nothing to choose.
 * Until the answer arrives nothing can be saved.
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
  const list = useWorkspaces(org, project.slug, { enabled: workspace === undefined })

  const found = projectScope?.found ? projectScope : null
  const projectManages = found?.project?.viewerCan.manageVariables.allowed ?? false
  const workspaceManages =
    workspace !== undefined &&
    workspaceScope?.found === true &&
    (workspaceScope.workspace?.viewerCan.manageVariables.allowed ?? false)

  const target = workspace
    ? workspaceManages
      ? workspaceVariableTarget(project, workspace)
      : null
    : projectManages
      ? projectVariableTarget(project)
      : null
  const places: PlaceChoices | undefined = workspace
    ? undefined
    : {
        noun: 'workspace',
        options: (list.data ?? []).map((w) => ({ id: w.id, slug: w.slug, name: w.name })),
      }

  return <VariableDialog org={org} mode={mode} target={target} places={places} onClose={onClose} />
}
