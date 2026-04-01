import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getCookie, getRequestHeader, deleteCookie } from '@tanstack/react-start/server'
import { useState } from 'react'
import { getApiBase } from '../lib/server-config'
import { authClient } from '../lib/auth-client'
import { GitHubIcon, GoogleIcon } from '../components/icons/provider-icons'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Separator } from '../components/ui/separator'
import { getOrigin } from '../lib/utils'

interface SignInContext {
  authenticated: boolean
  redirectPath: string | null
  authMethods: { github: boolean; google: boolean; magicLink: boolean }
}

const getSignInContext = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SignInContext> => {
    const redirectPath = getCookie('auth_redirect') ?? null

    const authMethods = {
      github: !!process.env['GITHUB_CLIENT_ID'],
      google: !!process.env['GOOGLE_CLIENT_ID'],
      magicLink: !!process.env['RESEND_API_KEY'],
    }

    const cookie = getRequestHeader('cookie')
    if (!cookie) return { authenticated: false, redirectPath, authMethods }

    const apiBase = getApiBase()
    const res = await fetch(`${apiBase}/api/auth/get-session`, {
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
  beforeLoad: async () => {
    const { authenticated, redirectPath, authMethods } = await getSignInContext()
    if (authenticated) {
      throw redirect({ href: redirectPath || '/dashboard' })
    }
    return { redirectPath, authMethods }
  },
  component: SignInPage,
})

function SignInPage() {
  const { redirectPath, authMethods } = Route.useRouteContext()
  const hasOAuth = authMethods.github || authMethods.google
  const [email, setEmail] = useState('')
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const appURL = getOrigin()
  const callbackURL = redirectPath ? `${appURL}${redirectPath}` : `${appURL}/dashboard`
  const errorCallbackURL = `${appURL}/sign-in?error=true`

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await authClient.signIn.magicLink({ email, callbackURL })
      setMagicLinkSent(true)
    } catch {
      setError('Failed to send magic link. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleGitHub = () =>
    authClient.signIn.social({ provider: 'github', callbackURL, errorCallbackURL })

  const handleGoogle = () =>
    authClient.signIn.social({ provider: 'google', callbackURL, errorCallbackURL })

  if (magicLinkSent) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="rounded-md border border-border bg-card p-8">
            <h2 className="text-base font-semibold">Check your email</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a sign-in link to <span className="font-medium text-foreground">{email}</span>
            </p>
            <Button variant="ghost" className="mt-6" onClick={() => setMagicLinkSent(false)}>
              Use a different email
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-xs space-y-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold tracking-tight">Sign in to AwaitStep</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Build and deploy Cloudflare Workflows visually
          </p>
        </div>

        {hasOAuth && (
          <div className="space-y-3">
            {authMethods.github && (
              <Button variant="outline" className="w-full" onClick={handleGitHub}>
                <GitHubIcon className="h-5 w-5" />
                Continue with GitHub
              </Button>
            )}

            {authMethods.google && (
              <Button variant="outline" className="w-full" onClick={handleGoogle}>
                <GoogleIcon className="h-5 w-5" />
                Continue with Google
              </Button>
            )}
          </div>
        )}

        {hasOAuth && authMethods.magicLink && (
          <div className="relative flex items-center">
            <Separator className="flex-1" />
            <span className="px-4 text-sm text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>
        )}

        {authMethods.magicLink && (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            {error && <p className="text-sm text-center text-destructive">{error}</p>}

            <Button type="submit" disabled={loading || !email} className="w-full">
              {loading ? 'Sending...' : 'Send magic link'}
            </Button>
          </form>
        )}

        {!hasOAuth && !authMethods.magicLink && (
          <p className="text-center text-sm text-muted-foreground">
            No sign-in methods configured. Check your instance's environment variables.
          </p>
        )}
      </div>
    </div>
  )
}
