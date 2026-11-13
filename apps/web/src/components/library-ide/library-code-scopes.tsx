import type { ProjectSlugs, WorkspaceSlugs } from '../../lib/dashboard-paths'
import type { LibraryKind } from '../../lib/library-api'
import { useProjectScope } from '../project-settings/use-project-scope'
import { useWorkspaceScope } from '../workspaces/use-workspace-scope'
import { LibraryWorkspaceView } from './library-workspace'

interface OpenTarget {
  item?: string
  file?: string
  new?: LibraryKind
}

/** `/{org}/{project}/{workspace}/scripts-nodes/code`: a workspace's Scripts & nodes IDE. */
export function WorkspaceLibraryCode({
  slugs,
  open,
  onNewConsumed,
}: {
  slugs: WorkspaceSlugs
  open: OpenTarget
  onNewConsumed?: () => void
}) {
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
      initialNew={open.new}
      onNewConsumed={onNewConsumed}
    />
  )
}

/** `/{org}/{project}/scripts-nodes/code`: the project's own Scripts & nodes IDE. */
export function ProjectLibraryCode({
  slugs,
  open,
  onNewConsumed,
}: {
  slugs: ProjectSlugs
  open: OpenTarget
  onNewConsumed?: () => void
}) {
  const scope = useProjectScope(slugs)
  if (!scope) return null
  return (
    <LibraryWorkspaceView
      key={`${slugs.org}/${slugs.project}`}
      place={slugs}
      placeName={scope.project.project.name}
      initialItem={open.item}
      initialFile={open.file}
      initialNew={open.new}
      onNewConsumed={onNewConsumed}
    />
  )
}
