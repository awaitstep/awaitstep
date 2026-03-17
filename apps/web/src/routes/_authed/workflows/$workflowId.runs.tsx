import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/workflows/$workflowId/runs')({
  component: RunsLayout,
})

function RunsLayout() {
  return <Outlet />
}
