import { createRootRoute, Outlet, HeadContent, Scripts, Link } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { useEffect, useState } from 'react'
import { useThemeStore } from '../stores/theme-store'
import { ThemeScript } from '../components/theme-script'
import { QueryProvider } from '../lib/query-provider'
import '../styles.css'

export const Route = createRootRoute({
  notFoundComponent: NotFound,
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ],
    title: 'AwaitStep',
    links: [
      {
        rel: 'icon',
        href: '/favicon.ico',
      },
      {
        rel: 'stylesheet',
        href: 'https://cdn.jsdelivr.net/npm/geist@1/dist/fonts/geist-sans/style.css',
      },
    ],
  }),
  component: RootComponent,
})

function ClientToaster() {
  const [mounted, setMounted] = useState(false)
  const theme = useThemeStore((s) => s.theme)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return <Toaster theme={theme === 'light' ? 'light' : 'dark'} position="top-center" richColors />
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4">
      <h1 className="text-6xl font-bold tracking-tight">404</h1>
      <p className="text-muted-foreground">This page could not be found.</p>
      <Link to="/" className="mt-3 text-sm text-primary hover:underline hover:underline-offset-4">
        Go home
      </Link>
    </div>
  )
}

function RootComponent() {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen" suppressHydrationWarning>
        <ThemeScript />
        <QueryProvider>
          <Outlet />
          <ClientToaster />
        </QueryProvider>
        <Scripts />
      </body>
    </html>
  )
}
