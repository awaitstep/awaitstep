import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getCookie, getRequestHeader, deleteCookie } from '@tanstack/react-start/server'
import { apiFetch } from '../lib/cf-context'
import { safeRedirectPath } from '../lib/auth-redirect'
import { SignInPage, type AuthMethods } from '../components/auth/sign-in-page'

interface SignInContext {
  authenticated: boolean
  redirectPath: string | null
  authMethods: AuthMethods
}

const getSignInContext = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SignInContext> => {
    // The cookie is readable and writable by script: only an app path is followed.
    const redirectPath = safeRedirectPath(getCookie('auth_redirect')) ?? null

    const authMethods = {
      github: process.env['GITHUB_ENABLED'] === 'true' || !!process.env['GITHUB_CLIENT_ID'],
      google: process.env['GOOGLE_ENABLED'] === 'true' || !!process.env['GOOGLE_CLIENT_ID'],
      magicLink: process.env['MAGIC_LINK_ENABLED'] === 'true' || !!process.env['RESEND_API_KEY'],
    }

    const cookie = getRequestHeader('cookie')
    if (!cookie) return { authenticated: false, redirectPath, authMethods }

    const res = await apiFetch('/api/auth/get-session', {
      headers: { cookie },
    })

    if (!res.ok) return { authenticated: false, redirectPath, authMethods }

    const data = await res.json()
    if (!data?.session) return { authenticated: false, redirectPath, authMethods }

    // Authenticated — clean up the cookie before redirecting
    if (redirectPath) {
      deleteCookie('auth_redirect', { path: '/' })
    }
    return { authenticated: true, redirectPath, authMethods }
  },
)

export const Route = createFileRoute('/sign-in')({
  head: () => ({ meta: [{ title: 'Sign In | AwaitStep' }] }),
  // ?redirect= (an app path, e.g. back to an invite after switching account) wins over the cookie.
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: safeRedirectPath(search['redirect']),
  }),
  beforeLoad: async ({ search }) => {
    const context = await getSignInContext()
    const redirectPath = search.redirect ?? context.redirectPath
    if (context.authenticated) {
      throw redirect({ href: redirectPath || '/dashboard' })
    }
    return { redirectPath, authMethods: context.authMethods }
  },
  component: SignInRoute,
})

function SignInRoute() {
  const { redirectPath, authMethods } = Route.useRouteContext()
  return <SignInPage redirectPath={redirectPath} authMethods={authMethods} />
}
