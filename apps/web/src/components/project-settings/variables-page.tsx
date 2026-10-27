import { Plus } from 'lucide-react'
import { useProjectVariables } from '../../data/dashboard/variables'
import {
  variableDialogPath,
  workspaceSettingsPath,
  type ProjectSlugs,
} from '../../lib/dashboard-paths'
import type { WorkspaceRef } from '../../types/dashboard/items'
import type { ResolvedVariable } from '../../types/dashboard/variables'
import { buttonVariants } from '../ui/button'
import { ShellLink } from '../ui/shell-link'
import { ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { PageBody, PageIntro } from '../shell/page-intro'
import { TopBarContent } from '../navigation/top-bar-slot'
import { VariableTable } from '../variables/parts/variable-table'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { OverviewCard } from '../workspaces/parts/overview-card'
import { useProjectScope } from './use-project-scope'
import { VariableDialogHost } from '../variables/variable-dialog-host'
import { projectDialogMode, type VariableRequest } from '../variables/variable-requests'

interface VariablesPageProps {
  slugs: ProjectSlugs
  request: VariableRequest | null
  onCloseDialog: () => void
}

/**
 * `/{org}/{project}/settings/variables` (`ProjectVariables`). New variable,
 * Edit and Override open the variable dialog through the URL (D-P3-4).
 */
export function VariablesPage({ slugs, request, onCloseDialog }: VariablesPageProps) {
  const scope = useProjectScope(slugs)
  const variables = useProjectVariables(slugs.org, slugs.project)

  if (!scope) return null
  const project = scope.project.project
  const canManage = scope.project.viewerCan.manageVariables.allowed

  function overrideHref(workspace: WorkspaceRef): string {
    return workspaceSettingsPath({ ...slugs, workspace: workspace.slug }, 'variables')
  }

  function actionHref(variable: ResolvedVariable): string {
    return variableDialogPath(slugs, { kind: 'variable', name: variable.name })
  }

  function handleRetry() {
    void variables.refetch()
  }

  const editHref = canManage ? actionHref : undefined
  const mode = projectDialogMode(request, variables.data)

  let body
  if (variables.isError) {
    body = (
      <WorkspaceLoadError
        what="variables"
        error={variables.error}
        onRetry={handleRetry}
        retrying={variables.isFetching}
      />
    )
  } else if (!variables.data) {
    body = (
      <LoadingRegion label="Loading variables">
        <ListCardSkeleton rows={4} trailing={3} tile={false} />
      </LoadingRegion>
    )
  } else {
    body = (
      <OverviewCard
        title={`Resolved for ${project.name}`}
        caption="A workspace value wins over the project’s; the project’s wins over the org’s"
      >
        <VariableTable
          caption={`Variables in ${project.name}`}
          variables={variables.data}
          overrideHref={overrideHref}
          actionHref={editHref}
          framed={false}
        />
      </OverviewCard>
    )
  }

  return (
    <>
      {canManage && (
        <TopBarContent>
          <ShellLink
            href={variableDialogPath(slugs, { kind: 'new' })}
            className={buttonVariants({ size: 'sm' })}
          >
            <Plus aria-hidden="true" />
            New variable
          </ShellLink>
        </TopBarContent>
      )}
      <PageBody>
        <PageIntro
          title="Variables"
          description={`Values every workspace in ${project.name} gets. Override an org value here, or override a project value inside one workspace.`}
        />
        {body}
      </PageBody>
      {canManage && mode && (
        <VariableDialogHost
          org={slugs.org}
          project={{ slug: slugs.project, name: project.name }}
          mode={mode}
          onClose={onCloseDialog}
        />
      )}
    </>
  )
}
