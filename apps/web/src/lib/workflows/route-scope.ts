import { useApiReady, useItemApiScope } from '../../contexts/api-client-context'
import type { WorkspaceSlugs } from '../dashboard-paths'
import type { ScopeLookup } from '../../types/dashboard/scope'

/** The ids a workflow's URL names: every call under it goes to this project. */
export interface ItemApiScope {
  organizationId: string
  projectId: string
  /** The URL's workspace: a workflow opened under another workspace's URL isn't shown there. */
  workspaceId: string
}

/** The ids behind a scope lookup, or null when it names no workspace the viewer can open. */
export function itemScopeFrom(scope: ScopeLookup | undefined): ItemApiScope | null {
  if (!scope?.found || !scope.project || !scope.workspace) return null
  return {
    organizationId: scope.org.org.id,
    projectId: scope.project.project.id,
    workspaceId: scope.workspace.workspace.id,
  }
}

/**
 * The ids behind a workspace URL's slugs, or null when the viewer can't open
 * that workspace (the dashboard shell then shows its not-found page).
 */
export async function resolveItemScope(
  slugs: WorkspaceSlugs,
  lookup: (slugs: WorkspaceSlugs) => Promise<ScopeLookup>,
): Promise<ItemApiScope | null> {
  return itemScopeFrom(await lookup(slugs))
}

/**
 * Whether a workflow lives in a different workspace than the URL names. The
 * API answers for any workflow in the project the caller can open, so a link
 * naming the wrong workspace would otherwise frame it, and act on it, there.
 * Shared items link through their own workspace, so no real link does this.
 */
export function isInOtherWorkspace(
  workflow: { workspaceId?: string } | undefined,
  workspaceId: string | undefined,
): boolean {
  return !!workflow?.workspaceId && !!workspaceId && workflow.workspaceId !== workspaceId
}

/** `isInOtherWorkspace` for the workflow URL this component is under. */
export function useInOtherWorkspace(workflow: { workspaceId?: string } | undefined): boolean {
  return isInOtherWorkspace(workflow, useItemApiScope()?.workspaceId)
}

/**
 * Whether calls here can go to a workflow URL's project: the app has loaded
 * and the URL names one (sample data and unknown scopes never do). The same
 * gate as the editor's `useApiReady`, so Overview and the canvas agree.
 */
export function useItemScopeReady(): boolean {
  const scoped = useItemApiScope() !== null
  return useApiReady() && scoped
}
