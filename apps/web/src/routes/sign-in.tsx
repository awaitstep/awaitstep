import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Mail, Github } from 'lucide-react'
import { authClient } from '../lib/auth-client'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Separator } from '../components/ui/separator'

export const Route = createFileRoute('/sign-in')({
  component: SignInPage,
})

function SignInPage() {
  const [email, setEmail] = useState('')
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const appURL = import.meta.env.VITE_APP_URL ?? 'http://localhost:3000'
  const callbackURL = `${appURL}/dashboard`
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
          <div className="rounded-xl border border-border bg-card p-8">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Check your email</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a sign-in link to{' '}
              <span className="font-medium text-foreground">{email}</span>
            </p>
            <Button
              variant="ghost"
              className="mt-6"
              onClick={() => setMagicLinkSent(false)}
            >
              Use a different email
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Sign in to AwaitStep</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Build and deploy Cloudflare Workflows visually
          </p>
        </div>

        <div className="space-y-3">
          <Button variant="outline" className="w-full" onClick={handleGitHub}>
            <Github className="h-5 w-5" />
            Continue with GitHub
          </Button>

          <Button variant="outline" className="w-full" onClick={handleGoogle}>
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </Button>
        </div>

        <div className="relative flex items-center">
          <Separator className="flex-1" />
          <span className="px-4 text-sm text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>

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

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={loading || !email} className="w-full">
            {loading ? 'Sending...' : 'Send magic link'}
          </Button>
        </form>
      </div>
    </div>
  )
}
