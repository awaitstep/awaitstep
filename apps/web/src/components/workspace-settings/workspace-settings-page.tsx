import { useWorkspaceKeys } from '../../data/dashboard/api-keys'
import { useWorkspaceVariables } from '../../data/dashboard/variables'
import { useWorkspacePeople, useWorkspaceSettingsCounts } from '../../data/dashboard/workspaces'
import {
  WORKSPACE_SETTINGS_TABS,
  type WorkspaceSettingsTab,
  type WorkspaceSlugs,
} from '../../lib/dashboard-paths'
import { cn } from '../../lib/utils'
import { PillTab, PillTabsList } from '../ui/pill-tabs'
import { Tabs, TabsContent } from '../ui/tabs'
import { WORKSPACE_TILE_CLASS } from '../ui/workspace-colour'
import { PageBody, PageIntro } from '../shell/page-intro'
import { useWorkspaceScope } from '../workspaces/use-workspace-scope'
import { LoadedQuery } from '../workspaces/loaded-query'
import { GeneralTab } from './general-tab'
import { KeysTab } from './keys-tab'
import { MembersTab } from './members-tab'
import { VariablesTab } from './variables-tab'
import type { VariableRequest } from '../variables/variable-requests'

type Tab = 'general' | WorkspaceSettingsTab

function noop() {}

/** `?tab=` → the open tab; anything else is General. */
export function tabFrom(search: string | undefined): Tab {
  return WORKSPACE_SETTINGS_TABS.find((tab) => tab === search) ?? 'general'
}

interface WorkspaceSettingsPageProps {
  slugs: WorkspaceSlugs
  tab: Tab
  onTabChange: (tab: Tab) => void
  /** `?new=key`: Create an API key on the API keys tab. */
  dialog?: string
  /** `?new=variable` / `?variable=NAME` on the Variables tab. */
  variableRequest?: VariableRequest | null
  onCloseDialog?: () => void
}

/** `/{org}/{project}/{workspace}/settings` (`Access`): General · Members · API keys · Variables. */
export function WorkspaceSettingsPage({
  slugs,
  tab,
  onTabChange,
  dialog,
  variableRequest = null,
  onCloseDialog = noop,
}: WorkspaceSettingsPageProps) {
  const scope = useWorkspaceScope(slugs)
  // Each pill's count comes from the page's own summary; a tab's list opens with it.
  const counts = useWorkspaceSettingsCounts(slugs)
  const people = useWorkspacePeople(slugs, { enabled: tab === 'members' })
  const keys = useWorkspaceKeys(slugs, { enabled: tab === 'keys' })
  const variables = useWorkspaceVariables(slugs, { enabled: tab === 'variables' })

  if (!scope) return null
  const workspace = scope.workspace.workspace
  const projectName = scope.project.project.name
  const org = { slug: slugs.org, name: scope.orgName }

  function handleTabChange(value: string) {
    onTabChange(tabFrom(value))
  }

  return (
    <PageBody>
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-semibold',
            WORKSPACE_TILE_CLASS[workspace.colour],
          )}
        >
          {workspace.initial}
        </span>
        <PageIntro
          title="Workspace settings"
          description="Details, people, keys and variables for this workspace."
        />
      </div>
      <Tabs value={tab} onValueChange={handleTabChange} className="flex flex-col gap-6">
        <PillTabsList>
          <PillTab value="general">General</PillTab>
          <PillTab value="members" count={counts.data?.members}>
            Members
          </PillTab>
          <PillTab value="keys" count={counts.data?.keys}>
            API keys
          </PillTab>
          <PillTab value="variables" count={counts.data?.variables}>
            Variables
          </PillTab>
        </PillTabsList>
        <TabsContent value="general" className="flex flex-col gap-6 pt-0">
          <GeneralTab
            // Starts again from the saved values after a save.
            key={`${workspace.name}|${workspace.description}|${workspace.colour}`}
            slugs={slugs}
            scope={scope.workspace}
            projectName={projectName}
          />
        </TabsContent>
        <TabsContent value="members" className="flex flex-col gap-4 pt-0">
          <LoadedQuery query={people} what="members">
            {(data) => (
              <MembersTab
                slugs={slugs}
                scope={scope.workspace}
                org={org}
                projectName={projectName}
                hasOtherWorkspaces={scope.project.project.workspaces.length > 1}
                people={data}
              />
            )}
          </LoadedQuery>
        </TabsContent>
        <TabsContent value="keys" className="flex flex-col gap-4 pt-0">
          <LoadedQuery query={keys} what="API keys">
            {(data) => (
              <KeysTab
                slugs={slugs}
                scope={scope.workspace}
                orgName={org.name}
                projectName={projectName}
                keys={data}
                createOpen={dialog === 'key'}
                onCloseCreate={onCloseDialog}
              />
            )}
          </LoadedQuery>
        </TabsContent>
        <TabsContent value="variables" className="flex flex-col gap-4 pt-0">
          <LoadedQuery query={variables} what="variables">
            {(data) => (
              <VariablesTab
                slugs={slugs}
                request={variableRequest}
                onCloseDialog={onCloseDialog}
                scope={scope.workspace}
                projectName={projectName}
                variables={data}
              />
            )}
          </LoadedQuery>
        </TabsContent>
      </Tabs>
    </PageBody>
  )
}
