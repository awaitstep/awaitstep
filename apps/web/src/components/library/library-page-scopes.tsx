import type { ProjectSlugs, WorkspaceSlugs } from '../../lib/dashboard-paths'
import { useProjectScope } from '../project-settings/use-project-scope'
import { useWorkspaceScope } from '../workspaces/use-workspace-scope'
import { LibraryPage } from './library-page'

/** `/{org}/{project}/{workspace}/library` (28a). */
export function WorkspaceLibraryPage({ slugs }: { slugs: WorkspaceSlugs }) {
  const scope = useWorkspaceScope(slugs)
  if (!scope) return null
  return (
    <LibraryPage
      place={slugs}
      placeName={scope.workspace.workspace.name}
      projectName={scope.project.project.name}
    />
  )
}

/** `/{org}/{project}/library` (28b): the project's own library. */
export function ProjectLibraryPage({ slugs }: { slugs: ProjectSlugs }) {
  const scope = useProjectScope(slugs)
  if (!scope) return null
  const name = scope.project.project.name
  return <LibraryPage place={slugs} placeName={name} projectName={name} />
}
