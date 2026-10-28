import { createFileRoute } from '@tanstack/react-router'
import { LegacyRedirect } from '../../components/navigation/legacy-redirect'

// The old workflow list: a workspace's Workflows page now.
export const Route = createFileRoute('/_authed/workflows/')({
  ssr: false,
  component: WorkflowsRedirect,
})

function WorkflowsRedirect() {
  return <LegacyRedirect page="workflows" />
}
