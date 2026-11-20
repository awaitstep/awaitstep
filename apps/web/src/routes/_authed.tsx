import { createFileRoute, Navigate, Outlet, redirect, useMatches } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader, setCookie } from '@tanstack/react-start/server'
import { safeRedirectPath } from '../lib/auth-redirect'
import { apiFetch } from '../lib/cf-context'
import { sendsToDashboard } from '../lib/shell-routes'
import { useAuthStore } from '../stores/auth-store'
import { useInstanceStore } from '../stores/instance-store'
import { loadAuthData, type AuthData } from '../lib/auth-data'
import { useOrgStore } from '../stores/org-store'
import OrgWrapper from '../wrappers/org'

const getAuthData = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AuthData | null> => {
    const cookie = getRequestHeader('cookie')
    if (!cookie) return null
    return loadAuthData(apiFetch, cookie)
  },
)

const saveRedirectPath = createServerFn({ method: 'POST' })
  // Only an app path is ever saved, whoever calls this.
  .validator((data: string) => safeRedirectPath(data) ?? '/dashboard')
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
    const data = await getAuthData()
    if (!data) {
      await saveRedirectPath({ data: location.href })
      throw redirect({ to: '/sign-in' })
    }
    return data
  },
  staleTime: 5 * 60 * 1000,
  component: AuthedLayout,
})

function AuthedLayout() {
  const loaderData = Route.useLoaderData()
  const matches = useMatches()
  // An org created on /dashboard joins the store; the loader's list is up to 5 minutes old.
  const addedOrgs = useOrgStore((s) => s.organizations.length)

  useAuthStore.getState().setSession(loaderData.sessionData)
  useInstanceStore.getState().setInstance(loaderData)

  // The old pages need an organization: with none, /dashboard offers to make one (D-DB-7).
  if (sendsToDashboard(loaderData.organizations.length, addedOrgs, matches)) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <>
      <OrgWrapper organizations={loaderData.organizations} />
      <Outlet />
    </>
  )
}
