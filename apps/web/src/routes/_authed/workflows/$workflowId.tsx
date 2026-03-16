import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/workflows/$workflowId')({
  component: WorkflowLayout,
})

function WorkflowLayout() {
  return <Outlet />
}
