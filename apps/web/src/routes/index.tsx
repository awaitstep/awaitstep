import { createFileRoute } from '@tanstack/react-router'
import { LandingPage } from '../components/landing/landing-page'

export const Route = createFileRoute('/')({
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
