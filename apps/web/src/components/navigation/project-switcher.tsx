import { useState, type ReactElement } from 'react'
import { LayoutGrid, Plus } from 'lucide-react'
import { useProjects } from '../../data/dashboard/projects'
import { orgPath, projectPath } from '../../lib/dashboard-paths'
import { ScopeSwitcher, type ScopeAction } from '../shell/scope-switcher'
import { useGoTo } from './router-shell-link'
import { recentWorkspaces } from './scope-memory'
import { projectDetail } from './switcher-details'

interface ProjectSwitcherProps {
  /** The panel's project header, or Switch in the phone project menu. */
  trigger: ReactElement
  org: { slug: string; name: string }
  currentProject?: string
  side?: 'bottom' | 'right'
  /** Also called after a choice, e.g. to close the phone sheet it opened from. */
  onDone?: () => void
}

const ACTIONS: ScopeAction[] = [
  { id: 'new', label: 'New project', icon: Plus, tone: 'primary' },
  { id: 'all', label: 'All projects', icon: LayoutGrid },
]

/** Switches project, landing in its most recent workspace; also New project and All projects. */
export function ProjectSwitcher({
  trigger,
  org,
  currentProject,
  side = 'bottom',
  onDone,
}: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false)
  // Asked for only once the switcher opens: the frame shows it on every page.
  const projects = useProjects(org.slug, { enabled: open })
  const goTo = useGoTo()

  function handleSelect(slug: string) {
    onDone?.()
    // Already here: re-opening the project would drop you on its landing page.
    if (slug === currentProject) return
    goTo(projectPath({ org: org.slug, project: slug }))
  }

  // The list is asked for on open, so the first open waits for it.
  function emptyText(query: string): string {
    return projects.isPending ? 'Loading projects…' : `Nothing matches “${query}”`
  }

  function handleAction(id: string) {
    onDone?.()
    // `?new=project` opens the New project dialog once P1 builds it.
    goTo(id === 'new' ? `${orgPath(org.slug)}?new=project` : orgPath(org.slug))
  }

  return (
    <ScopeSwitcher
      trigger={trigger}
      label="Switch project"
      searchPlaceholder="Find a project"
      side={side}
      open={open}
      onOpenChange={setOpen}
      groups={[
        {
          label: `${org.name} projects`,
          items: (projects.data ?? []).map((project) => ({
            id: project.slug,
            name: project.name,
            detail: projectDetail(project, recentWorkspaces(org.slug, project.slug)),
            tile: { initial: project.initial },
          })),
        },
      ]}
      currentId={currentProject}
      currentLabel="Current project"
      onSelect={handleSelect}
      actions={ACTIONS}
      onAction={handleAction}
      emptyText={emptyText}
    />
  )
}
