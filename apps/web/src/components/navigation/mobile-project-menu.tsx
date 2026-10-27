import { useState } from 'react'
import { useWorkspaces } from '../../data/dashboard/workspaces'
import { workspacePath, type WorkspaceSlugs } from '../../lib/dashboard-paths'
import { BottomSheet } from '../ui/bottom-sheet'
import type { WorkspaceColour } from '../ui/workspace-colour'
import { MobileScopeButton } from '../shell/mobile-nav'
import {
  ProjectMenu,
  ProjectMenuSwitchButton,
  type ProjectMenuWorkspace,
} from '../shell/project-menu'
import type { NavItem } from './nav-model'
import { ProjectSwitcher } from './project-switcher'

interface MobileProjectMenuProps {
  slugs: WorkspaceSlugs
  orgName: string
  project: { name: string; initial: string }
  workspace: { name: string; initial: string; colour: WorkspaceColour }
  /** The workspace's pages, as in the desktop panel. */
  nav: NavItem[]
  activeKey: string
  projectSettingsHref: string
}

function countLabel(workflows: number): string {
  return `${workflows} ${workflows === 1 ? 'workflow' : 'workflows'}`
}

/**
 * The phone header's "Project 101 / Sales" button and the project menu it
 * opens: the project's workspaces, this workspace's pages, Project settings.
 * Every link closes the sheet.
 */
export function MobileProjectMenu({
  slugs,
  orgName,
  project,
  workspace,
  nav,
  activeKey,
  projectSettingsHref,
}: MobileProjectMenuProps) {
  const [open, setOpen] = useState(false)
  const workspaces = useWorkspaces(slugs.org, slugs.project)

  function handleClose() {
    setOpen(false)
  }

  const tiles: ProjectMenuWorkspace[] = (workspaces.data ?? []).map((item) => ({
    key: item.slug,
    name: item.name,
    tile: { initial: item.initial, colour: item.colour },
    count: countLabel(item.counts.workflows),
    href: workspacePath({ ...slugs, workspace: item.slug }),
    current: item.slug === slugs.workspace,
  }))

  return (
    <BottomSheet
      open={open}
      onOpenChange={setOpen}
      title="Project menu"
      trigger={
        <MobileScopeButton
          project={project.name}
          workspace={workspace.name}
          tile={{ initial: workspace.initial, colour: workspace.colour }}
        />
      }
    >
      <ProjectMenu
        project={{ name: project.name, tile: { initial: project.initial } }}
        switchControl={
          <ProjectSwitcher
            org={{ slug: slugs.org, name: orgName }}
            currentProject={slugs.project}
            onDone={handleClose}
            trigger={
              <ProjectMenuSwitchButton
                project={{ name: project.name, tile: { initial: project.initial } }}
              />
            }
          />
        }
        workspaces={tiles}
        nav={nav.map((item) => ({ ...item, active: item.key === activeKey }))}
        projectSettingsHref={projectSettingsHref}
        onClose={handleClose}
      />
    </BottomSheet>
  )
}
