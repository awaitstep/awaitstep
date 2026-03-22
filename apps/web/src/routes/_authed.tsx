import { createFileRoute, Outlet, redirect, useMatches } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader, setCookie } from '@tanstack/react-start/server'
import { useAuthStore, type SessionData } from '../stores/auth-store'
import { useOrgStore, type Organization } from '../stores/org-store'
import { api } from '../lib/api-client'
import { Dock } from '../components/nav/dock'
import { ProjectDialog } from '../components/org/project-dialog'
import { OrgDialog } from '../components/org/org-dialog'
import { SetupDialog } from '../components/org/setup-dialog'

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

function hydrateStores(loaderData: LoaderData) {
  const store = useOrgStore.getState()

  store.setOrganizations(loaderData.organizations)

  if (loaderData.organizations.length === 0) {
    store.setAppReady(true)
    return
  }

  if (!store.activeOrganizationId || !loaderData.organizations.some((o) => o.id === store.activeOrganizationId)) {
    store.setActiveOrganization(loaderData.organizations[0].id)
  }

  if (store.projects.length > 0 && (!store.activeProjectId || !store.projects.some((p) => p.id === store.activeProjectId))) {
    store.setActiveProject(store.projects[0].id)
  }

  store.setAppReady(true)
}

function AuthedLayout() {
  const loaderData = Route.useLoaderData()
  const matches = useMatches()
  const isFullScreen = matches.some(
    (m) => m.routeId === '/_authed/workflows/$workflowId/canvas',
  )

  // Hydrate stores synchronously before render — no effect, no flash
  useAuthStore.getState().setSession(loaderData.sessionData)
  hydrateStores(loaderData)

  // Read appReady directly after hydration — hook would lag one render behind
  const appReady = useOrgStore.getState().appReady
  const needsSetup = useOrgStore((s) => s.organizations).length === 0
  const setProjects = useOrgStore((s) => s.setProjects)
  const setActiveOrg = useOrgStore((s) => s.setActiveOrganization)
  const setActiveProject = useOrgStore((s) => s.setActiveProject)

  if (isFullScreen) {
    return <Outlet />
  }

  async function handleSwitchOrg(orgId: string) {
    setActiveOrg(orgId)
    const projectData = await api.listProjects()
    setProjects(projectData)
    if (projectData.length > 0) setActiveProject(projectData[0].id)
  }

  function handleSwitchProject(projectId: string) {
    setActiveProject(projectId)
  }

  if (!appReady) {
    return null
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-screen-lg flex-1 px-8 py-6 pb-24">
        <Outlet />
      </main>
      {!needsSetup && (
        <Dock
          email={loaderData.sessionData.user.email}
          onSwitchOrg={handleSwitchOrg}
          onSwitchProject={handleSwitchProject}
        />
      )}
      <ProjectDialog />
      <OrgDialog />
      <SetupDialog open={needsSetup} />
    </div>
  )
}
