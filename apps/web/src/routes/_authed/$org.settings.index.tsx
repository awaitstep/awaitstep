import { createFileRoute, redirect } from '@tanstack/react-router'

// Settings opens on its first section, General, as the rail's Settings does.
export const Route = createFileRoute('/_authed/$org/settings/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$org/settings/general', params: { org: params.org }, replace: true })
  },
})
