import { Plus } from 'lucide-react'
import {
  workspaceSettingsPath,
  variableDialogPath,
  type WorkspaceSlugs,
} from '../../lib/dashboard-paths'
import type { WorkspaceScope } from '../../types/dashboard/scope'
import type { WorkspaceVariable } from '../../types/dashboard/variables'
import { buttonVariants } from '../ui/button'
import { ShellLink } from '../ui/shell-link'
import { TopBarContent } from '../navigation/top-bar-slot'
import { WorkspaceVariableTable } from '../variables/parts/workspace-variable-table'
import { VariableDialogHost } from '../variables/variable-dialog-host'
import { VARIABLE_PRECEDENCE_COPY } from '../variables/precedence-copy'
import { workspaceDialogMode, type VariableRequest } from '../variables/variable-requests'
import { OverviewCard } from '../workspaces/parts/overview-card'

interface VariablesTabProps {
  slugs: WorkspaceSlugs
  scope: WorkspaceScope
  projectName: string
  variables: WorkspaceVariable[]
  /** `?tab=variables&new=variable`, or `&variable=NAME`. */
  request: VariableRequest | null
  onCloseDialog: () => void
}

/**
 * Workspace settings → Variables (`Access`): resolved for this workspace,
 * closest level winning. Its own values can be edited here; inherited ones
 * overridden for this workspace (D-P6-6).
 */
export function VariablesTab({
  slugs,
  scope,
  projectName,
  variables,
  request,
  onCloseDialog,
}: VariablesTabProps) {
  const workspace = scope.workspace
  const canManage = scope.viewerCan.manageVariables.allowed
  const mode = workspaceDialogMode(request, variables)

  function actionHref(variable: WorkspaceVariable): string {
    return variableDialogPath(slugs, { kind: 'variable', name: variable.name })
  }

  const editHref = canManage ? actionHref : undefined

  return (
    <>
      {canManage && (
        <TopBarContent>
          <ShellLink
            href={workspaceSettingsPath(slugs, 'variables', 'variable')}
            className={buttonVariants({ size: 'sm' })}
          >
            <Plus aria-hidden="true" />
            New variable
          </ShellLink>
        </TopBarContent>
      )}
      <OverviewCard title={`Resolved for ${workspace.name}`} caption={VARIABLE_PRECEDENCE_COPY}>
        <WorkspaceVariableTable
          caption={`Variables in ${workspace.name}`}
          variables={variables}
          colour={workspace.colour}
          actionHref={editHref}
          framed={false}
        />
      </OverviewCard>
      {canManage && mode && (
        <VariableDialogHost
          org={slugs.org}
          project={{ slug: slugs.project, name: projectName }}
          workspace={{ slug: slugs.workspace, name: workspace.name }}
          mode={mode}
          onClose={onCloseDialog}
        />
      )}
    </>
  )
}
