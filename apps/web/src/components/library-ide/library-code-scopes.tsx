import type { ProjectSlugs, WorkspaceSlugs } from '../../lib/dashboard-paths'
import { useProjectScope } from '../project-settings/use-project-scope'
import { useWorkspaceScope } from '../workspaces/use-workspace-scope'
import { LibraryWorkspaceView } from './library-workspace'

interface OpenTarget {
  item?: string
  file?: string
}

/** `/{org}/{project}/{workspace}/library/code`: a workspace's Library IDE. */
export function WorkspaceLibraryCode({ slugs, open }: { slugs: WorkspaceSlugs; open: OpenTarget }) {
  const scope = useWorkspaceScope(slugs)
  if (!scope) return null
  return (
    <LibraryWorkspaceView
      // A new place is a new session: tabs, drafts and the first open start over.
      key={`${slugs.org}/${slugs.project}/${slugs.workspace}`}
      place={slugs}
      placeName={scope.workspace.workspace.name}
      initialItem={open.item}
      initialFile={open.file}
    />
  )
}

/** `/{org}/{project}/library/code`: the project's own Library IDE. */
export function ProjectLibraryCode({ slugs, open }: { slugs: ProjectSlugs; open: OpenTarget }) {
  const scope = useProjectScope(slugs)
  if (!scope) return null
  return (
    <LibraryWorkspaceView
      key={`${slugs.org}/${slugs.project}`}
      place={slugs}
      placeName={scope.project.project.name}
      initialItem={open.item}
      initialFile={open.file}
    />
  )
}
