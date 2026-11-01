import { useState, type ChangeEvent, type SubmitEvent } from 'react'
import { Mail } from 'lucide-react'
import { actionToast, failureLine } from '../../lib/action-toast'
import { ApiError } from '../../lib/api-client'
import { authClient } from '../../lib/auth-client'
import { isInvitePath, signInPath } from '../../lib/auth-redirect'
import { getOrigin } from '../../lib/utils'
import { GitHubIcon, GoogleIcon } from '../icons/provider-icons'
import { AuthCard } from '../ui/auth-card'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { Separator } from '../ui/separator'
import { Tile } from '../ui/tile'
import { AuthLayout } from '../shell/auth-layout'
import { SignInAlert } from './sign-in-alert'
import {
  clock,
  looksLikeEmail,
  problemCopy,
  problemFromCode,
  type SignInProblem,
} from './sign-in-problem'
import { useCountdown } from './use-countdown'

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
  /** Back from a provider or an email link that failed: the `?error=` code. */
  errorCode?: string
}

const SIGN_IN_FAILED = 'Sign-in failed. Please try again.'

/** better-auth's limiter names the wait in `X-Retry-After`; its magic-link window is a minute. */
const DEFAULT_RETRY_SECONDS = 60

interface AuthRefusal {
  message?: string
  status?: number
}

/**
 * `SignIn`: GitHub, Google and an email link. Real auth, the one W1 page not
 * on sample data; only its look changed.
 */
export function SignInPage({ redirectPath, authMethods, errorCode }: SignInPageProps) {
  const hasOAuth = authMethods.github || authMethods.google
  const forInvite = isInvitePath(redirectPath)
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [emailInvalid, setEmailInvalid] = useState(false)
  const [problem, setProblem] = useState<SignInProblem | null>(() => problemFromCode(errorCode))
  const lock = useCountdown()
  // The limit lifts by itself: when the clock runs out the alert goes too.
  const locked = problem?.kind === 'rate' && lock.remaining > 0
  const shown = problem?.kind === 'rate' && !locked ? null : problem

  const appURL = getOrigin()
  const callbackURL = redirectPath ? `${appURL}${redirectPath}` : `${appURL}/dashboard`
  // A failed link or provider comes back here, still knowing where the person was headed.
  const errorCallbackURL = `${appURL}${signInPath(redirectPath ?? undefined)}`

  // better-auth's refusal (with its status), or nothing for a lost connection.
  function fail(refusal?: AuthRefusal | null, retryAfter?: number) {
    const error = refusal ? new ApiError(refusal.message ?? '', refusal.status ?? 400) : null
    if (refusal?.status === 429) {
      lock.start(retryAfter && retryAfter > 0 ? retryAfter : DEFAULT_RETRY_SECONDS)
      setProblem({ kind: 'rate' })
    } else {
      setProblem({ kind: 'failed', detail: failureLine(error, SIGN_IN_FAILED) })
    }
    actionToast.error(failureLine(error, 'Couldn’t sign you in'))
  }

  function checkError(res: { error?: AuthRefusal | null }) {
    if (res.error) fail(res.error)
  }

  function handleEmailChange(event: ChangeEvent<HTMLInputElement>) {
    setEmail(event.target.value)
    setEmailInvalid(false)
  }

  function handleMagicLink(event: SubmitEvent) {
    event.preventDefault()
    if (locked) return
    if (!looksLikeEmail(email)) {
      setEmailInvalid(true)
      return
    }
    setLoading(true)
    setProblem(null)
    let retryAfter: number | undefined
    authClient.signIn
      .magicLink({
        email: email.trim(),
        callbackURL,
        errorCallbackURL,
        fetchOptions: {
          onError: (ctx) => {
            retryAfter = Number(ctx.response.headers.get('x-retry-after')) || undefined
          },
        },
      })
      .then((res) => {
        if (res.error) return fail(res.error, retryAfter)
        setSentTo(email.trim())
        actionToast.success('Sign-in link sent')
      })
      .catch(() => fail())
      .finally(() => setLoading(false))
  }

  // On success the browser leaves for the provider: nothing to toast.
  function handleSocial(provider: 'github' | 'google') {
    setProblem(null)
    authClient.signIn
      .social({ provider, callbackURL, errorCallbackURL })
      .then(checkError)
      .catch(() => fail())
  }

  function handleGitHub() {
    handleSocial('github')
  }

  function handleGoogle() {
    handleSocial('google')
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
          lead={`We sent a sign-in link to ${sentTo}.${forInvite ? ' Open it to accept your invitation.' : ''}`}
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
        title={forInvite ? 'Sign in to accept your invitation' : 'Sign in to AwaitStep'}
        lead={
          forInvite
            ? 'Use the email address the invite was sent to. You’ll come straight back to the invite.'
            : 'Build durable workflows with your team.'
        }
      >
        {shown && <SignInAlert {...problemCopy(shown, authMethods.magicLink)} />}
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
          <form onSubmit={handleMagicLink} noValidate className="flex flex-col gap-3.5">
            <FormField
              label="Work email"
              error={
                emailInvalid ? 'Enter a valid email address, like you@company.com.' : undefined
              }
            >
              <Input
                type="email"
                value={email}
                onChange={handleEmailChange}
                placeholder="you@company.com"
                required
              />
            </FormField>
            <Button type="submit" disabled={loading || locked || !email} className="w-full">
              {locked
                ? `Try again in ${clock(lock.remaining)}`
                : loading
                  ? 'Sending…'
                  : 'Email me a sign-in link'}
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
