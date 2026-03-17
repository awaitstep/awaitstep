import { createRootRoute, Outlet, HeadContent, Scripts } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { useEffect, useState } from 'react'
import { useThemeStore } from '../stores/theme-store'
import { ThemeScript } from '../components/theme-script'
import '../styles.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchIntervalInBackground: false,
    },
  },
})

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?' +
  [
    'family=Outfit:wght@400;500;600;700',
    'family=Inter:wght@400;500;600',
    'family=IBM+Plex+Sans:wght@400;500;600',
    'family=DM+Sans:opsz@9..40&family=DM+Sans:wght@400;500;600',
    'family=Plus+Jakarta+Sans:wght@400;500;600;700',
  ].join('&') +
  '&display=swap'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ],
    title: 'AwaitStep',
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      { rel: 'stylesheet', href: GOOGLE_FONTS_URL },
      { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/npm/geist@1/dist/fonts/geist-sans/style.css' },
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

function RootComponent() {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen" suppressHydrationWarning>
        <ThemeScript />
        <QueryClientProvider client={queryClient}>
          <Outlet />
          <ClientToaster />
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
