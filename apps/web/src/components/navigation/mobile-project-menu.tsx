import { useState } from 'react'
import { useWorkspaces } from '../../data/dashboard/workspaces'
import { workspacePath, type ProjectSlugs } from '../../lib/dashboard-paths'
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
  slugs: ProjectSlugs & { workspace?: string }
  orgName: string
  project: { name: string; initial: string }
  /** The workspace the page is in; none on the project's own pages. */
  workspace?: { name: string; initial: string; colour: WorkspaceColour }
  /** The workspace's pages, or the project's own, as in the desktop panel. */
  nav: NavItem[]
  activeKey: string
  /** From a workspace, the way to the project's own pages. */
  projectHref?: string
}

function countLabel(workflows: number): string {
  return `${workflows} ${workflows === 1 ? 'workflow' : 'workflows'}`
}

/**
 * The phone header's "Project 101 / Sales" button and the project menu it
 * opens: the project's workspaces, and this workspace's pages with a way to the
 * project's own; on a project page, the project's pages.
 * Every link closes the sheet.
 */
export function MobileProjectMenu({
  slugs,
  orgName,
  project,
  workspace,
  nav,
  activeKey,
  projectHref,
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
          workspace={workspace?.name}
          tile={
            workspace
              ? { initial: workspace.initial, colour: workspace.colour }
              : { initial: project.initial }
          }
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
        navLabel={workspace ? 'Workspace' : 'Project'}
        projectHref={projectHref}
        onClose={handleClose}
      />
    </BottomSheet>
  )
}
