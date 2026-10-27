import { createFileRoute, Outlet } from '@tanstack/react-router'
import { rememberWorkspace } from '../../components/navigation/scope-memory'

function remember({ params }: { params: { org: string; project: string; workspace: string } }) {
  rememberWorkspace(params.org, params.project, params.workspace)
}

// Entering a workspace page makes it the one its project opens in next time.
export const Route = createFileRoute('/_authed/$org/$project/$workspace')({
  onEnter: remember,
  onStay: remember,
  component: Outlet,
})
