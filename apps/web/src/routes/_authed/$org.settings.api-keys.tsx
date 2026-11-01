import { createFileRoute, redirect } from '@tanstack/react-router'

// API keys was an Org Settings section until it got its own rail item (API):
// old links and bookmarks land on the page, a ?new= dialog still open.
export const Route = createFileRoute('/_authed/$org/settings/api-keys')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$org/api-keys', params, search: true, replace: true })
  },
})
