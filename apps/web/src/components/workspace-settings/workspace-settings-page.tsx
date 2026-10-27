import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { useWorkspaceKeys } from '../../data/dashboard/api-keys'
import { useWorkspaceVariables } from '../../data/dashboard/variables'
import { useWorkspacePeople } from '../../data/dashboard/workspaces'
import {
  WORKSPACE_SETTINGS_TABS,
  type WorkspaceSettingsTab,
  type WorkspaceSlugs,
} from '../../lib/dashboard-paths'
import { cn } from '../../lib/utils'
import { ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { WORKSPACE_TILE_CLASS } from '../ui/workspace-colour'
import { PageBody, PageIntro } from '../shell/page-intro'
import { DASHBOARD_SEARCH_KEYS, type DashboardSearch } from '../navigation/dashboard-providers'
import { useWorkspaceScope } from '../workspaces/use-workspace-scope'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { GeneralTab } from './general-tab'
import { KeysTab } from './keys-tab'
import { MembersTab } from './members-tab'
import { VariablesTab } from './variables-tab'

type Tab = 'general' | WorkspaceSettingsTab

/** `?tab=` → the open tab; anything else is General. */
export function tabFrom(search: string | undefined): Tab {
  return WORKSPACE_SETTINGS_TABS.find((tab) => tab === search) ?? 'general'
}

/**
 * The search after switching to `tab`: the params every page keeps
 * (`DASHBOARD_SEARCH_KEYS`) and the tab carry over, so a dialog param
 * (`new=key`) stays behind with its tab.
 */
export function searchForTab(prev: DashboardSearch, tab: string): DashboardSearch {
  const kept = Object.fromEntries(DASHBOARD_SEARCH_KEYS.map((key) => [key, prev[key]]))
  return { ...kept, tab: tab === 'general' ? undefined : tab }
}

// The board's pill tabs with counts, on the kit's tablist.
const LIST_CLASS = 'w-fit gap-1 rounded-xl border border-border bg-card p-1'
const TRIGGER_CLASS =
  'h-[34px] rounded-lg border-0 px-3.5 text-sm data-[state=active]:bg-muted data-[state=active]:shadow-sm'

interface WorkspaceSettingsPageProps {
  slugs: WorkspaceSlugs
  tab: Tab
  onTabChange: (tab: Tab) => void
}

function Count({ value }: { value: number | undefined }) {
  if (value === undefined) return null
  return (
    <span className="rounded-full bg-muted px-1.5 text-3xs text-muted-foreground group-data-[state=active]:bg-primary/15 group-data-[state=active]:text-status-success">
      {value}
    </span>
  )
}

function TabSkeleton() {
  return (
    <LoadingRegion label="Loading">
      <ListCardSkeleton rows={2} trailing={2} />
      <ListCardSkeleton rows={2} trailing={2} />
    </LoadingRegion>
  )
}

/** `/{org}/{project}/{workspace}/settings` (`Access`): General · Members · API keys · Variables. */
export function WorkspaceSettingsPage({ slugs, tab, onTabChange }: WorkspaceSettingsPageProps) {
  const scope = useWorkspaceScope(slugs)
  const people = useWorkspacePeople(slugs)
  const keys = useWorkspaceKeys(slugs)
  const variables = useWorkspaceVariables(slugs)

  if (!scope) return null
  const workspace = scope.workspace.workspace
  const projectName = scope.project.project.name
  const org = { slug: slugs.org, name: scope.orgName }

  function handleTabChange(value: string) {
    onTabChange(tabFrom(value))
  }

  // Each list tab: its error, its skeleton, or the tab itself.
  function listTab<T>(query: UseQueryResult<T>, what: string, render: (data: T) => ReactNode) {
    if (query.isError) {
      return (
        <WorkspaceLoadError
          what={what}
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )
    }
    if (query.data === undefined) return <TabSkeleton />
    return render(query.data)
  }

  const keyCount = keys.data && keys.data.own.length + keys.data.inherited.length

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
          description={`${workspace.name}’s details, and who and what can reach it. Anything from ${projectName} shows alongside what only ${workspace.name} has.`}
        />
      </div>
      <Tabs value={tab} onValueChange={handleTabChange} className="flex flex-col gap-6">
        <TabsList className={LIST_CLASS}>
          <TabsTrigger value="general" className={TRIGGER_CLASS}>
            General
          </TabsTrigger>
          <TabsTrigger value="members" className={cn(TRIGGER_CLASS, 'group')}>
            Members <Count value={people.data?.length} />
          </TabsTrigger>
          <TabsTrigger value="keys" className={cn(TRIGGER_CLASS, 'group')}>
            API keys <Count value={keyCount} />
          </TabsTrigger>
          <TabsTrigger value="variables" className={cn(TRIGGER_CLASS, 'group')}>
            Variables <Count value={variables.data?.length} />
          </TabsTrigger>
        </TabsList>
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
          {listTab(people, 'members', (data) => (
            <MembersTab
              slugs={slugs}
              scope={scope.workspace}
              org={org}
              projectName={projectName}
              people={data}
            />
          ))}
        </TabsContent>
        <TabsContent value="keys" className="flex flex-col gap-4 pt-0">
          {listTab(keys, 'API keys', (data) => (
            <KeysTab slugs={slugs} scope={scope.workspace} projectName={projectName} keys={data} />
          ))}
        </TabsContent>
        <TabsContent value="variables" className="flex flex-col gap-4 pt-0">
          {listTab(variables, 'variables', (data) => (
            <VariablesTab
              slugs={slugs}
              scope={scope.workspace}
              projectName={projectName}
              orgName={org.name}
              variables={data}
            />
          ))}
        </TabsContent>
      </Tabs>
    </PageBody>
  )
}
