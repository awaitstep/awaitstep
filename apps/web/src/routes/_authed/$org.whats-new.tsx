import { createFileRoute, redirect } from '@tanstack/react-router'

// The overlay over Projects (D-P8-1), so old links keep working.
export const Route = createFileRoute('/_authed/$org/whats-new')({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: '/$org/projects',
      params,
      search: { ...search, open: 'whats-new' },
      replace: true,
    })
  },
})
