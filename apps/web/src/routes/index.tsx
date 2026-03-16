import { createFileRoute, Link } from '@tanstack/react-router'
import { useSession } from '../lib/auth-client'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const { data: session } = useSession()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight">AwaitStep</h1>
        <p className="mt-4 text-lg text-zinc-400">
          Visual workflow builder for Cloudflare Workflows
        </p>
        <div className="mt-8">
          {session ? (
            <Link
              to="/dashboard"
              className="rounded-lg bg-white px-6 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-200 transition-colors"
            >
              Go to Dashboard
            </Link>
          ) : (
            <Link
              to="/sign-in"
              className="rounded-lg bg-white px-6 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-200 transition-colors"
            >
              Get Started
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
