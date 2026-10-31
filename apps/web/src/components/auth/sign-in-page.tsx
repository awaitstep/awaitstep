import { useState, type SubmitEvent } from 'react'
import { Mail } from 'lucide-react'
import { toast } from 'sonner'
import { authClient } from '../../lib/auth-client'
import { getOrigin } from '../../lib/utils'
import { GitHubIcon, GoogleIcon } from '../icons/provider-icons'
import { AuthCard } from '../ui/auth-card'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { Separator } from '../ui/separator'
import { Tile } from '../ui/tile'
import { AuthLayout } from '../shell/auth-layout'

const FOOTER_LINKS = [{ label: 'Docs', href: 'https://docs.awaitstep.dev' }]

export interface AuthMethods {
  github: boolean
  google: boolean
  magicLink: boolean
}

interface SignInPageProps {
  /** Where to go after signing in; the old dashboard when none was saved (D-P9-1). */
  redirectPath: string | null
  /** The sign-in methods this instance turns on. */
  authMethods: AuthMethods
}

function checkError(res: { error?: { message?: string } | null }) {
  if (res.error) toast.error(res.error.message || 'Sign-in failed. Please try again.')
}

/**
 * `SignIn`: GitHub, Google and an email link. Real auth, the one W1 page not
 * on sample data; only its look changed.
 */
export function SignInPage({ redirectPath, authMethods }: SignInPageProps) {
  const hasOAuth = authMethods.github || authMethods.google
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const appURL = getOrigin()
  const callbackURL = redirectPath ? `${appURL}${redirectPath}` : `${appURL}/dashboard`
  const errorCallbackURL = `${appURL}/sign-in?error=true`

  function handleMagicLink(event: SubmitEvent) {
    event.preventDefault()
    setLoading(true)
    authClient.signIn
      .magicLink({ email, callbackURL, errorCallbackURL })
      .then((res) => {
        if (!res.error) setSentTo(email)
        return res
      })
      .then(checkError)
      .finally(() => setLoading(false))
  }

  function handleGitHub() {
    void authClient.signIn
      .social({ provider: 'github', callbackURL, errorCallbackURL })
      .then(checkError)
  }

  function handleGoogle() {
    void authClient.signIn
      .social({ provider: 'google', callbackURL, errorCallbackURL })
      .then(checkError)
  }

  function handleDifferentEmail() {
    setSentTo(null)
  }

  if (sentTo) {
    return (
      <AuthLayout footerLinks={FOOTER_LINKS}>
        <AuthCard
          width="sm"
          title="Check your email"
          lead={`We sent a sign-in link to ${sentTo}.`}
          actions={
            <Button type="button" variant="outline" onClick={handleDifferentEmail}>
              Use a different email
            </Button>
          }
        >
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
            <Tile tone="ok" size="sm">
              <Mail />
            </Tile>
            <span className="text-xs leading-relaxed text-muted-foreground">
              {/* Better Auth's magic link lasts 300 s; the board said 10 minutes. */}
              The link works once and expires in 5 minutes. Open it on this device.
            </span>
          </div>
        </AuthCard>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout footerLinks={FOOTER_LINKS}>
      <AuthCard
        width="sm"
        title="Sign in to AwaitStep"
        lead="Build durable workflows with your team."
      >
        {hasOAuth && (
          <div className="flex flex-col gap-2.5">
            {authMethods.github && (
              <Button type="button" variant="outline" className="w-full" onClick={handleGitHub}>
                <GitHubIcon className="size-4" />
                Continue with GitHub
              </Button>
            )}
            {authMethods.google && (
              <Button type="button" variant="outline" className="w-full" onClick={handleGoogle}>
                <GoogleIcon className="size-4" />
                Continue with Google
              </Button>
            )}
          </div>
        )}
        {hasOAuth && authMethods.magicLink && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" />
            or
            <Separator className="flex-1" />
          </div>
        )}
        {authMethods.magicLink && (
          <form onSubmit={handleMagicLink} className="flex flex-col gap-3.5">
            <FormField label="Work email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </FormField>
            <Button type="submit" disabled={loading || !email} className="w-full">
              {loading ? 'Sending…' : 'Email me a sign-in link'}
            </Button>
            <p className="text-2xs text-center text-muted-foreground">
              New here? Signing in creates your account.
            </p>
          </form>
        )}
        {!hasOAuth && !authMethods.magicLink && (
          <p className="text-sm text-muted-foreground">
            No sign-in methods are turned on. Check this instance’s environment variables.
          </p>
        )}
      </AuthCard>
    </AuthLayout>
  )
}
