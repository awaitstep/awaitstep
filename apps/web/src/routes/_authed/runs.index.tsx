import { createFileRoute } from '@tanstack/react-router'
import { LegacyRedirect } from '../../components/navigation/legacy-redirect'

// The old runs list: a workspace's Runs page now.
export const Route = createFileRoute('/_authed/runs/')({
  ssr: false,
  component: RunsRedirect,
})

function RunsRedirect() {
  return <LegacyRedirect page="runs" />
}
