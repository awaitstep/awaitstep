import { createFileRoute, Outlet, redirect, useMatches } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader, setCookie } from '@tanstack/react-start/server'
import { useAuthStore, type SessionData } from '../stores/auth-store'
import { type Organization } from '../stores/org-store'
import OrgWrapper from '../wrappers/org'
import { Dock } from '../components/nav/dock'

interface LoaderData {
  sessionData: SessionData
  organizations: Organization[]
}

const getAuthData = createServerFn({ method: 'GET' }).handler(
  async (): Promise<LoaderData | null> => {
    const cookie = getRequestHeader('cookie')
    if (!cookie) return null

    const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
    const headers = { cookie }

    const sessionRes = await fetch(`${apiBase}/api/auth/get-session`, { headers })
    if (!sessionRes.ok) return null

    const sessionData = await sessionRes.json()
    if (!sessionData?.session) return null

    const orgsRes = await fetch(`${apiBase}/api/auth/organization/list`, { headers })
    const orgsBody = orgsRes.ok ? await orgsRes.json() : []
    const organizations: Organization[] = Array.isArray(orgsBody) ? orgsBody : []

    return { sessionData: sessionData as SessionData, organizations }
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
  const isCanvasPage = matches.some(
    (m) => m.routeId === '/_authed/workflows/$workflowId/canvas',
  )

  useAuthStore.getState().setSession(loaderData.sessionData)

  if (isCanvasPage) {
    return (
      <>
        <OrgWrapper organizations={loaderData.organizations} />

        <Outlet />
      </>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <OrgWrapper organizations={loaderData.organizations} />
      <main className="mx-auto w-full max-w-screen-lg flex-1 px-8 py-6 pb-24">
        <Outlet />
      </main>
      {loaderData.organizations.length !== 0 && (
        <Dock
          email={loaderData.sessionData.user.email}
        />
      )}
    </div>
  )
}
