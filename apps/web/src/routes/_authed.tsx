import { createFileRoute, Outlet, Link, redirect, useMatches } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader, setCookie } from '@tanstack/react-start/server'
import { useEffect, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { useAuthStore, type SessionData } from '../stores/auth-store'
import { useOrgStore } from '../stores/org-store'
import { authClient, handleSignOut } from '../lib/auth-client'
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
} from 'lucide-react'
import type { Organization, Project } from '../stores/org-store'

const getSessionOnServer = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SessionData | null> => {
    const cookie = getRequestHeader('cookie')
    if (!cookie) return null

    const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
    const res = await fetch(`${apiBase}/api/auth/get-session`, {
      headers: { cookie },
    })

    if (!res.ok) return null

    const data = await res.json()
    return data?.session ? (data as SessionData) : null
  },
)

const saveRedirectPath = createServerFn({ method: 'POST' })
  .inputValidator((data: string) => data)
  .handler(async ({ data: path }) => {
    setCookie('auth_redirect', path, {
      path: '/',
      httpOnly: false,
      maxAge: 60 * 5,
      sameSite: 'lax',
    })
  })

export const Route = createFileRoute('/_authed')({
  loader: async ({ location }) => {
    const sessionData = await getSessionOnServer()
    if (!sessionData) {
      await saveRedirectPath({ data: location.href })
      throw redirect({ to: '/sign-in' })
    }
    return { sessionData }
  },
  staleTime: 5 * 60 * 1000,
  component: AuthedLayout,
})

const navItems = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/workflows', label: 'Workflows', icon: Workflow },
  { to: '/runs', label: 'Runs', icon: Activity },
  { to: '/connections', label: 'Connections', icon: Cable },
  { to: '/resources', label: 'Resources', icon: HardDrive },
] as const

function AuthedLayout() {
  const { sessionData } = Route.useLoaderData()
  const setSession = useAuthStore((s) => s.setSession)
  const matches = useMatches()
  const isFullScreen = matches.some(
    (m) => m.routeId === '/_authed/workflows/$workflowId/canvas',
  )
  const isSetupPage = matches.some((m) => m.routeId === '/_authed/setup')

  const [orgs, setOrgs] = useState<Organization[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [ready, setReady] = useState(false)

  const activeOrgId = useOrgStore((s) => s.activeOrganizationId)
  const activeProjectId = useOrgStore((s) => s.activeProjectId)
  const setActiveOrg = useOrgStore((s) => s.setActiveOrganization)
  const setActiveProject = useOrgStore((s) => s.setActiveProject)

  useEffect(() => {
    setSession(sessionData)
  }, [sessionData, setSession])

  useEffect(() => {
    let cancelled = false

    async function init() {
      const orgList = await authClient.organization.list()
      if (cancelled) return

      const orgData = (orgList.data ?? []) as Organization[]
      setOrgs(orgData)

      if (orgData.length === 0) {
        setReady(true)
        return
      }

      // Use stored org or default to first
      const orgId = activeOrgId && orgData.some((o) => o.id === activeOrgId)
        ? activeOrgId
        : orgData[0].id

      if (orgId !== activeOrgId) {
        setActiveOrg(orgId)
      }

      // Set active org in better-auth session
      await authClient.organization.setActive({ organizationId: orgId })

      // Fetch projects for this org
      const res = await fetch(`/api/projects`, { credentials: 'include' })
      if (cancelled) return
      const projectData = (await res.json()) as Project[]
      setProjects(projectData)

      if (projectData.length > 0) {
        const projId = activeProjectId && projectData.some((p) => p.id === activeProjectId)
          ? activeProjectId
          : projectData[0].id
        if (projId !== activeProjectId) {
          setActiveProject(projId)
        }
      }

      setReady(true)
    }

    init()
    return () => { cancelled = true }
  }, []) // eslint-disable-line

  // Redirect to setup if no orgs or no projects (but not if already on setup page)
  if (ready && !isSetupPage && (orgs.length === 0 || projects.length === 0)) {
    window.location.href = '/setup'
    return null
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    )
  }

  if (isFullScreen) {
    return <Outlet />
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-screen-lg flex-1 px-8 py-6 pb-24">
        <Outlet />
      </main>
      <Dock
        email={sessionData.user.email}
        matches={matches}
        orgs={orgs}
        projects={projects}
        activeOrgId={activeOrgId}
        activeProjectId={activeProjectId}
        onSwitchOrg={async (orgId) => {
          setActiveOrg(orgId)
          await authClient.organization.setActive({ organizationId: orgId })
          const res = await fetch(`/api/projects`, { credentials: 'include' })
          const projectData = (await res.json()) as Project[]
          setProjects(projectData)
          if (projectData.length > 0) {
            setActiveProject(projectData[0].id)
          }
          window.location.reload()
        }}
        onSwitchProject={(projectId) => {
          setActiveProject(projectId)
          window.location.reload()
        }}
      />
    </div>
  )
}

function Dock({
  email,
  matches,
  orgs,
  projects,
  activeOrgId,
  activeProjectId,
  onSwitchOrg,
  onSwitchProject,
}: {
  email: string
  matches: ReturnType<typeof useMatches>
  orgs: Organization[]
  projects: Project[]
  activeOrgId: string | null
  activeProjectId: string | null
  onSwitchOrg: (orgId: string) => void
  onSwitchProject: (projectId: string) => void
}) {
  const [devOpen, setDevOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [orgOpen, setOrgOpen] = useState(false)
  const isPlaygroundActive = matches.some((m) => m.routeId === '/_authed/api-playground')

  const activeProject = projects.find((p) => p.id === activeProjectId)

  return (
    <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
      <nav className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 shadow-lg">
        {/* Org/Project Switcher */}
        <Popover.Root open={orgOpen} onOpenChange={setOrgOpen}>
          <Popover.Trigger asChild>
            <button
              className={`group relative flex h-11 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors ${
                orgOpen
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
              {/* Organization Section */}
              <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Organization</p>
              {orgs.map((org) => (
                <button
                  key={org.id}
                  onClick={() => { onSwitchOrg(org.id); setOrgOpen(false) }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  <Building2 size={14} />
                  <span className="flex-1 truncate text-left">{org.name}</span>
                  {org.id === activeOrgId && <Check size={14} className="text-foreground" />}
                </button>
              ))}

              <div className="my-1.5 h-px bg-border" />

              {/* Project Section */}
              <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Project</p>
              {projects.map((proj) => (
                <button
                  key={proj.id}
                  onClick={() => { onSwitchProject(proj.id); setOrgOpen(false) }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  <FolderKanban size={14} />
                  <span className="flex-1 truncate text-left">{proj.name}</span>
                  {proj.id === activeProjectId && <Check size={14} className="text-foreground" />}
                </button>
              ))}
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
  )
}
