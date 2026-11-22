import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { LandingPage } from '../components/landing/landing-page'
import { readInstance } from '../extensions/instance-features'
import { apiFetch } from '../lib/cf-context'
import { rootRedirect } from '../lib/feature-switches'

// What the instance switches off needs no session, so a signed-out visitor is asked too.
const getRootRedirect = createServerFn({ method: 'GET' }).handler(async () => {
  const { disabled } = await readInstance(apiFetch)
  return rootRedirect(disabled) ?? null
})

export const Route = createFileRoute('/')({
  // An instance on its own app host (AwaitStep Cloud) switches the landing page off.
  beforeLoad: async () => {
    const to = await getRootRedirect()
    if (to) throw redirect({ to })
  },
  head: () => ({
    meta: [
      { title: 'AwaitStep: Build & Run durable workflows' },
      {
        name: 'description',
        content:
          'Move long-running tasks out of your app. Draw them or write them in TypeScript, then test, deploy and watch every step run.',
      },
    ],
  }),
  component: LandingPage,
})
