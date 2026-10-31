import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useOrgNodes } from '../../data/dashboard/resources'
import { useOrgVariables } from '../../data/dashboard/variables'
import { variableDialogPath } from '../../lib/dashboard-paths'
import { Button, buttonVariants } from '../ui/button'
import { PillTab, PillTabsList } from '../ui/pill-tabs'
import { ShellLink } from '../ui/shell-link'
import { Tabs, TabsContent } from '../ui/tabs'
import { PageBody, PageIntro } from '../shell/page-intro'
import { TopBarContent } from '../navigation/top-bar-slot'
import { useOrgScope } from '../org-settings/use-org-scope'
import { LoadedQuery } from '../workspaces/loaded-query'
import type { VariableRequest } from '../variables/variable-requests'
import { CustomNodeDialog } from './custom-node-dialog'
import { NodesTab } from './nodes-tab'
import { ApiError } from '../../lib/api-client'
import { OrgVariablesTab } from './org-variables-tab'

export const RESOURCES_TABS = ['nodes', 'variables'] as const
export type ResourcesTab = (typeof RESOURCES_TABS)[number]

/** `?tab=` → the open tab; anything else is Nodes. */
export function resourcesTabFrom(search: string | undefined): ResourcesTab {
  return RESOURCES_TABS.find((tab) => tab === search) ?? 'nodes'
}

interface ResourcesPageProps {
  org: string
  tab: ResourcesTab
  onTabChange: (tab: ResourcesTab) => void
  /** `?new=variable` / `?variable=NAME` on the Variables tab. */
  variableRequest: VariableRequest | null
  onCloseDialog: () => void
}

/** `/{org}/resources` (`OrgResources`): the nodes and variables every project can use. */
export function ResourcesPage({
  org,
  tab,
  onTabChange,
  variableRequest,
  onCloseDialog,
}: ResourcesPageProps) {
  const scope = useOrgScope(org)
  const nodes = useOrgNodes(org)
  const variables = useOrgVariables(org)
  const [explaining, setExplaining] = useState(false)

  if (!scope) return null
  const orgRef = { slug: org, name: scope.org.name }
  const can = scope.viewerCan.manageSettings

  function handleTabChange(value: string) {
    onTabChange(resourcesTabFrom(value))
  }

  function handleExplain() {
    setExplaining(true)
  }

  function handleCloseExplainer() {
    setExplaining(false)
  }

  const installedCount = nodes.data?.filter((n) => n.installed).length

  function registryDetail(error: unknown) {
    // `503`: this instance has no node registry, or can't reach it.
    return error instanceof ApiError && error.status === 503
      ? 'This instance can’t reach the node registry. Nodes already installed keep working in the editor.'
      : undefined
  }

  return (
    <>
      {can.allowed && (
        <TopBarContent>
          {tab === 'nodes' ? (
            <Button type="button" size="sm" onClick={handleExplain}>
              <Plus aria-hidden="true" />
              New custom node
            </Button>
          ) : (
            <ShellLink
              href={variableDialogPath({ org }, { kind: 'new' })}
              className={buttonVariants({ size: 'sm' })}
            >
              <Plus aria-hidden="true" />
              New variable
            </ShellLink>
          )}
        </TopBarContent>
      )}
      <PageBody>
        <Tabs value={tab} onValueChange={handleTabChange} className="flex flex-col gap-6">
          <PageIntro
            title="Resources"
            description={`Building blocks every project in ${orgRef.name} can use. Projects and workspaces add their own on top.`}
            aside={
              <PillTabsList>
                <PillTab value="nodes" count={installedCount}>
                  Nodes
                </PillTab>
                <PillTab value="variables" count={variables.data?.length}>
                  Variables
                </PillTab>
              </PillTabsList>
            }
          />
          <TabsContent value="nodes" className="flex flex-col gap-6 pt-0">
            <LoadedQuery query={nodes} what="nodes" filters errorDetail={registryDetail}>
              {(data) => (
                <NodesTab
                  // Filters belong to one org: switching org starts afresh.
                  key={org}
                  org={orgRef}
                  nodes={data}
                  canManage={can.allowed}
                  reason={can.reason}
                />
              )}
            </LoadedQuery>
          </TabsContent>
          <TabsContent value="variables" className="flex flex-col gap-4 pt-0">
            <LoadedQuery query={variables} what="variables">
              {(data) => (
                <OrgVariablesTab
                  org={orgRef}
                  variables={data}
                  canManage={can.allowed}
                  request={variableRequest}
                  onCloseDialog={onCloseDialog}
                />
              )}
            </LoadedQuery>
          </TabsContent>
        </Tabs>
      </PageBody>
      {explaining && <CustomNodeDialog orgName={orgRef.name} onClose={handleCloseExplainer} />}
    </>
  )
}
