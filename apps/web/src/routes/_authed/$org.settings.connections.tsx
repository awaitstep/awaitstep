import { createFileRoute, redirect } from '@tanstack/react-router'

// Connections was an Org Settings section until it got its own rail item:
// old links and bookmarks land on the page, a ?new= dialog still open.
export const Route = createFileRoute('/_authed/$org/settings/connections')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$org/connections', params, search: true, replace: true })
  },
})
