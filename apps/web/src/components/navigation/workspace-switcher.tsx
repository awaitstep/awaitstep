import type { ReactElement } from 'react'
import { Layers, Plus } from 'lucide-react'
import { useWorkspaces } from '../../data/dashboard/workspaces'
import {
  projectWorkspacesPath,
  workspacePath,
  type WorkspacePage,
  type WorkspaceSlugs,
} from '../../lib/dashboard-paths'
import { ScopeSwitcher, type ScopeAction } from '../shell/scope-switcher'
import { useGoTo } from './router-shell-link'
import { workspaceDetail } from './switcher-details'

interface WorkspaceSwitcherProps {
  /** The panel's workspace card. */
  trigger: ReactElement
  slugs: WorkspaceSlugs
  projectName: string
  /** The page you're on, kept when you switch (Runs in Sales → Runs in IT). */
  page: WorkspacePage
}

const ACTIONS: ScopeAction[] = [
  { id: 'new', label: 'New workspace', icon: Plus, tone: 'primary' },
  { id: 'manage', label: 'Manage workspaces', icon: Layers },
]

/** Switches workspace within the project; also New workspace and Manage workspaces. */
export function WorkspaceSwitcher({ trigger, slugs, projectName, page }: WorkspaceSwitcherProps) {
  const workspaces = useWorkspaces(slugs.org, slugs.project)
  const goTo = useGoTo()

  function handleSelect(slug: string) {
    if (slug === slugs.workspace) return
    goTo(workspacePath({ ...slugs, workspace: slug }, page))
  }

  function handleAction(id: string) {
    const manage = projectWorkspacesPath(slugs)
    // `?new=workspace` opens the New workspace dialog once P3 builds it.
    goTo(id === 'new' ? `${manage}?new=workspace` : manage)
  }

  return (
    <ScopeSwitcher
      trigger={trigger}
      label="Switch workspace"
      searchPlaceholder="Find a workspace"
      groups={[
        {
          label: `Workspaces in ${projectName}`,
          items: (workspaces.data ?? []).map((workspace) => ({
            id: workspace.slug,
            name: workspace.name,
            detail: workspaceDetail(workspace),
            tile: { initial: workspace.initial, colour: workspace.colour },
          })),
        },
      ]}
      currentId={slugs.workspace}
      currentLabel="Current workspace"
      onSelect={handleSelect}
      actions={ACTIONS}
      onAction={handleAction}
    />
  )
}
