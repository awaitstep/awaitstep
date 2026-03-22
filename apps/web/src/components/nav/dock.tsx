import { useState } from 'react'
import { Link, useMatches } from '@tanstack/react-router'
import * as Popover from '@radix-ui/react-popover'
import { useOrgStore } from '../../stores/org-store'
import { useSheetStore } from '../../stores/sheet-store'
import { handleSignOut } from '../../lib/auth-client'
import {
  LayoutDashboard,
  Workflow,
  Activity,
  Cable,
  HardDrive,
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

const navItems = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/workflows', label: 'Workflows', icon: Workflow },
  { to: '/runs', label: 'Runs', icon: Activity },
  { to: '/connections', label: 'Connections', icon: Cable },
  { to: '/resources', label: 'Resources', icon: HardDrive },
] as const

export function Dock({
  email,
  onSwitchOrg,
  onSwitchProject,
}: {
  email: string
  onSwitchOrg: (orgId: string) => void
  onSwitchProject: (projectId: string) => void
}) {
  const matches = useMatches()
  const [devOpen, setDevOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [orgOpen, setOrgOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const isPlaygroundActive = matches.some((m) => m.routeId === '/_authed/api-playground')
  const isSettingsActive = matches.some((m) => m.routeId === '/_authed/settings')

  const orgs = useOrgStore((s) => s.organizations)
  const projects = useOrgStore((s) => s.projects)
  const activeOrgId = useOrgStore((s) => s.activeOrganizationId)
  const activeProjectId = useOrgStore((s) => s.activeProjectId)
  const openProjectDialog = useSheetStore((s) => s.openProjectDialog)
  const openOrgDialog = useSheetStore((s) => s.openOrgDialog)

  const activeOrg = orgs.find((o) => o.id === activeOrgId)
  const activeProject = projects.find((p) => p.id === activeProjectId)

  function handleNewProject() {
    setProjectOpen(false)
    openProjectDialog()
  }

  function handleNewOrg() {
    setOrgOpen(false)
    openOrgDialog()
  }

  function handleSelectProject(projectId: string) {
    setProjectOpen(false)
    if (projectId === activeProjectId) return
    onSwitchProject(projectId)
  }

  function handleSelectOrg(orgId: string) {
    setOrgOpen(false)
    if (orgId === activeOrgId) return
    onSwitchOrg(orgId)
  }

  return (
    <>
      {/* Org menu — left of dock */}
      <div className="fixed bottom-4 left-4 z-40">
        <Popover.Root open={orgOpen} onOpenChange={setOrgOpen}>
          <Popover.Trigger asChild>
            <button
              className={`flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 shadow-lg transition-colors ${
                orgOpen ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground/80'
              }`}
            >
              <Building2 size={16} />
              <span className="max-w-[120px] truncate text-xs font-medium">{activeOrg?.name ?? 'Org'}</span>
              <ChevronDown size={12} />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content side="top" align="start" sideOffset={8} className="z-50 w-56 rounded-md border border-border bg-card p-2 shadow-lg">
              <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Organizations</p>
              {orgs.map((org) => (
                <button
                  key={org.id}
                  onClick={() => handleSelectOrg(org.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  <Building2 size={14} />
                  <span className="flex-1 truncate text-left">{org.name}</span>
                  {org.id === activeOrgId && <Check size={14} className="text-foreground" />}
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
      </div>

      {/* Main dock — center */}
      <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
        <nav className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 shadow-lg">
          {/* Project Selector */}
          <Popover.Root open={projectOpen} onOpenChange={setProjectOpen}>
            <Popover.Trigger asChild>
              <button
                className={`group relative flex h-11 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors ${
                  projectOpen || isSettingsActive
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground/80'
                }`}
              >
                <FolderKanban size={16} />
                <span className="max-w-[100px] truncate text-xs font-medium">
                  {activeProject?.name ?? 'Select'}
                </span>
                <ChevronDown size={12} />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content side="top" align="start" sideOffset={8} className="z-50 w-56 rounded-md border border-border bg-card p-2 shadow-lg">
                <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Projects</p>
                {projects.map((proj) => (
                  <button
                    key={proj.id}
                    onClick={() => handleSelectProject(proj.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
                  >
                    <FolderKanban size={14} />
                    <span className="flex-1 truncate text-left">{proj.name}</span>
                    {proj.id === activeProjectId && <Check size={14} className="text-foreground" />}
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

          <div className="mx-1 h-6 w-px bg-border" />

          {navItems.map(({ to, label, icon: Icon }) => {
            const isActive = matches.some((m) => {
              if (to === '/dashboard') return m.routeId === '/_authed/dashboard'
              if (to === '/workflows') return m.routeId.startsWith('/_authed/workflows')
              if (to === '/runs') return m.routeId.startsWith('/_authed/runs')
              if (to === '/connections') return m.routeId === '/_authed/connections'
              if (to === '/resources') return m.routeId.startsWith('/_authed/resources')
              return false
            })
            return (
              <Link
                key={to}
                to={to}
                className={`group relative flex h-11 w-11 items-center justify-center rounded-md transition-colors ${
                  isActive
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground/80'
                }`}
              >
                <Icon size={20} />
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-card px-2 py-1 text-[11px] font-medium text-foreground opacity-0 shadow-lg group-hover:opacity-100">
                  {label}
                </span>
                {isActive && (
                  <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-foreground" />
                )}
              </Link>
            )
          })}

          <Popover.Root open={devOpen} onOpenChange={setDevOpen}>
            <Popover.Trigger asChild>
              <button
                className={`group relative flex h-11 w-11 items-center justify-center rounded-md transition-colors ${
                  devOpen || isPlaygroundActive
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground/80'
                }`}
              >
                <Code size={20} />
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-card px-2 py-1 text-[11px] font-medium text-foreground opacity-0 shadow-lg group-hover:opacity-100">
                  Developer
                </span>
                {isPlaygroundActive && (
                  <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-foreground" />
                )}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content side="top" align="center" sideOffset={8} className="z-50 w-48 rounded-md border border-border bg-card p-2 shadow-lg">
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

          <div className="mx-1 h-6 w-px bg-border" />

          <Popover.Root open={userOpen} onOpenChange={setUserOpen}>
            <Popover.Trigger asChild>
              <button
                className={`group relative flex h-11 w-11 items-center justify-center rounded-md transition-colors ${
                  userOpen || matches.some((m) => m.routeId === '/_authed/account')
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground/80'
                }`}
              >
                <User size={20} />
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-card px-2 py-1 text-[11px] font-medium text-foreground opacity-0 shadow-lg group-hover:opacity-100">
                  Account
                </span>
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content side="top" align="end" sideOffset={8} className="z-50 w-56 rounded-md border border-border bg-card p-2 shadow-lg">
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
    </>
  )
}
