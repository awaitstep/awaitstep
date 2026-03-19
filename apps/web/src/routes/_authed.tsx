import { createFileRoute, Outlet, Link, redirect, useMatches } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader, setCookie } from '@tanstack/react-start/server'
import { useEffect, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { useAuthStore, type SessionData } from '../stores/auth-store'
import { handleSignOut } from '../lib/auth-client'
import {
  LayoutDashboard,
  Workflow,
  Activity,
  Cable,
  HardDrive,
  ExternalLink,
  LogOut,
  User,
  Settings,
} from 'lucide-react'

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

  useEffect(() => {
    setSession(sessionData)
  }, [sessionData, setSession])

  if (isFullScreen) {
    return <Outlet />
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-screen-lg flex-1 px-8 py-6 pb-24">
        <Outlet />
      </main>
      <Dock email={sessionData.user.email} matches={matches} />
    </div>
  )
}

function Dock({ email, matches }: { email: string; matches: ReturnType<typeof useMatches> }) {
  const [userOpen, setUserOpen] = useState(false)

  return (
    <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
      <nav className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 shadow-lg">
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

        <a
          href="https://docs.awaitstep.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="group relative flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground/80"
        >
          <ExternalLink size={20} />
          <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-card px-2 py-1 text-[11px] font-medium text-foreground opacity-0 shadow-lg group-hover:opacity-100">
            Docs
          </span>
        </a>

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

