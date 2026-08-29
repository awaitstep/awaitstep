import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import * as Popover from '@radix-ui/react-popover'
import { Building2, Check, ChevronsUpDown, FolderKanban, Plus, Settings } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useOrgStore } from '../../stores/org-store'
import { useSheetStore } from '../../stores/sheet-store'
import { useSidebarStore } from '../../stores/sidebar-store'
import { cn } from '../../lib/utils'

interface OrgProjectSwitcherProps {
  inDrawer?: boolean
}

const itemClass =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground'

const sectionLabelClass =
  'px-2 py-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground/60'

/**
 * Combined org + project scope switcher. A single 48px row (inside the p-2
 * section = 64px total) so the sidebar divider aligns with the 64px page
 * header band.
 */
export function OrgProjectSwitcher({ inDrawer = false }: OrgProjectSwitcherProps) {
  const [open, setOpen] = useState(false)
  const collapsed = useSidebarStore((s) => s.collapsed)

  const {
    appReady,
    activeOrganizationId,
    activeOrg,
    orgs,
    projects,
    activeProject,
    fetchingProjects,
  } = useOrgStore(
    useShallow((s) => ({
      appReady: s.appReady,
      activeOrganizationId: s.activeOrganizationId,
      activeOrg: s.organizations.find((org) => org.id === s.activeOrganizationId),
      orgs: s.organizations,
      fetchingProjects: s.projectsFetchState !== 'success',
      projects: s.projects,
      activeProject: s.projects.find((p) => p.id === s.activeProjectId),
    })),
  )

  const { setActiveOrganization: setActiveOrg, setActiveProject } = useOrgStore()
  const { openOrgDialog, openProjectDialog } = useSheetStore()

  const collapseAware = !inDrawer
  const popoverSide = collapsed && !inDrawer ? 'right' : 'bottom'

  function handleCreateFirstOrg() {
    openOrgDialog()
  }

  function handleNewOrg() {
    setOpen(false)
    openOrgDialog()
  }

  function handleSelectOrg(orgId: string) {
    setOpen(false)
    if (orgId === activeOrganizationId) return
    setActiveOrg(orgId)
  }

  function handleNewProject() {
    setOpen(false)
    openProjectDialog()
  }

  function handleSelectProject(projectId: string) {
    setOpen(false)
    if (projectId === activeProject?.id) return
    setActiveProject(projectId)
  }

  function handleClosePopover() {
    setOpen(false)
  }

  if (!appReady) {
    return (
      <div
        className={cn(
          'flex h-12 w-full items-center gap-2.5 rounded-md px-2',
          collapseAware && 'sidebar-collapsed:justify-center sidebar-collapsed:px-0',
        )}
      >
        <span className="h-7 w-7 shrink-0 animate-pulse rounded-md bg-muted/60" />
        <span
          className={cn(
            'flex min-w-0 flex-1 flex-col gap-1.5',
            collapseAware && 'sidebar-collapsed:hidden',
          )}
        >
          <span className="h-3 w-24 animate-pulse rounded bg-muted/60" />
          <span className="h-2.5 w-16 animate-pulse rounded bg-muted/40" />
        </span>
      </div>
    )
  }

  if (orgs.length === 0) {
    return (
      <button
        onClick={handleCreateFirstOrg}
        className={cn(
          'flex h-12 w-full items-center gap-2.5 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
          collapseAware && 'sidebar-collapsed:justify-center sidebar-collapsed:px-0',
        )}
      >
        <Plus size={16} className="shrink-0" />
        <span className={cn('truncate', collapseAware && 'sidebar-collapsed:hidden')}>
          Create organization
        </span>
      </button>
    )
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className={cn(
            'flex h-12 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors hover:bg-sidebar-accent/60',
            open && 'bg-sidebar-accent',
            collapseAware && 'sidebar-collapsed:justify-center sidebar-collapsed:px-0',
          )}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-accent/60 text-sidebar-foreground">
            <Building2 size={14} />
          </span>
          <span
            className={cn(
              'flex min-w-0 flex-1 flex-col',
              collapseAware && 'sidebar-collapsed:hidden',
            )}
          >
            <span className="truncate text-sm font-medium text-sidebar-foreground">
              {fetchingProjects ? (
                <span className="inline-block h-3 w-16 animate-pulse rounded bg-muted/60" />
              ) : (
                (activeProject?.name ?? 'New Project')
              )}
            </span>
            <span className="truncate text-2xs text-muted-foreground">
              {activeOrg ? (
                activeOrg.name
              ) : (
                <span className="inline-block h-2.5 w-12 animate-pulse rounded bg-muted/60" />
              )}
            </span>
          </span>
          <ChevronsUpDown
            size={12}
            className={cn('shrink-0 opacity-50', collapseAware && 'sidebar-collapsed:hidden')}
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={popoverSide}
          align="start"
          sideOffset={8}
          className="z-50 w-64 rounded-md border border-border bg-card p-2 shadow-md"
        >
          <p className={sectionLabelClass}>Organizations</p>
          {orgs.map((org) => (
            <button key={org.id} onClick={() => handleSelectOrg(org.id)} className={itemClass}>
              <Building2 size={14} />
              <span className="flex-1 truncate text-left">{org.name}</span>
              {org.id === activeOrg?.id && <Check size={14} className="text-foreground" />}
            </button>
          ))}
          <div className="my-1.5 h-px bg-border" />
          <p className={sectionLabelClass}>Projects</p>
          {projects.map((proj) => (
            <button
              key={proj.id}
              onClick={() => handleSelectProject(proj.id)}
              className={itemClass}
            >
              <FolderKanban size={14} />
              <span className="flex-1 truncate text-left">{proj.name}</span>
              {proj.id === activeProject?.id && <Check size={14} className="text-foreground" />}
            </button>
          ))}
          <div className="my-1.5 h-px bg-border" />
          <button onClick={handleNewOrg} className={itemClass}>
            <Plus size={14} />
            <span>New organization</span>
          </button>
          <button onClick={handleNewProject} className={itemClass}>
            <Plus size={14} />
            <span>New project</span>
          </button>
          <Link to="/settings" onClick={handleClosePopover} className={itemClass}>
            <Settings size={14} />
            <span>Settings</span>
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
