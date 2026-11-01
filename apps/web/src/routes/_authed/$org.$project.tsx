import { createFileRoute, Outlet } from '@tanstack/react-router'
import { rememberProject } from '../../components/navigation/scope-memory'

function remember({ params }: { params: { org: string; project: string } }) {
  rememberProject(params.org, params.project)
}

// Entering any of a project's pages, its workspaces' included, makes it the current project.
export const Route = createFileRoute('/_authed/$org/$project')({
  onEnter: remember,
  onStay: remember,
  component: Outlet,
})
