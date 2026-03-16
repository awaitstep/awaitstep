import { createFileRoute, Outlet, Link, useMatches } from '@tanstack/react-router'
import { useSession, signOut } from '../lib/auth-client'

export const Route = createFileRoute('/_authed')({
  component: AuthedLayout,
})

function AuthedLayout() {
  const { data: session, isPending } = useSession()
  const matches = useMatches()
  const isFullScreen = matches.some(
    (m) => m.routeId === '/_authed/workflows/$workflowId/' || m.routeId === '/_authed/workflows/$workflowId/deployments',
  )

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-zinc-400">Loading...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400">You need to sign in to access this page.</p>
          <Link to="/sign-in" className="mt-4 inline-block text-sm text-white underline">
            Sign in
          </Link>
        </div>
      </div>
    )
  }

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
            <span className="text-xs text-white/40">{session.user.email}</span>
            <button
              onClick={() => signOut()}
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
