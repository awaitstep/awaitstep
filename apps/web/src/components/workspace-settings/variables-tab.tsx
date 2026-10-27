import { Plus } from 'lucide-react'
import { workspaceSettingsPath, type WorkspaceSlugs } from '../../lib/dashboard-paths'
import type { WorkspaceScope } from '../../types/dashboard/scope'
import type { WorkspaceVariable } from '../../types/dashboard/variables'
import { buttonVariants } from '../ui/button'
import { ShellLink } from '../ui/shell-link'
import { TopBarContent } from '../navigation/top-bar-slot'
import { WorkspaceVariableTable } from '../variables/parts/workspace-variable-table'
import { OverviewCard } from '../workspaces/parts/overview-card'

interface VariablesTabProps {
  slugs: WorkspaceSlugs
  scope: WorkspaceScope
  projectName: string
  orgName: string
  variables: WorkspaceVariable[]
}

/** Workspace settings → Variables (`Access`): resolved for this workspace, closest level winning. */
export function VariablesTab({ slugs, scope, projectName, orgName, variables }: VariablesTabProps) {
  const workspace = scope.workspace
  const canManage = scope.viewerCan.manageVariables.allowed
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
      <OverviewCard
        title={`Resolved for ${workspace.name}`}
        caption={`The closest level wins: ${workspace.name} › ${projectName} › ${orgName}`}
      >
        <WorkspaceVariableTable
          caption={`Variables in ${workspace.name}`}
          variables={variables}
          colour={workspace.colour}
          framed={false}
        />
      </OverviewCard>
    </>
  )
}
