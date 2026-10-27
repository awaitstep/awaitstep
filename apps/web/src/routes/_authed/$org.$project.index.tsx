import { createFileRoute } from '@tanstack/react-router'
import { LandInWorkspace } from '../../components/navigation/land-in-workspace'

export const Route = createFileRoute('/_authed/$org/$project/')({
  component: ProjectLanding,
})

function ProjectLanding() {
  const params = Route.useParams()
  return <LandInWorkspace slugs={params} />
}
