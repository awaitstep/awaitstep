import { useState } from 'react'
import { Link, useMatches } from '@tanstack/react-router'
import * as Popover from '@radix-ui/react-popover'
import * as Tooltip from '@radix-ui/react-tooltip'
import { useOrgStore } from '../../stores/org-store'
import { useSheetStore } from '../../stores/sheet-store'
import { handleSignOut } from '../../lib/auth-client'
import {
  LayoutDashboard,
  Workflow,
  Activity,
  Cable,
  KeyRound,
  Code,
  SquareTerminal,
  ExternalLink,
  BookOpen,
  LogOut,
  User,
  Settings,
  Building2,
  FolderKanban,
  ChevronDown,
  Check,
  Plus,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useShallow } from 'zustand/react/shallow'

const navItems = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/workflows', label: 'Workflows', icon: Workflow },
  { to: '/runs', label: 'Runs', icon: Activity },
  { to: '/connections', label: 'Connections', icon: Cable },
  { to: '/env-vars', label: 'Env Vars', icon: KeyRound },
] as const

export function Dock({ email }: { email: string }) {
  const matches = useMatches()
  const [orgOpen, setOrgOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [devOpen, setDevOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)

  const isPlaygroundActive = matches.some((m) => m.routeId === '/_authed/api-playground')
  const isSettingsActive = matches.some((m) => m.routeId === '/_authed/settings')

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

  return (
    <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
      <nav className="flex items-center gap-0.5 rounded-xl border border-border bg-card px-2 py-1.5 shadow-lg">
        {/* Org selector */}
        <Popover.Root open={orgOpen} onOpenChange={setOrgOpen}>
          <Popover.Trigger asChild>
            <button
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors',
                orgOpen
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground/80',
              )}
            >
              <Building2 size={14} />
              <span className="max-w-[72px] truncate font-medium">
                {activeOrg ? (
                  activeOrg.name
                ) : (
                  <span className="inline-block h-3 w-12 animate-pulse rounded bg-muted/60" />
                )}
              </span>
              <ChevronDown size={10} />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="top"
              align="start"
              sideOffset={8}
              className="z-50 w-56 rounded-md border border-border bg-card p-2 shadow-lg"
            >
              <p className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
                Organizations
              </p>
              {orgs.map((org) => (
                <button
                  key={org.id}
                  onClick={() => handleSelectOrg(org.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  <Building2 size={14} />
                  <span className="flex-1 truncate text-left">{org.name}</span>
                  {org.id === activeOrg?.id && <Check size={14} className="text-foreground" />}
                </button>
              ))}
              <div className="my-1.5 h-px bg-border" />
              <button
                onClick={handleNewOrg}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <Plus size={14} />
                <span>New organization</span>
              </button>
              <Link
                to="/settings"
                onClick={() => setOrgOpen(false)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <Settings size={14} />
                <span>Settings</span>
              </Link>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        {/* Project selector */}
        <Popover.Root open={projectOpen} onOpenChange={setProjectOpen}>
          <Popover.Trigger asChild>
            <button
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors',
                projectOpen || isSettingsActive
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground/80',
              )}
            >
              <FolderKanban size={14} />
              <span className="max-w-[72px] truncate font-medium">
                {fetchingProjects ? (
                  <span className="inline-block h-3 w-10 animate-pulse rounded bg-muted/60" />
                ) : (
                  (activeProject?.name ?? 'New Project')
                )}
              </span>
              <ChevronDown size={10} />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="top"
              align="start"
              sideOffset={8}
              className="z-50 w-56 rounded-md border border-border bg-card p-2 shadow-lg"
            >
              <p className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
                Projects
              </p>
              {projects.map((proj) => (
                <button
                  key={proj.id}
                  onClick={() => handleSelectProject(proj.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  <FolderKanban size={14} />
                  <span className="flex-1 truncate text-left">{proj.name}</span>
                  {proj.id === activeProject?.id && <Check size={14} className="text-foreground" />}
                </button>
              ))}
              <div className="my-1.5 h-px bg-border" />
              <button
                onClick={handleNewProject}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <Plus size={14} />
                <span>New project</span>
              </button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <div className="mx-1 h-5 w-px bg-border" />

        {/* Main nav items */}
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive = matches.some((m) => {
            if (to === '/dashboard') return m.routeId === '/_authed/dashboard'
            if (to === '/workflows') return m.routeId.startsWith('/_authed/workflows')
            if (to === '/runs') return m.routeId.startsWith('/_authed/runs')
            if (to === '/connections') return m.routeId === '/_authed/connections'
            if (to === '/env-vars') return m.routeId === '/_authed/env-vars'
            return false
          })
          return (
            <Tooltip.Provider key={to} delayDuration={300}>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <Link
                    to={to}
                    className={cn(
                      'relative flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-medium transition-[background-color,color] duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
                      isActive
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground/80',
                    )}
                  >
                    <Icon size={16} className="shrink-0" />
                    <span
                      className={cn(
                        'inline-grid transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
                        isActive ? 'grid-cols-[1fr]' : 'grid-cols-[0fr]',
                      )}
                    >
                      <span
                        className={cn(
                          'overflow-hidden transition-opacity',
                          isActive
                            ? 'opacity-100 duration-300 delay-100'
                            : 'opacity-0 duration-150',
                        )}
                      >
                        {label}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'absolute -bottom-1 left-1/2 h-0.5 -translate-x-1/2 rounded-full bg-primary transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
                        isActive ? 'w-4 opacity-100' : 'w-0 opacity-0',
                      )}
                    />
                  </Link>
                </Tooltip.Trigger>
                {!isActive && (
                  <Tooltip.Portal>
                    <Tooltip.Content
                      side="top"
                      sideOffset={8}
                      className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground shadow-lg"
                    >
                      {label}
                    </Tooltip.Content>
                  </Tooltip.Portal>
                )}
              </Tooltip.Root>
            </Tooltip.Provider>
          )
        })}

        <div className="mx-1 h-5 w-px bg-border" />

        {/* Developer menu */}
        <Popover.Root open={devOpen} onOpenChange={setDevOpen}>
          <Popover.Trigger asChild>
            <button
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors',
                devOpen || isPlaygroundActive
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground/80',
              )}
            >
              <Code size={16} />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="top"
              align="center"
              sideOffset={8}
              className="z-50 w-48 rounded-md border border-border bg-card p-2 shadow-lg"
            >
              <Link
                to="/api-playground"
                onClick={() => setDevOpen(false)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <SquareTerminal size={14} />
                API Playground
              </Link>
              <a
                href="https://docs.awaitstep.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <BookOpen size={14} />
                Docs
                <ExternalLink size={10} className="ml-auto opacity-40" />
              </a>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        {/* User menu */}
        <Popover.Root open={userOpen} onOpenChange={setUserOpen}>
          <Popover.Trigger asChild>
            <button
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors',
                userOpen || matches.some((m) => m.routeId === '/_authed/account')
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground/80',
              )}
            >
              <User size={16} />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="top"
              align="end"
              sideOffset={8}
              className="z-50 w-56 rounded-md border border-border bg-card p-2 shadow-lg"
            >
              <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">{email}</p>
              <div className="my-1 h-px bg-border" />
              <Link
                to="/account"
                onClick={() => setUserOpen(false)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <Settings size={14} />
                Account
              </Link>
              <button
                onClick={() => handleSignOut()}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </nav>
    </div>
  )
}
