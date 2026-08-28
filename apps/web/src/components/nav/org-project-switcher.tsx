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

const rowClass =
  'flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'

const itemClass =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground'

export function OrgProjectSwitcher({ inDrawer = false }: OrgProjectSwitcherProps) {
  const [orgOpen, setOrgOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const collapsed = useSidebarStore((s) => s.collapsed)

  const { activeOrganizationId, activeOrg, orgs, projects, activeProject, fetchingProjects } =
    useOrgStore(
      useShallow((s) => ({
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

  const popoverSide = collapsed && !inDrawer ? 'right' : 'bottom'
  const collapseAware = !inDrawer

  function handleCreateFirstOrg() {
    openOrgDialog()
  }

  function handleNewOrg() {
    setOrgOpen(false)
    openOrgDialog()
  }

  function handleSelectOrg(orgId: string) {
    setOrgOpen(false)
    if (orgId === activeOrganizationId) return
    setActiveOrg(orgId)
  }

  function handleNewProject() {
    setProjectOpen(false)
    openProjectDialog()
  }

  function handleSelectProject(projectId: string) {
    setProjectOpen(false)
    if (projectId === activeProject?.id) return
    setActiveProject(projectId)
  }

  function handleCloseOrgPopover() {
    setOrgOpen(false)
  }

  if (orgs.length === 0) {
    return (
      <button
        onClick={handleCreateFirstOrg}
        className={cn(
          rowClass,
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
    <>
      <Popover.Root open={orgOpen} onOpenChange={setOrgOpen}>
        <Popover.Trigger asChild>
          <button
            className={cn(
              rowClass,
              orgOpen && 'bg-sidebar-accent text-sidebar-foreground',
              collapseAware && 'sidebar-collapsed:justify-center sidebar-collapsed:px-0',
            )}
          >
            <Building2 size={16} className="shrink-0" />
            <span
              className={cn(
                'flex-1 truncate text-left',
                collapseAware && 'sidebar-collapsed:hidden',
              )}
            >
              {activeOrg ? (
                activeOrg.name
              ) : (
                <span className="inline-block h-3 w-16 animate-pulse rounded bg-muted/60" />
              )}
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
            className="z-50 w-56 rounded-md border border-border bg-card p-2 shadow-md"
          >
            <p className="px-2 py-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground/60">
              Organizations
            </p>
            {orgs.map((org) => (
              <button key={org.id} onClick={() => handleSelectOrg(org.id)} className={itemClass}>
                <Building2 size={14} />
                <span className="flex-1 truncate text-left">{org.name}</span>
                {org.id === activeOrg?.id && <Check size={14} className="text-foreground" />}
              </button>
            ))}
            <div className="my-1.5 h-px bg-border" />
            <button onClick={handleNewOrg} className={itemClass}>
              <Plus size={14} />
              <span>New organization</span>
            </button>
            <Link to="/settings" onClick={handleCloseOrgPopover} className={itemClass}>
              <Settings size={14} />
              <span>Settings</span>
            </Link>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <Popover.Root open={projectOpen} onOpenChange={setProjectOpen}>
        <Popover.Trigger asChild>
          <button
            className={cn(
              rowClass,
              projectOpen && 'bg-sidebar-accent text-sidebar-foreground',
              collapseAware && 'sidebar-collapsed:justify-center sidebar-collapsed:px-0',
            )}
          >
            <FolderKanban size={16} className="shrink-0" />
            <span
              className={cn(
                'flex-1 truncate text-left',
                collapseAware && 'sidebar-collapsed:hidden',
              )}
            >
              {fetchingProjects ? (
                <span className="inline-block h-3 w-12 animate-pulse rounded bg-muted/60" />
              ) : (
                (activeProject?.name ?? 'New Project')
              )}
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
            className="z-50 w-56 rounded-md border border-border bg-card p-2 shadow-md"
          >
            <p className="px-2 py-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground/60">
              Projects
            </p>
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
            <button onClick={handleNewProject} className={itemClass}>
              <Plus size={14} />
              <span>New project</span>
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  )
}
