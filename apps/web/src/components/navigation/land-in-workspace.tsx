import { Navigate } from '@tanstack/react-router'
import { useWorkspaces } from '../../data/dashboard/workspaces'
import { projectSettingsPath, workspacePath, type ProjectSlugs } from '../../lib/dashboard-paths'
import { LoadError } from '../ui/load-error'
import { Bone, LoadingRegion } from '../ui/skeletons'
import { PageBody } from '../shell/page-intro'
import { recentWorkspaces } from './scope-memory'

/**
 * Where opening a project goes: the most recent workspace the viewer can
 * still open, else the first one. With none to open, null.
 */
export function pickWorkspace(
  available: readonly string[],
  recent: readonly string[],
): string | null {
  return recent.find((slug) => available.includes(slug)) ?? available[0] ?? null
}

/** `/{org}/{project}`: replaces itself with the workspace to land in. */
export function LandInWorkspace({ slugs }: { slugs: ProjectSlugs }) {
  const workspaces = useWorkspaces(slugs.org, slugs.project)

  function handleRetry() {
    void workspaces.refetch()
  }

  if (workspaces.isError) {
    return (
      <PageBody>
        <LoadError
          title="We couldn’t open the project"
          detail="Its workspaces didn’t load. Nothing was changed."
          onRetry={handleRetry}
          retrying={workspaces.isFetching}
        />
      </PageBody>
    )
  }

  if (!workspaces.data) {
    return (
      <PageBody>
        <LoadingRegion label="Opening the project">
          <Bone className="h-8 w-48" />
        </LoadingRegion>
      </PageBody>
    )
  }

  const slug = pickWorkspace(
    workspaces.data.map((workspace) => workspace.slug),
    recentWorkspaces(slugs.org, slugs.project),
  )
  const to = slug ? workspacePath({ ...slugs, workspace: slug }) : projectSettingsPath(slugs)
  return <Navigate to={to} replace />
}
