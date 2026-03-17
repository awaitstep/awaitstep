import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'

const checkAuth = createServerFn({ method: 'GET' }).handler(
  async (): Promise<boolean> => {
    const cookie = getRequestHeader('cookie')
    if (!cookie) return false

    const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
    const res = await fetch(`${apiBase}/api/auth/get-session`, {
      headers: { cookie },
    })

    if (!res.ok) return false
    const data = await res.json()
    return !!data?.session
  },
)

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const authenticated = await checkAuth()
    if (authenticated) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: HomePage,
})

function HomePage() {
  return (
    <div className="flex min-h-screen items-start px-8 pt-32">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AwaitStep</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Visual workflow builder for Cloudflare Workflows
        </p>
        <div className="mt-6">
          <Link
            to="/sign-in"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </div>
    </div>
  )
}
