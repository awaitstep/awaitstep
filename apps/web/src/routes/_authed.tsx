import { createFileRoute, Outlet, Link, redirect, useMatches } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader, setCookie } from '@tanstack/react-start/server'
import { useEffect } from 'react'
import { useAuthStore, type SessionData } from '../stores/auth-store'
import { handleSignOut } from '../lib/auth-client'

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
  beforeLoad: async ({ location }) => {
    const sessionData = await getSessionOnServer()
    if (!sessionData) {
      await saveRedirectPath({ data: location.href })
      throw redirect({ to: '/sign-in' })
    }
    return { sessionData }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  const { sessionData } = Route.useRouteContext()
  const setSession = useAuthStore((s) => s.setSession)
  const matches = useMatches()
  const isFullScreen = matches.some(
    (m) => m.routeId === '/_authed/workflows/$workflowId/' || m.routeId === '/_authed/workflows/$workflowId/deployments',
  )

  useEffect(() => {
    setSession(sessionData)
  }, [sessionData, setSession])

  if (isFullScreen) {
    return <Outlet />
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.06] bg-[oklch(0.13_0_0)]">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link to="/dashboard" className="text-sm font-semibold tracking-tight text-white">
            AwaitStep
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/40">{sessionData.user.email}</span>
            <button
              onClick={() => handleSignOut()}
              className="text-xs text-white/30 transition-colors hover:text-white/60"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
